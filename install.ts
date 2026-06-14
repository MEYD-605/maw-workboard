import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

import {
  assertRequiredServerFeatures,
  detectServerFeatures,
  detectServerFeaturesFromBinary,
} from "./features";
import type { WorkboardOptions } from "./impl-helpers";
import { resolveSourceDir } from "./impl-helpers";
import { captureCommand, runCommand } from "./process";
import {
  versionsDir,
  writeInstallManifest,
  type WorkboardInstallManifest,
} from "./state";

interface PrebuiltLayout {
  root: string;
  server: string;
  client: string;
  buildDir: string;
  sumsFile: string;
}

function validateSourceDir(sourceDir: string): void {
  if (!existsSync(join(sourceDir, "Cargo.toml"))) {
    throw new Error(`maw board install: source is not an sshx checkout (missing Cargo.toml): ${sourceDir}`);
  }
  if (!existsSync(join(sourceDir, "package.json"))) {
    throw new Error(`maw board install: source is missing package.json: ${sourceDir}`);
  }
}

function sha256File(path: string): string {
  const hasher = createHash("sha256");
  hasher.update(readFileSync(path));
  return `sha256:${hasher.digest("hex")}`;
}

function sha256FileHex(path: string): string {
  return sha256File(path).replace(/^sha256:/, "");
}

function sanitizeInstallId(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "prebuilt";
}

function listFilesRecursive(root: string, prefix = ""): string[] {
  const entries = readdirSync(join(root, prefix), { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(root, rel));
    } else if (entry.isFile()) {
      files.push(rel);
    }
  }
  return files;
}

function assertSafeRelativePath(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")) {
    throw new Error(`maw board install: unsafe SHA256SUMS path: ${path}`);
  }
  return normalized;
}

function parseSha256Sums(path: string): Map<string, string> {
  const sums = new Map<string, string>();
  for (const [index, raw] of readFileSync(path, "utf8").split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([a-fA-F0-9]{64})\s+[* ]?(.+)$/);
    if (!match) {
      throw new Error(`maw board install: invalid SHA256SUMS line ${index + 1}: ${raw}`);
    }
    sums.set(assertSafeRelativePath(match[2].trim()), match[1].toLowerCase());
  }
  return sums;
}

function verifySha256Sums(layout: PrebuiltLayout): void {
  const sums = parseSha256Sums(layout.sumsFile);
  const required = ["bin/sshx-server", "bin/sshx", ...listFilesRecursive(layout.buildDir, "").map((file) => `build/${file}`)];
  if (required.length <= 2) {
    throw new Error("maw board install: prebuilt build/ directory is empty");
  }

  for (const rel of required) {
    const expected = sums.get(rel);
    if (!expected) {
      throw new Error(`maw board install: SHA256SUMS is missing ${rel}`);
    }
    const actual = sha256FileHex(join(layout.root, rel));
    if (actual !== expected) {
      throw new Error(`maw board install: checksum mismatch for ${rel}`);
    }
  }

  for (const rel of sums.keys()) {
    const full = join(layout.root, rel);
    if (!existsSync(full)) {
      throw new Error(`maw board install: SHA256SUMS references missing file ${rel}`);
    }
  }
}

function locatePrebuiltRoot(extractedDir: string): string {
  if (existsSync(join(extractedDir, "bin", "sshx-server"))) return extractedDir;
  const children = readdirSync(extractedDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  for (const child of children) {
    const candidate = join(extractedDir, child.name);
    if (existsSync(join(candidate, "bin", "sshx-server"))) return candidate;
  }
  throw new Error("maw board install: prebuilt bundle must contain bin/sshx-server, bin/sshx, build/, and SHA256SUMS");
}

function extractPrebuiltIfNeeded(prebuilt: string): { root: string; cleanup?: string } {
  const input = resolve(prebuilt);
  if (!existsSync(input)) {
    throw new Error(`maw board install: --prebuilt path does not exist: ${input}`);
  }
  if (statSync(input).isDirectory()) {
    return { root: locatePrebuiltRoot(input) };
  }

  const temp = mkdtempSync(join(tmpdir(), "maw-workboard-prebuilt-"));
  try {
    runCommand("tar", ["-xf", input, "-C", temp], {
      cwd: temp,
      label: "prebuilt extract",
    });
    return { root: locatePrebuiltRoot(temp), cleanup: temp };
  } catch (error) {
    rmSync(temp, { recursive: true, force: true });
    throw error;
  }
}

function validatePrebuiltLayout(root: string): PrebuiltLayout {
  const layout: PrebuiltLayout = {
    root,
    server: join(root, "bin", "sshx-server"),
    client: join(root, "bin", "sshx"),
    buildDir: join(root, "build"),
    sumsFile: join(root, "SHA256SUMS"),
  };
  for (const path of [layout.server, layout.client, layout.buildDir, layout.sumsFile]) {
    if (!existsSync(path)) {
      throw new Error(`maw board install: prebuilt artifact missing: ${path}`);
    }
  }
  if (!statSync(layout.buildDir).isDirectory()) {
    throw new Error(`maw board install: prebuilt build path is not a directory: ${layout.buildDir}`);
  }
  verifySha256Sums(layout);
  return layout;
}

function currentGitInfo(sourceDir: string): { gitRef: string; gitSha: string } {
  const gitSha = captureCommand("git", ["rev-parse", "HEAD"], sourceDir);
  const gitRef = captureCommand("git", ["rev-parse", "--short", "HEAD"], sourceDir);
  return { gitRef, gitSha };
}

function verifyRequestedRef(sourceDir: string, requestedRef: string | undefined, currentSha: string): void {
  if (!requestedRef) return;
  const requestedSha = captureCommand("git", ["rev-parse", requestedRef], sourceDir);
  if (requestedSha !== currentSha) {
    throw new Error(
      `maw board install: --version ${requestedRef} resolves to ${requestedSha.slice(0, 12)}, ` +
        `but source checkout is at ${currentSha.slice(0, 12)}. Checkout the source first; install will not mutate it.`,
    );
  }
}

function writeManifest(manifest: WorkboardInstallManifest): void {
  writeInstallManifest(manifest);

  console.log([
    "",
    "Install complete",
    `install: ${manifest.installDir}`,
    `server:  ${manifest.paths.server}`,
    `client:  ${manifest.paths.client}`,
    `build:   ${manifest.paths.buildDir}`,
    `sha256:  ${manifest.sha256.server}`,
  ].join("\n"));
}

function copyRuntimeArtifacts(
  installDir: string,
  serverSource: string,
  clientSource: string,
  frontendSource: string,
): { binDir: string; buildDir: string } {
  const binDir = join(installDir, "bin");
  const buildDir = join(installDir, "build");
  rmSync(installDir, { recursive: true, force: true });
  mkdirSync(binDir, { recursive: true, mode: 0o755 });
  cpSync(frontendSource, buildDir, { recursive: true });
  copyFileSync(serverSource, join(binDir, basename(serverSource)));
  copyFileSync(clientSource, join(binDir, basename(clientSource)));
  chmodSync(join(binDir, "sshx-server"), 0o755);
  chmodSync(join(binDir, "sshx"), 0o755);
  return { binDir, buildDir };
}

async function cmdWorkboardInstallPrebuilt(opts: WorkboardOptions): Promise<void> {
  if (!opts.prebuilt) {
    throw new Error("maw board install: --prebuilt requires a directory or tarball path");
  }
  const extracted = extractPrebuiltIfNeeded(opts.prebuilt);
  try {
    const layout = validatePrebuiltLayout(extracted.root);
    const serverFeatures = detectServerFeaturesFromBinary(layout.server);
    assertRequiredServerFeatures(serverFeatures, layout.server);

    const serverHash = sha256FileHex(layout.server);
    const clientHash = sha256FileHex(layout.client);
    const gitRef = sanitizeInstallId(opts.version ?? `prebuilt-${serverHash.slice(0, 12)}`);
    const gitSha = serverHash;
    const installName = `${gitRef}-${process.platform}-${process.arch}`;
    const installDir = join(versionsDir(), installName);

    console.log([
      "Oracle Workboard prebuilt install",
      `prebuilt: ${resolve(opts.prebuilt)}`,
      `root:     ${layout.root}`,
      `ref:      ${gitRef}`,
      `target:   ${installDir}`,
      "",
      "Verifying SHA256SUMS...",
      "Copying prebuilt artifacts...",
    ].join("\n"));

    const { buildDir } = copyRuntimeArtifacts(installDir, layout.server, layout.client, layout.buildDir);

    const manifest: WorkboardInstallManifest = {
      schemaVersion: 1,
      installedAt: new Date().toISOString(),
      installKind: "prebuilt",
      sourceDir: `prebuilt:${gitRef}`,
      prebuiltSource: resolve(opts.prebuilt),
      requestedRef: opts.version,
      gitRef,
      gitSha,
      installDir,
      platform: process.platform,
      arch: process.arch,
      paths: {
        server: join(installDir, "bin", "sshx-server"),
        client: join(installDir, "bin", "sshx"),
        buildDir,
      },
      serverFeatures,
      sha256: {
        server: `sha256:${serverHash}`,
        client: `sha256:${clientHash}`,
      },
    };
    writeManifest(manifest);
  } finally {
    if (extracted.cleanup) rmSync(extracted.cleanup, { recursive: true, force: true });
  }
}

export async function cmdWorkboardInstall(opts: WorkboardOptions): Promise<void> {
  if (opts.prebuilt) {
    await cmdWorkboardInstallPrebuilt(opts);
    return;
  }

  const sourceDir = resolveSourceDir(opts);
  validateSourceDir(sourceDir);
  const { gitRef, gitSha } = currentGitInfo(sourceDir);
  verifyRequestedRef(sourceDir, opts.version, gitSha);
  const serverFeatures = detectServerFeatures(sourceDir);
  assertRequiredServerFeatures(serverFeatures, sourceDir);

  const installName = `${gitRef}-${process.platform}-${process.arch}`;
  const installDir = join(versionsDir(), installName);

  console.log([
    "Oracle Workboard install",
    `source:  ${sourceDir}`,
    `ref:     ${opts.version ?? gitRef}`,
    `target:  ${installDir}`,
    "",
    "Building frontend...",
  ].join("\n"));

  runCommand("npm", ["run", "build"], {
    cwd: sourceDir,
    label: "frontend build",
  });

  console.log("Building release binaries...");
  runCommand("cargo", ["build", "--release", "-p", "sshx-server", "-p", "sshx"], {
    cwd: sourceDir,
    label: "cargo release build",
  });

  const serverSource = join(sourceDir, "target", "release", "sshx-server");
  const clientSource = join(sourceDir, "target", "release", "sshx");
  const frontendSource = join(sourceDir, "build");
  for (const path of [serverSource, clientSource, frontendSource]) {
    if (!existsSync(path)) {
      throw new Error(`maw board install: expected build artifact missing: ${path}`);
    }
  }

  const { binDir, buildDir } = copyRuntimeArtifacts(installDir, serverSource, clientSource, frontendSource);

  const manifest: WorkboardInstallManifest = {
    schemaVersion: 1,
    installedAt: new Date().toISOString(),
    installKind: "source",
    sourceDir,
    requestedRef: opts.version,
    gitRef,
    gitSha,
    installDir,
    platform: process.platform,
    arch: process.arch,
    paths: {
      server: join(binDir, "sshx-server"),
      client: join(binDir, "sshx"),
      buildDir,
    },
    serverFeatures,
    sha256: {
      server: sha256File(join(binDir, "sshx-server")),
      client: sha256File(join(binDir, "sshx")),
    },
  };
  writeManifest(manifest);
}

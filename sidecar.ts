import { spawn } from "node:child_process";
import {
  closeSync,
  existsSync,
  openSync,
} from "node:fs";
import { join } from "node:path";

import {
  assertRequiredServerFeatures,
  detectServerFeatures,
  type WorkboardServerFeatures,
} from "./features";
import type { WorkboardOptions } from "./impl-helpers";
import {
  buildWorkboardOrigin,
  buildWorkboardUrl,
  DEFAULT_WORKBOARD_HOST,
  DEFAULT_WORKBOARD_PORT,
  resolveSourceDir,
  resolveUrlFile,
} from "./impl-helpers";
import {
  isPidAlive,
  logPath,
  readCurrentInstall,
  readPid,
  readRuntimeState,
  readTextIfExists,
  removePid,
  writePid,
  writePrivateText,
  writeRuntimeState,
} from "./state";

export interface WorkboardSidecarResult {
  sourceDir: string;
  runtimeMode: "dev" | "installed";
  installDir?: string;
  installRef?: string;
  origin: string;
  goUrl: string;
  boardUrl: string;
  urlFile: string;
  serverPid?: number;
  clientPid?: number;
  serverStarted: boolean;
  clientStarted: boolean;
}

interface WorkboardRuntime {
  mode: "dev" | "installed";
  sourceDir: string;
  cwd: string;
  serverCommand: string;
  serverArgs: string[];
  clientCommand: string;
  clientArgs: string[];
  installDir?: string;
  installRef?: string;
  serverFeatures: WorkboardServerFeatures;
}

function envWithPassword(opts: WorkboardOptions, urlFile: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, SSHX_ORACLE_URL_FILE: urlFile };
  if (opts.password !== undefined) {
    env.SSHX_BOARD_PASSWORD = opts.password;
  }
  return env;
}

function validateSourceDir(sourceDir: string): void {
  if (!existsSync(join(sourceDir, "Cargo.toml"))) {
    throw new Error(`maw board: source is not an sshx checkout (missing Cargo.toml): ${sourceDir}`);
  }
}

function resolveRuntime(opts: WorkboardOptions, origin: string, urlFile: string): WorkboardRuntime {
  if (opts.dev) {
    const sourceDir = resolveSourceDir(opts);
    validateSourceDir(sourceDir);
    const serverFeatures = detectServerFeatures(sourceDir);
    assertRequiredServerFeatures(serverFeatures, sourceDir);
    return {
      mode: "dev",
      sourceDir,
      cwd: sourceDir,
      serverCommand: "cargo",
      serverArgs: [
        "run",
        "--quiet",
        "-p",
        "sshx-server",
        "--",
        "--listen",
        opts.host ?? DEFAULT_WORKBOARD_HOST,
        "--port",
        String(opts.port ?? DEFAULT_WORKBOARD_PORT),
        "--override-origin",
        origin,
        "--oracle-url-file",
        urlFile,
        "--static-dir",
        join(sourceDir, "build"),
      ],
      clientCommand: "cargo",
      clientArgs: [
        "run",
        "--quiet",
        "-p",
        "sshx",
        "--",
        "--server",
        origin,
        "--quiet",
        "--name",
        "Oracle Board",
      ],
      serverFeatures,
    };
  }

  const install = readCurrentInstall();
  if (!install) {
    throw new Error("maw board: no installed workboard runtime; run 'maw board install' or use '--dev --source <sshx repo>'");
  }
  for (const path of [install.paths.server, install.paths.client, install.paths.buildDir]) {
    if (!existsSync(path)) {
      throw new Error(`maw board: installed runtime is incomplete; missing ${path}. Re-run 'maw board install'.`);
    }
  }
  assertRequiredServerFeatures(install.serverFeatures, `${install.installDir}/install.json`);

  return {
    mode: "installed",
    sourceDir: install.sourceDir,
    cwd: install.installDir,
    serverCommand: install.paths.server,
    serverArgs: [
      "--listen",
      opts.host ?? DEFAULT_WORKBOARD_HOST,
      "--port",
      String(opts.port ?? DEFAULT_WORKBOARD_PORT),
      "--override-origin",
      origin,
      "--oracle-url-file",
      urlFile,
      "--static-dir",
      install.paths.buildDir,
    ],
    clientCommand: install.paths.client,
    clientArgs: [
      "--server",
      origin,
      "--quiet",
      "--name",
      "Oracle Board",
    ],
    installDir: install.installDir,
    installRef: install.gitRef,
    serverFeatures: install.serverFeatures,
  };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(origin: string, timeoutMs = 180_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = "not started";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${origin}/api/healthz`, { redirect: "manual" });
      if (response.ok) return;
      lastError = `status ${response.status}`;
    } catch (error: any) {
      lastError = error?.message ?? String(error);
    }
    await sleep(500);
  }
  throw new Error(`maw board: sshx-server did not become ready at ${origin}: ${lastError}`);
}

async function isServerReachable(origin: string): Promise<boolean> {
  try {
    const response = await fetch(`${origin}/api/healthz`, { redirect: "manual" });
    return response.ok;
  } catch {
    return false;
  }
}

function startServer(runtime: WorkboardRuntime, opts: WorkboardOptions, urlFile: string): number {
  const stdout = openSync(logPath("server"), "a");
  const stderr = openSync(logPath("server"), "a");
  const child = spawn(
    runtime.serverCommand,
    runtime.serverArgs,
    {
      cwd: runtime.cwd,
      detached: true,
      env: envWithPassword(opts, urlFile),
      stdio: ["ignore", stdout, stderr],
    },
  );
  closeSync(stdout);
  closeSync(stderr);
  child.unref();
  if (!child.pid) throw new Error("maw board: failed to spawn sshx-server");
  writePid("server", child.pid);
  return child.pid;
}

function extractUrl(buffer: string): string | undefined {
  return buffer.match(/https?:\/\/\S+/)?.[0];
}

async function waitForClientUrl(child: ReturnType<typeof spawn>, timeoutMs = 180_000): Promise<string> {
  return await new Promise((resolve, reject) => {
    let buffer = "";
    let done = false;
    const finish = (url: string) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      child.stdout?.destroy();
      resolve(url);
    };
    const fail = (error: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      reject(error);
    };
    const timer = setTimeout(() => {
      try {
        if (child.pid) process.kill(-child.pid, "SIGTERM");
      } catch {
        // Best-effort cleanup for a failed startup.
      }
      fail(new Error("maw board: sshx client did not print a session URL before timeout"));
    }, timeoutMs);

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      buffer += String(chunk);
      const url = extractUrl(buffer);
      if (url) finish(url);
    });
    child.on("error", (error) => fail(error));
    child.on("exit", (code, signal) => {
      const url = extractUrl(buffer);
      if (url) finish(url);
      else fail(new Error(`maw board: sshx client exited before URL (code=${code}, signal=${signal})`));
    });
  });
}

async function startClient(runtime: WorkboardRuntime, opts: WorkboardOptions, urlFile: string): Promise<{ pid: number; url: string }> {
  const stderr = openSync(logPath("client"), "a");
  const child = spawn(
    runtime.clientCommand,
    runtime.clientArgs,
    {
      cwd: runtime.cwd,
      detached: true,
      env: envWithPassword(opts, urlFile),
      stdio: ["ignore", "pipe", stderr],
    },
  );
  closeSync(stderr);
  if (!child.pid) throw new Error("maw board: failed to spawn sshx client");
  const url = await waitForClientUrl(child);
  child.unref();
  writePid("client", child.pid);
  writePrivateText(urlFile, url);
  return { pid: child.pid, url };
}

export async function ensureWorkboardSidecar(opts: WorkboardOptions): Promise<WorkboardSidecarResult> {
  const urlFile = resolveUrlFile(opts);
  const origin = buildWorkboardOrigin(opts);
  const goUrl = buildWorkboardUrl(opts);
  const runtime = resolveRuntime(opts, origin, urlFile);
  const state = readRuntimeState();

  let serverStarted = false;
  let clientStarted = false;
  let serverPid = readPid("server") ?? state.serverPid;
  let clientPid = readPid("client") ?? state.clientPid;

  if (isPidAlive(serverPid) && state.origin && state.origin !== origin) {
    throw new Error(`maw board: sidecar already running at ${state.origin}; run 'maw board stop' before changing host/port`);
  }
  if (isPidAlive(serverPid) && state.runtimeMode && state.runtimeMode !== runtime.mode) {
    throw new Error(`maw board: sidecar already running in ${state.runtimeMode} mode; run 'maw board stop' before switching runtime mode`);
  }
  if (isPidAlive(serverPid) && state.sourceDir && state.sourceDir !== runtime.sourceDir) {
    throw new Error(`maw board: sidecar already running from ${state.sourceDir}; run 'maw board stop' before changing source`);
  }
  if (isPidAlive(serverPid) && state.installDir && runtime.installDir && state.installDir !== runtime.installDir) {
    throw new Error(`maw board: sidecar already running from ${state.installDir}; run 'maw board stop' before changing install`);
  }
  if (isPidAlive(clientPid) && state.origin && state.origin !== origin) {
    throw new Error(`maw board: client already attached to ${state.origin}; run 'maw board stop' before changing host/port`);
  }

  const serverAlive = isPidAlive(serverPid);
  if (!serverAlive && !(await isServerReachable(origin))) {
    removePid("server");
    serverPid = startServer(runtime, opts, urlFile);
    serverStarted = true;
  }
  await waitForServer(origin);

  let boardUrl = readTextIfExists(urlFile);
  if (!isPidAlive(clientPid) || !boardUrl) {
    removePid("client");
    const client = await startClient(runtime, opts, urlFile);
    clientPid = client.pid;
    boardUrl = client.url;
    clientStarted = true;
  }

  writeRuntimeState({
    serverPid,
    clientPid,
    runtimeMode: runtime.mode,
    sourceDir: runtime.sourceDir,
    installDir: runtime.installDir,
    installRef: runtime.installRef,
    host: opts.host ?? DEFAULT_WORKBOARD_HOST,
    port: opts.port ?? DEFAULT_WORKBOARD_PORT,
    origin,
    boardUrl,
    urlFile,
    passwordEnabled: Boolean(opts.password ?? process.env.SSHX_BOARD_PASSWORD),
  });

  return {
    sourceDir: runtime.sourceDir,
    runtimeMode: runtime.mode,
    installDir: runtime.installDir,
    installRef: runtime.installRef,
    origin,
    goUrl,
    boardUrl,
    urlFile,
    serverPid,
    clientPid,
    serverStarted,
    clientStarted,
  };
}

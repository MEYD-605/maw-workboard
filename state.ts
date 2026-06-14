import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { WorkboardServerFeatures } from "./features";

export type WorkboardProcessKind = "server" | "client";

export interface WorkboardRuntimeState {
  serverPid?: number;
  clientPid?: number;
  runtimeMode?: "dev" | "installed";
  sourceDir?: string;
  installDir?: string;
  installRef?: string;
  host?: string;
  port?: number;
  origin?: string;
  boardUrl?: string;
  urlFile?: string;
  passwordEnabled?: boolean;
  startedAt?: string;
  updatedAt?: string;
}

export interface WorkboardInstallManifest {
  schemaVersion: 1;
  installedAt: string;
  installKind?: "source" | "prebuilt";
  sourceDir: string;
  prebuiltSource?: string;
  requestedRef?: string;
  gitRef: string;
  gitSha: string;
  installDir: string;
  platform: NodeJS.Platform;
  arch: string;
  paths: {
    server: string;
    client: string;
    buildDir: string;
  };
  serverFeatures: WorkboardServerFeatures;
  sha256: {
    server: string;
    client: string;
  };
}

export function workboardStateDir(): string {
  return process.env.MAW_WORKBOARD_STATE_DIR
    ?? join(process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state"), "maw", "workboard");
}

export function workboardDataDir(): string {
  return process.env.MAW_WORKBOARD_DATA_DIR
    ?? join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "maw", "workboard");
}

export function ensureDataDir(): string {
  const dir = workboardDataDir();
  mkdirSync(dir, { recursive: true, mode: 0o755 });
  return dir;
}

export function versionsDir(): string {
  const dir = join(ensureDataDir(), "versions");
  mkdirSync(dir, { recursive: true, mode: 0o755 });
  return dir;
}

export function currentInstallPath(): string {
  return join(ensureDataDir(), "current-install.json");
}

export function writeInstallManifest(manifest: WorkboardInstallManifest): void {
  writeFileSync(join(manifest.installDir, "install.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 });
  writeFileSync(currentInstallPath(), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 });
}

export function readCurrentInstall(): WorkboardInstallManifest | undefined {
  const path = currentInstallPath();
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as WorkboardInstallManifest;
  } catch {
    return undefined;
  }
}

export function ensureStateDir(): string {
  const dir = workboardStateDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

export function statePath(): string {
  return join(ensureStateDir(), "state.json");
}

export function pidPath(kind: WorkboardProcessKind): string {
  return join(ensureStateDir(), `${kind}.pid`);
}

export function logPath(kind: WorkboardProcessKind): string {
  return join(ensureStateDir(), `${kind}.log`);
}

export function readRuntimeState(): WorkboardRuntimeState {
  const path = statePath();
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as WorkboardRuntimeState;
  } catch {
    return {};
  }
}

export function writeRuntimeState(next: WorkboardRuntimeState): void {
  const prev = readRuntimeState();
  const now = new Date().toISOString();
  const merged: WorkboardRuntimeState = {
    ...prev,
    ...next,
    startedAt: next.startedAt ?? prev.startedAt ?? now,
    updatedAt: now,
  };
  writeFileSync(statePath(), `${JSON.stringify(merged, null, 2)}\n`, { mode: 0o600 });
}

export function readPid(kind: WorkboardProcessKind): number | undefined {
  const path = pidPath(kind);
  if (!existsSync(path)) return undefined;
  const pid = Number(readFileSync(path, "utf8").trim());
  return Number.isInteger(pid) && pid > 0 ? pid : undefined;
}

export function writePid(kind: WorkboardProcessKind, pid: number): void {
  writeFileSync(pidPath(kind), `${pid}\n`, { mode: 0o600 });
}

export function removePid(kind: WorkboardProcessKind): void {
  rmSync(pidPath(kind), { force: true });
}

export function ensureParentDir(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

export function readTextIfExists(path: string): string | undefined {
  if (!existsSync(path)) return undefined;
  const text = readFileSync(path, "utf8").trim();
  return text || undefined;
}

export function writePrivateText(path: string, value: string): void {
  ensureParentDir(path);
  writeFileSync(path, value.endsWith("\n") ? value : `${value}\n`, { mode: 0o600 });
}

export function isPidAlive(pid: number | undefined): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

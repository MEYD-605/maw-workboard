import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { hostname, userInfo } from "node:os";

import type { WorkboardOptions } from "./impl-helpers";
import { DEFAULT_SSH_SERVER, DEFAULT_SSH_URL_FILE } from "./impl-helpers";
import {
  isPidAlive,
  logPath,
  readCurrentInstall,
  readPid,
  readTextIfExists,
  removePid,
  writePid,
  writePrivateText,
  writeRuntimeState,
} from "./state";

function resolveSshClient(): { command: string; cwd: string } {
  const install = readCurrentInstall();
  if (!install?.paths.client || !existsSync(install.paths.client)) {
    throw new Error("maw rs ssh: no installed sshx client; run 'maw rs install' first");
  }
  return { command: install.paths.client, cwd: install.installDir };
}

function extractUrl(buffer: string): string | undefined {
  return buffer.match(/https?:\/\/\S+/)?.[0];
}

async function waitForSshUrl(child: ReturnType<typeof spawn>, timeoutMs = 120_000): Promise<string> {
  return await new Promise((resolve, reject) => {
    let stdout = "";
    const timer = setTimeout(() => {
      reject(new Error("maw rs ssh: timed out waiting for share URL"));
    }, timeoutMs);
    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += String(chunk);
      const url = extractUrl(stdout);
      if (url) {
        clearTimeout(timer);
        resolve(url);
      }
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stdout += String(chunk);
      const url = extractUrl(stdout);
      if (url) {
        clearTimeout(timer);
        resolve(url);
      }
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code) => {
      if (!extractUrl(stdout)) {
        clearTimeout(timer);
        const detail = stdout.trim().split("\n").pop() ?? "no output";
        reject(new Error(`maw rs ssh: client exited (${code ?? "unknown"}): ${detail}`));
      }
    });
  });
}

export async function cmdWorkboardSsh(opts: WorkboardOptions): Promise<void> {
  const action = opts.sshAction ?? "start";

  if (action === "status") {
    const pid = readPid("ssh");
    const alive = isPidAlive(pid);
    const url = readTextIfExists(DEFAULT_SSH_URL_FILE);
    console.log([
      "Oracle maw rs ssh",
      `server:  ${DEFAULT_SSH_SERVER}`,
      `url:     ${url ?? "(none)"}`,
      `url file: ${DEFAULT_SSH_URL_FILE}`,
      `pid:     ${pid ?? "(none)"} ${alive ? "(alive)" : "(not running)"}`,
    ].join("\n"));
    return;
  }

  if (action === "stop") {
    const pid = readPid("ssh");
    if (pid && isPidAlive(pid)) {
      process.kill(pid, "SIGTERM");
    }
    removePid("ssh");
    writeRuntimeState({ sshUrl: undefined });
    console.log("maw rs ssh: stopped");
    return;
  }

  if (action !== "start") {
    throw new Error(`maw rs ssh: unknown action '${action}' (try: start, status, stop)`);
  }

  const existing = readPid("ssh");
  if (existing && isPidAlive(existing)) {
    const url = readTextIfExists(DEFAULT_SSH_URL_FILE);
    console.log([
      "maw rs ssh: already running",
      `pid: ${existing}`,
      `url: ${url ?? "(pending)"}`,
    ].join("\n"));
    return;
  }

  const { command, cwd } = resolveSshClient();
  const shell = opts.sshShell ?? process.env.SHELL;
  const name = `${userInfo().username}@${hostname()}`;
  const args = [
    "--server",
    DEFAULT_SSH_SERVER,
    "--quiet",
    "--name",
    name,
  ];
  if (shell) args.push("--shell", shell);
  if (opts.sshReadonly) args.push("--enable-readers");

  const child = spawn(command, args, {
    cwd,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (!child.pid) throw new Error("maw rs ssh: failed to spawn sshx client");
  writePid("ssh", child.pid);
  child.unref();

  const url = await waitForSshUrl(child);
  writePrivateText(DEFAULT_SSH_URL_FILE, url);
  writeRuntimeState({ sshUrl: url, sshServer: DEFAULT_SSH_SERVER });

  console.log([
    "✅ maw rs ssh session ready",
    `🔗 Share URL: ${url}`,
    `server: ${DEFAULT_SSH_SERVER}`,
    `pid: ${child.pid}`,
    "",
    "Anyone with the link can join the terminal in their browser.",
  ].join("\n"));
}
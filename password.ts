import type { WorkboardOptions } from "./impl-helpers";
import { isPidAlive, readPid, readRuntimeState } from "./state";

export async function cmdWorkboardPassword(opts: WorkboardOptions): Promise<void> {
  if (opts.passwordAction && opts.passwordAction !== "status") {
    throw new Error(`maw board password: unsupported action ${opts.passwordAction}; use 'maw board password status'`);
  }
  const state = readRuntimeState();
  const envSet = Boolean(process.env.SSHX_BOARD_PASSWORD);
  const invocationSet = opts.password !== undefined;
  const serverPid = readPid("server") ?? state.serverPid;
  const activeSet = Boolean(state.passwordEnabled && isPidAlive(serverPid));

  console.log([
    "Oracle Workboard password",
    "mode: env-only",
    `env SSHX_BOARD_PASSWORD: ${envSet ? "set" : "unset"}`,
    `this invocation --password: ${invocationSet ? "provided" : "not provided"}`,
    `active sidecar: ${activeSet ? "password enabled" : "password not enabled"}`,
    "persisted config: none",
    "",
    invocationSet
      ? "The provided password was not persisted or displayed; pass it to serve/open to start a gated sidecar."
      : "Set SSHX_BOARD_PASSWORD or pass --password to maw board serve/open.",
  ].join("\n"));
}

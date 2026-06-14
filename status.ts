import type { WorkboardOptions } from "./impl-helpers";
import { buildWorkboardUrl, resolveSourceDir, resolveUrlFile } from "./impl-helpers";
import {
  isPidAlive,
  readCurrentInstall,
  readPid,
  readRuntimeState,
  readTextIfExists,
  workboardStateDir,
} from "./state";

export async function cmdWorkboardStatus(opts: WorkboardOptions): Promise<void> {
  const state = readRuntimeState();
  const install = readCurrentInstall();
  const serverPid = readPid("server") ?? state.serverPid;
  const clientPid = readPid("client") ?? state.clientPid;
  const serverAlive = isPidAlive(serverPid);
  const urlFile = state.urlFile ?? resolveUrlFile(opts);
  const clientAlive = isPidAlive(clientPid);
  const boardUrl = state.boardUrl ?? (clientAlive ? readTextIfExists(urlFile) : undefined);

  console.log([
    "Oracle Workboard status",
    `state:       ${workboardStateDir()}`,
    `install:     ${install ? `${install.installDir} (${install.gitRef})` : "(none)"}`,
    `mode:        ${state.runtimeMode ?? "(not running)"}`,
    `source:      ${state.sourceDir ?? resolveSourceDir(opts)}`,
    `go url:      ${state.origin ? `${state.origin}/go` : buildWorkboardUrl(opts)}`,
    `url file:    ${urlFile}`,
    `board url:   ${boardUrl ?? "(none)"}`,
    `server pid:  ${serverPid ?? "(none)"} ${serverAlive ? "(alive)" : "(not running)"}`,
    `client pid:  ${clientPid ?? "(none)"} ${clientAlive ? "(alive)" : "(not running)"}`,
    `password:    ${(state.passwordEnabled && serverAlive) || process.env.SSHX_BOARD_PASSWORD ? "enabled" : "env-only/unset"}`,
  ].join("\n"));
}

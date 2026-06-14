import type { WorkboardOptions } from "./impl-helpers";
import { openBrowserIfRequested } from "./browser";
import { ensureWorkboardSidecar } from "./sidecar";

export async function cmdWorkboardOpen(opts: WorkboardOptions): Promise<void> {
  const result = await ensureWorkboardSidecar(opts);
  const openStatus = openBrowserIfRequested(result.goUrl, opts);
  console.log([
    "Oracle Workboard ready",
    `mode:         ${result.runtimeMode}${result.installRef ? ` (${result.installRef})` : ""}`,
    `source:       ${result.sourceDir}`,
    ...(result.installDir ? [`install:      ${result.installDir}`] : []),
    `go url:       ${result.goUrl}`,
    `session url:  ${result.boardUrl}`,
    `url file:     ${result.urlFile}`,
    `server pid:   ${result.serverPid ?? "(external)"}`,
    `client pid:   ${result.clientPid ?? "(external)"}`,
    `server:       ${result.serverStarted ? "started" : "already running"}`,
    `client:       ${result.clientStarted ? "started" : "already running"}`,
    openStatus,
  ].join("\n"));
}

export async function cmdWorkboardServe(opts: WorkboardOptions): Promise<void> {
  await cmdWorkboardOpen(opts);
}

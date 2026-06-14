import type { WorkboardOptions } from "./impl-helpers";
import { buildWorkboardUrl, resolveSourceDir } from "./impl-helpers";

export async function cmdWorkboardApk(opts: WorkboardOptions): Promise<void> {
  const sourceDir = resolveSourceDir(opts);
  console.log([
    "Oracle Workboard APK build (planned)",
    `source: ${sourceDir}`,
    `target url: ${buildWorkboardUrl(opts)}`,
    `version: ${opts.version ?? "current checkout"}`,
    "",
    "Plan A APK steps to implement:",
    "  1. verify PWA manifest/service worker from maw-ssh build",
    "  2. run Bubblewrap/Trusted Web Activity handoff",
    "  3. emit APK artifact path and signing metadata",
  ].join("\n"));
}

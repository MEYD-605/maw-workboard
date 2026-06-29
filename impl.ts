/**
 * `maw board` — barrel + CLI dispatcher for the Oracle Workboard sidecar.
 */

export type { WorkboardOptions, WorkboardStatus } from "./impl-helpers";
export {
  DEFAULT_WORKBOARD_PORT,
  DEFAULT_WORKBOARD_HOST,
  DEFAULT_SOURCE_DIR,
  parseWorkboardArgs,
  renderWorkboardStatus,
  resolveSourceDir,
  buildWorkboardUrl,
} from "./impl-helpers";
export { cmdWorkboardInstall } from "./install";
export { cmdWorkboardOpen, cmdWorkboardServe } from "./serve";
export { cmdWorkboardApk } from "./apk";

import {
  parseWorkboardArgs,
  renderWorkboardStatus,
  resolveSourceDir,
} from "./impl-helpers";

export async function cmdWorkboard(args: string[]): Promise<void> {
  const opts = parseWorkboardArgs(args);

  if (opts.ssh) {
    const { cmdWorkboardSsh } = await import("./ssh");
    await cmdWorkboardSsh(opts);
    return;
  }

  if (opts.install) {
    const { cmdWorkboardInstall } = await import("./install");
    await cmdWorkboardInstall(opts);
    return;
  }

  if (opts.serve) {
    const { cmdWorkboardServe } = await import("./serve");
    await cmdWorkboardServe(opts);
    return;
  }

  if (opts.stop) {
    const { cmdWorkboardStop } = await import("./stop");
    await cmdWorkboardStop();
    return;
  }

  if (opts.status) {
    const { cmdWorkboardStatus } = await import("./status");
    await cmdWorkboardStatus(opts);
    return;
  }

  if (opts.passwordCommand) {
    const { cmdWorkboardPassword } = await import("./password");
    await cmdWorkboardPassword(opts);
    return;
  }

  if (opts.apk) {
    const { cmdWorkboardApk } = await import("./apk");
    await cmdWorkboardApk(opts);
    return;
  }

  if (opts.open) {
    const { cmdWorkboardOpen } = await import("./serve");
    await cmdWorkboardOpen(opts);
    return;
  }

  console.log(renderWorkboardStatus({
    sourceDir: resolveSourceDir(opts),
    options: opts,
  }));
}

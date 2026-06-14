import { spawn } from "node:child_process";

import type { WorkboardOptions } from "./impl-helpers";

export function openBrowserIfRequested(url: string, opts: WorkboardOptions): string {
  if (opts.noOpen) return "open: skipped (--no-open)";

  const platform = process.platform;
  let command: string;
  let args: string[];

  if (platform === "darwin") {
    command = "open";
    args = [url];
  } else if (platform === "win32") {
    command = "cmd";
    args = ["/c", "start", "", url];
  } else {
    if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
      return "open: skipped (headless Linux; URL printed above)";
    }
    command = "xdg-open";
    args = [url];
  }

  try {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    return `open: launched ${command}`;
  } catch (error: any) {
    return `open: skipped (${error?.message ?? String(error)})`;
  }
}


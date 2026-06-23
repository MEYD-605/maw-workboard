import type { InvokeContext, InvokeResult } from "maw-js/plugin/types";

export const command = {
  name: "board",
  aliases: ["workboard", "rs"],
  description: "Manage the Oracle Workboard sidecar powered by the maw-ssh sshx fork.",
};

export default async function handler(ctx: InvokeContext): Promise<InvokeResult> {
  const { cmdWorkboard } = await import("./impl");

  const logs: string[] = [];
  const origLog = console.log;
  const origError = console.error;
  console.log = (...args: any[]) => {
    if (ctx.writer) ctx.writer(...args);
    else logs.push(args.map(String).join(" "));
  };
  console.error = (...args: any[]) => {
    if (ctx.writer) ctx.writer(...args);
    else logs.push(args.map(String).join(" "));
  };

  try {
    const args = ctx.source === "cli" ? (ctx.args as string[]) : [];
    await cmdWorkboard(args);
    return { ok: true, output: logs.join("\n") || undefined };
  } catch (error: any) {
    const message = error?.message ?? String(error);
    return {
      ok: false,
      error: logs.join("\n") || message,
      output: logs.join("\n") || undefined,
    };
  } finally {
    console.log = origLog;
    console.error = origError;
  }
}

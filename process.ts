import { spawnSync } from "node:child_process";

export interface RunCommandOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  label: string;
}

export function runCommand(command: string, args: string[], opts: RunCommandOptions): void {
  console.log(`$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: opts.cwd,
    env: opts.env ?? process.env,
    stdio: "inherit",
  });
  if (result.error) {
    throw new Error(`${opts.label} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${opts.label} failed with exit code ${result.status}`);
  }
}

export function captureCommand(command: string, args: string[], cwd: string): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
  });
  if (result.error) {
    throw new Error(`${command} ${args.join(" ")} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = result.stderr || result.stdout || `exit code ${result.status}`;
    throw new Error(`${command} ${args.join(" ")} failed: ${detail.trim()}`);
  }
  return result.stdout.trim();
}


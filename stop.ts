import { isPidAlive, readPid, removePid } from "./state";

function stopPid(pid: number | undefined): string {
  if (!pid) return "not running";
  if (!isPidAlive(pid)) return `stale pid ${pid}`;
  try {
    process.kill(-pid, "SIGTERM");
    return `sent SIGTERM to process group ${pid}`;
  } catch {
    try {
      process.kill(pid, "SIGTERM");
      return `sent SIGTERM to pid ${pid}`;
    } catch (error: any) {
      return `failed to stop ${pid}: ${error?.message ?? String(error)}`;
    }
  }
}

export async function cmdWorkboardStop(): Promise<void> {
  const client = readPid("client");
  const server = readPid("server");
  const clientResult = stopPid(client);
  const serverResult = stopPid(server);
  removePid("client");
  removePid("server");
  console.log([
    "Oracle Workboard stop",
    `client: ${clientResult}`,
    `server: ${serverResult}`,
  ].join("\n"));
}


import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface WorkboardServerFeatures {
  boardPassword: boolean;
  oracleUrlFile: boolean;
  staticDir: boolean;
  healthz: boolean;
  filesApi: boolean;
}

const REQUIRED_FEATURES: Array<keyof WorkboardServerFeatures> = [
  "boardPassword",
  "oracleUrlFile",
  "staticDir",
  "healthz",
  "filesApi",
];

function readSourceFile(path: string): string {
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf8");
}

export function detectServerFeatures(sourceDir: string): WorkboardServerFeatures {
  const main = readSourceFile(join(sourceDir, "crates", "sshx-server", "src", "main.rs"));
  const web = readSourceFile(join(sourceDir, "crates", "sshx-server", "src", "web.rs"));

  return {
    boardPassword: main.includes("SSHX_BOARD_PASSWORD") && main.includes("board_password"),
    oracleUrlFile: main.includes("SSHX_ORACLE_URL_FILE") && main.includes("oracle_url_file"),
    staticDir: main.includes("static_dir") && main.includes("ServerOptions"),
    healthz: web.includes("\"/healthz\"") && web.includes("fn healthz"),
    filesApi: web.includes("\"/files\"") && web.includes("\"/file\""),
  };
}

function binaryIncludes(path: string, value: string): boolean {
  try {
    return readFileSync(path).includes(Buffer.from(value));
  } catch {
    return false;
  }
}

export function detectServerFeaturesFromBinary(serverPath: string): WorkboardServerFeatures {
  const help = spawnSync(serverPath, ["--help"], { encoding: "utf8" });
  const helpText = `${help.stdout ?? ""}\n${help.stderr ?? ""}`;
  return {
    boardPassword: helpText.includes("--board-password") || binaryIncludes(serverPath, "SSHX_BOARD_PASSWORD"),
    oracleUrlFile: helpText.includes("--oracle-url-file") || binaryIncludes(serverPath, "SSHX_ORACLE_URL_FILE"),
    staticDir: helpText.includes("--static-dir") || binaryIncludes(serverPath, "--static-dir"),
    healthz: binaryIncludes(serverPath, "/healthz"),
    filesApi: binaryIncludes(serverPath, "/files") && binaryIncludes(serverPath, "/file"),
  };
}

export function missingServerFeatures(features: Partial<WorkboardServerFeatures> | undefined): string[] {
  return REQUIRED_FEATURES.filter((name) => features?.[name] !== true);
}

export function assertRequiredServerFeatures(
  features: Partial<WorkboardServerFeatures> | undefined,
  sourceLabel: string,
): void {
  const missing = missingServerFeatures(features);
  if (missing.length === 0) return;
  throw new Error(
    `maw board: ${sourceLabel} is missing required self-contained workboard server features: ${missing.join(", ")}. ` +
      "Install from MEYD-605/maw-ssh branch meyd605/workboard-extras at e8a74f0 or newer.",
  );
}

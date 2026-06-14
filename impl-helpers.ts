import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "path";

export const DEFAULT_WORKBOARD_PORT = 3457;
export const DEFAULT_WORKBOARD_HOST = "127.0.0.1";
export const DEFAULT_SOURCE_DIR = join(homedir(), "Code", "github.com", "MEYD-605", "maw-ssh");
export const DEFAULT_URL_FILE = join(homedir(), ".sshx-oracle-url.txt");

export interface WorkboardOptions {
  open?: boolean;
  install?: boolean;
  serve?: boolean;
  status?: boolean;
  stop?: boolean;
  passwordCommand?: boolean;
  passwordAction?: string;
  password?: string;
  apk?: boolean;
  dev?: boolean;
  source?: string;
  prebuilt?: string;
  port?: number;
  host?: string;
  version?: string;
  urlFile?: string;
  noOpen?: boolean;
}

export interface WorkboardStatus {
  sourceDir: string;
  options: WorkboardOptions;
}

function takeFlag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

export function parseWorkboardArgs(args: string[]): WorkboardOptions {
  const positionals = args.filter((arg) => !arg.startsWith("--"));
  const subcommand = positionals[0];
  const portRaw = takeFlag(args, "--port");
  const port = portRaw ? Number(portRaw) : undefined;

  return {
    open: args.length === 0 || subcommand === "open",
    install: subcommand === "install" || hasFlag(args, "--install"),
    serve: subcommand === "serve" || hasFlag(args, "--serve"),
    status: subcommand === "status" || hasFlag(args, "--status"),
    stop: subcommand === "stop",
    passwordCommand: subcommand === "password",
    passwordAction: subcommand === "password" ? positionals[1] ?? "status" : undefined,
    password: takeFlag(args, "--password"),
    apk: subcommand === "apk" || hasFlag(args, "--apk"),
    dev: hasFlag(args, "--dev"),
    source: takeFlag(args, "--source"),
    prebuilt: takeFlag(args, "--prebuilt"),
    host: takeFlag(args, "--host"),
    port: Number.isFinite(port) ? port : undefined,
    version: takeFlag(args, "--version"),
    urlFile: takeFlag(args, "--url-file"),
    noOpen: hasFlag(args, "--no-open"),
  };
}

export function resolveSourceDir(opts: WorkboardOptions): string {
  const requested = opts.source ?? process.env.MAW_WORKBOARD_SRC;
  if (requested) return resolve(requested);
  return DEFAULT_SOURCE_DIR;
}

export function resolveUrlFile(opts: WorkboardOptions): string {
  return resolve(opts.urlFile ?? process.env.SSHX_ORACLE_URL_FILE ?? DEFAULT_URL_FILE);
}

export function buildWorkboardOrigin(opts: WorkboardOptions = {}): string {
  const host = opts.host ?? DEFAULT_WORKBOARD_HOST;
  const port = opts.port ?? DEFAULT_WORKBOARD_PORT;
  return `http://${host}:${port}`;
}

export function buildWorkboardUrl(opts: WorkboardOptions = {}): string {
  return `${buildWorkboardOrigin(opts)}/go`;
}

export function renderWorkboardStatus(status: WorkboardStatus): string {
  const sourceExists = existsSync(status.sourceDir);
  return [
    "Oracle Workboard plugin (prep skeleton)",
    "",
    `source: ${status.sourceDir} ${sourceExists ? "(found)" : "(missing)"}`,
    `url:    ${buildWorkboardUrl(status.options)}`,
    "",
    "planned commands:",
    "  maw board [--dev] [--source PATH] [--host HOST] [--port PORT]",
    "  maw board open [--dev] [--host HOST] [--port PORT]",
    "  maw board install [--source PATH] [--version REF]",
    "  maw board install --prebuilt PATH [--version REF]",
    "  maw board serve [--dev] [--source PATH] [--host HOST] [--port PORT] [--password VALUE]",
    "  maw board status",
    "  maw board stop",
    "  maw board password status",
    "  maw board apk [--source PATH] [--version REF]",
    "",
    "status: sidecar wrapper scaffold only; runtime implementation pending review",
  ].join("\n");
}

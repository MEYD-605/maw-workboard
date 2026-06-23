import { definePlugin } from "maw-js/sdk";

export default definePlugin({
  "name": "workboard",
  "version": "0.1.0",
  "entry": "./index.ts",
  "sdk": "^1.0.0",
  "description": "Manage the Oracle Workboard sidecar powered by the maw-ssh sshx fork.",
  "author": "MEYD-605",
  "cli": {
    "command": "board",
    "aliases": [
      "workboard",
      "rs"
    ],
    "help": "maw board open|serve|install|status|stop|password|apk [options]",
    "flags": {
      "--source": "string",
      "--prebuilt": "string",
      "--port": "number",
      "--host": "string",
      "--version": "string",
      "--password": "string",
      "--url-file": "string",
      "--no-open": "boolean",
      "--dev": "boolean"
    }
  },
  "capabilityNamespaces": [
    "workboard"
  ],
  "capabilities": [
    "fs:read",
    "fs:write",
    "proc:spawn",
    "net:listen",
    "net:fetch",
    "workboard:sidecar"
  ],
  "weight": 20,
  "license": "MIT",
  "schemaVersion": 1
} as const);

# Oracle Workboard Plugin

`maw board` manages the Oracle Workboard sidecar powered by the
`MEYD-605/maw-ssh` sshx fork.

It keeps the workboard runtime outside maw-js, then gives maw a small control
surface for installing, starting, stopping, inspecting, and password-gating the
board.

`maw workboard` is kept as an alias for `maw board`.

## Status

Implemented:

- `maw board install` builds the maw-ssh frontend and Rust release binaries.
- `maw board` / `maw board open` starts the installed runtime and opens `/go`.
- `maw board serve --dev` runs directly from a maw-ssh checkout.
- One quiet `sshx` client named `Oracle Board` is auto-created when needed.
- The live session URL is written to a configurable URL file.
- `maw board status` reports install/runtime/process state.
- `maw board stop` stops only plugin-owned sidecar processes.
- `maw board password status` reports env-only password state without printing
  the secret.

Planned:

- `maw board apk` Bubblewrap/TWA packaging.
- Optional `engine.serve` integration for maw API gatewaying.

Companion doc:

- [USAGE.md](./USAGE.md) is the short end-user / marketplace guide maintained
  alongside this README. This README is the operator-grade reference. If command
  behavior changes, update both or coordinate with the owner of `USAGE.md`.

## Architecture

The plugin is a lifecycle wrapper, not a rewrite of sshx.

```text
maw board
  |
  |-- installs/copies runtime artifacts under the maw data dir
  |-- starts sshx-server on 127.0.0.1:3457 by default
  |-- starts sshx --quiet --name "Oracle Board"
  |-- writes the generated session URL to the Oracle URL file
  |-- opens http://127.0.0.1:3457/go when possible
```

The server then serves the actual Svelte workboard and session WebSocket.
The `/go` page wraps the session URL in an iframe so the browser address bar can
stay at `/go`.

## Quick Start

From the `MEYD-605/maw-js` checkout:

```sh
# Install the plugin into maw as a local dev plugin.
maw plugin install ./plugins/workboard

# Install a prebuilt maw-ssh sidecar runtime.
maw board install --prebuilt /path/to/workboard-prebuilt.tgz

# Or build/install from a local maw-ssh checkout.
maw board install --source ~/Code/github.com/MEYD-605/maw-ssh

# Start/open the board from the installed runtime.
maw board
```

For source/dev mode without installing runtime artifacts:

```sh
maw board serve --dev --source ~/Code/github.com/MEYD-605/maw-ssh --no-open
```

Default board URL:

```text
http://127.0.0.1:3457/go
```

## Requirements

| Requirement | Used by |
| --- | --- |
| `maw-js` with plugin SDK `^1.0.0` | plugin loading |
| Node/Bun runtime used by maw-js | plugin execution |
| Rust toolchain | source-built `maw board install`, `--dev` sidecar |
| npm dependencies in the maw-ssh checkout | source-built frontend build |
| maw-ssh checkout | source install/dev mode |
| Prebuilt bundle | `maw board install --prebuilt` without Rust/Node/source |

Default maw-ssh source resolution:

1. `--source <path>`
2. `MAW_WORKBOARD_SRC`
3. `~/Code/github.com/MEYD-605/maw-ssh` (default — our own fork under the current HOME)

## Command Reference

### `maw board`

Shortcut for opening the board. By default this uses the installed runtime from
`maw board install`.

```sh
maw board
maw board --no-open
maw board --host 127.0.0.1 --port 3457
maw board --password "$SSHX_BOARD_PASSWORD"
```

Behavior:

1. Resolve installed runtime metadata.
2. Start `sshx-server` if no plugin-owned server is alive.
3. Start one quiet `sshx` client if no plugin-owned client is alive.
4. Write the live session URL to the Oracle URL file.
5. Print `/go` and open it unless `--no-open` is set or the host is headless.

### `maw board open`

Explicit form of `maw board`.

```sh
maw board open
maw board open --no-open
maw board open --dev --source /path/to/maw-ssh
```

Use this when scripting and you want the command name to show intent.

### `maw board serve`

Start the sidecar without relying on the bare shortcut.

Installed mode:

```sh
maw board install --source /path/to/maw-ssh
maw board serve --host 127.0.0.1 --port 3457 --no-open
```

Dev mode:

```sh
maw board serve --dev --source /path/to/maw-ssh --port 3457 --no-open
```

Installed mode runs copied release binaries from the maw data dir. Dev mode
runs `cargo run --quiet -p sshx-server` and `cargo run --quiet -p sshx` from
the source checkout.

| Flag | Default | Description |
| --- | --- | --- |
| `--dev` | off | Run from source checkout instead of installed binaries. |
| `--source PATH` | source resolution chain | maw-ssh checkout for install/dev. |
| `--host HOST` | `127.0.0.1` | Server bind address. |
| `--port PORT` | `3457` | Server listen port. |
| `--password VALUE` | unset | Password for this invocation only. |
| `--url-file PATH` | `~/.sshx-oracle-url.txt` | File that receives the live session URL. |
| `--no-open` | off | Print URL without launching a browser. |

### `maw board install`

Build and install a local runtime.

```sh
maw board install --source /path/to/maw-ssh
maw board install --source /path/to/maw-ssh --version e8a74f0
maw board install --prebuilt /path/to/workboard-prebuilt.tgz
maw board install --prebuilt /path/to/workboard-prebuilt-dir --version e8a74f0
```

Source install does this:

1. Validates the source checkout has `Cargo.toml` and `package.json`.
2. Reads the current git SHA and short ref.
3. If `--version` is provided, verifies it resolves to the current checkout.
   It does not checkout or mutate the source tree.
4. Runs `npm run build`.
5. Runs `cargo build --release -p sshx-server -p sshx`.

Prebuilt install skips npm/cargo entirely. It accepts a directory or tarball
with this layout:

```text
workboard-prebuilt/
  bin/
    sshx-server
    sshx
  build/
    spa.html
    _app/...
  SHA256SUMS
```

`SHA256SUMS` must contain sha256 entries for `bin/sshx-server`, `bin/sshx`,
and every regular file under `build/`, using paths relative to the bundle root.
6. Copies `sshx-server`, `sshx`, and `build/` into a versioned maw data dir.
7. Writes `install.json` and `current-install.json` with paths and sha256.

Install layout:

```text
~/.local/share/maw/workboard/
  current-install.json
  versions/
    <ref>-<platform>-<arch>/
      install.json
      bin/
        sshx-server
        sshx
      build/
        _app/
        ...
```

| Flag | Default | Description |
| --- | --- | --- |
| `--source PATH` | source resolution chain | maw-ssh checkout to build. |
| `--version REF` | current checkout | Assert the checkout is already at this ref. |

### `maw board status`

Print install and process state.

```sh
maw board status
```

Typical output includes:

- state directory
- current installed runtime, if any
- runtime mode: `installed`, `dev`, or not running
- source dir
- `/go` URL
- URL file
- board session URL, if known
- server/client PIDs and liveness
- password state

### `maw board stop`

Stop the plugin-owned sidecar process group.

```sh
maw board stop
```

This uses the plugin pid files. It is intended to stop processes started by this
plugin, not arbitrary system sshx services.

### `maw board password status`

Report password-gate state without revealing the password.

```sh
maw board password status
SSHX_BOARD_PASSWORD='secret' maw board password status
```

Password mode is env-only:

- `SSHX_BOARD_PASSWORD` is passed through to `sshx-server`.
- `--password VALUE` sets `SSHX_BOARD_PASSWORD` for that `serve/open`
  invocation only.
- No password is written to `install.json`, `state.json`, or plugin config.
- `password status` reports set/unset and active sidecar state, never the value.

Prefer environment variables over `--password` for shared shells, because a
literal flag can remain in shell history.

### `maw board apk`

Planned command for Android Trusted Web Activity packaging.

```sh
maw board apk --version <ref>
```

The intended target is the hosted PWA at:

```text
https://ssh.example.com/go
```

Expected future output:

```text
~/.local/share/maw/workboard/apk/<version>/
  app-release-signed.apk
  app-release-bundle.aab
  twa-manifest.json
  apk-build.json
```

Full-screen TWA mode also requires Digital Asset Links at:

```text
https://ssh.example.com/.well-known/assetlinks.json
```

## Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `MAW_WORKBOARD_SRC` | unset | Override default maw-ssh source checkout. |
| `MAW_WORKBOARD_DATA_DIR` | `~/.local/share/maw/workboard` | Runtime install directory. |
| `MAW_WORKBOARD_STATE_DIR` | `~/.local/state/maw/workboard` | Pid/log/state directory. |
| `SSHX_BOARD_PASSWORD` | unset | Enables app-layer board password gate. |
| `SSHX_ORACLE_URL_FILE` | `~/.sshx-oracle-url.txt` | File read by `/go` and written by the plugin/client setup. |

## Security Notes

The workboard uses two layers:

1. The sshx session URL/key controls access to the live session.
2. `SSHX_BOARD_PASSWORD` gates `/go`, `/s/*`, session WebSocket, and file APIs
   in the maw-ssh server when configured.

Practical guidance:

- Set `SSHX_BOARD_PASSWORD` for private shared boards.
- Do not commit passwords or generated session URLs.
- Use `maw board password status`; do not print secrets into logs.
- Use `--host 127.0.0.1` for local-only boards.
- Bind `--host 0.0.0.0` only when you understand the network exposure.
- Stop before switching host/port/source/install mode.

## Platform Notes

### macOS

- Browser open uses `open`.
- Ensure Rust, npm, and maw-js are on `PATH`.
- If using Homebrew shells, check the environment inherited by maw.
- APK work later will need Android SDK and a JDK.

### Linux

- Browser open uses `xdg-open`.
- On headless Linux, the plugin prints the URL and skips opening a browser.
- Use `--no-open` in scripts and SSH sessions.
- Remote access may require `--host 0.0.0.0` plus firewall/proxy setup.

## Gotchas

### Local plugin install needs `./` or an absolute path

Use:

```sh
maw plugin install ./plugins/workboard
```

Avoid:

```sh
maw plugin install plugins/workboard
```

Without `./` or `/`, the maw plugin resolver can read `plugins/workboard` as a
GitHub `owner/repo` shorthand and try a remote fetch.

### Keep test state isolated

Tests should not reuse the real state or URL files.

```sh
export MAW_WORKBOARD_DATA_DIR=/tmp/maw-workboard-data-$$
export MAW_WORKBOARD_STATE_DIR=/tmp/maw-workboard-state-$$
export SSHX_ORACLE_URL_FILE=/tmp/maw-workboard-url-$$.txt

maw board install --source /path/to/maw-ssh
maw board serve --port 3467 --no-open
maw board stop
```

### Stop before changing runtime shape

The plugin intentionally refuses to switch host, port, source, install dir, or
runtime mode while a plugin-owned sidecar is alive. Run:

```sh
maw board stop
```

Then start with the new flags.

### `--url-file` depends on maw-ssh compat

The current maw-ssh branch includes configurable Oracle URL file support via
`SSHX_ORACLE_URL_FILE` / `--oracle-url-file`. Older server builds hardcoded
one fixed URL file; for those, rebuild maw-ssh from the current branch or use a
current prebuilt bundle.

### Installed static assets rely on the process cwd

Installed mode starts `sshx-server` with cwd set to the install directory, where
`build/` was copied. If `/go` works but static assets 404, re-run:

```sh
maw board install --source /path/to/maw-ssh
# or:
maw board install --prebuilt /path/to/workboard-prebuilt.tgz
```

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `no installed workboard runtime` | `maw board install` has not run for this data dir. | Run `maw board install --source /path/to/maw-ssh` or use `--dev`. |
| `source is not an sshx checkout` | `--source` points at the wrong directory. | Point it at the maw-ssh repo root containing `Cargo.toml`. |
| `--version ... resolves to ... but source checkout is at ...` | Install never mutates the checkout. | `git checkout <ref>` in maw-ssh first, then rerun install. |
| Port already in use | Another server is bound to the selected port. | `maw board stop` or choose `--port`. |
| `sidecar already running at ...` | Trying to change host/port while alive. | `maw board stop`, then start again. |
| Browser does not open on Linux | Headless session or no `xdg-open`. | Use printed URL or pass `--no-open`. |
| `/go` says no active session | Client did not create/write URL file. | Check `maw board status`, state logs, and `SSHX_ORACLE_URL_FILE`. |
| Static assets 404 | Missing/copied `build/` assets or wrong runtime cwd. | Re-run install; verify `current-install.json`. |
| Password seems ignored | Server was already running without it. | `maw board stop`; restart with `SSHX_BOARD_PASSWORD` or `--password`. |
| Secret appears in shell history | `--password` used literally. | Prefer `SSHX_BOARD_PASSWORD` from your shell/session manager. |

## Developer Notes

Main files:

| File | Purpose |
| --- | --- |
| `plugin.json` | SDK manifest. Command is `board`, alias is `workboard`. |
| `plugin.ts` | Typed manifest via `definePlugin`. |
| `index.ts` | `InvokeContext` handler and console capture. |
| `impl.ts` | Subcommand dispatcher. |
| `impl-helpers.ts` | Argument parsing, source resolution, URL helpers. |
| `install.ts` | Local source build and artifact install. |
| `sidecar.ts` | Dev/installed runtime launch and session URL capture. |
| `state.ts` | Data/state paths, pid files, manifests. |
| `status.ts` | Runtime status output. |
| `stop.ts` | Plugin-owned process shutdown. |
| `password.ts` | Env-only password status. |
| `apk.ts` | Planned APK/TWA command placeholder. |

Validation commands used during development:

```sh
maw plugin build /path/to/MEYD-605/maw-js/plugins/workboard

MAW_WORKBOARD_DATA_DIR=/tmp/wb-data \
MAW_WORKBOARD_STATE_DIR=/tmp/wb-state \
SSHX_ORACLE_URL_FILE=/tmp/wb-url.txt \
  maw board install --prebuilt /path/to/workboard-prebuilt.tgz

MAW_WORKBOARD_DATA_DIR=/tmp/wb-data \
MAW_WORKBOARD_STATE_DIR=/tmp/wb-state \
SSHX_ORACLE_URL_FILE=/tmp/wb-url.txt \
  maw board serve --port 3467 --no-open

maw board stop
```

## Manifest Summary

```json
{
  "name": "workboard",
  "cli": {
    "command": "board",
    "aliases": ["workboard"]
  },
  "sdk": "^1.0.0",
  "capabilities": [
    "fs:read",
    "fs:write",
    "proc:spawn",
    "net:listen",
    "net:fetch",
    "workboard:sidecar"
  ]
}
```

## License & Credits

MIT, matching the maw-js plugin template.

The board runtime is **maw-ssh** (`MEYD-605/maw-ssh`), our own fork of
[sshx](https://github.com/ekzhang/sshx) by Eric Zhang, used and redistributed
under its MIT License. The upstream copyright notice is preserved in
`MEYD-605/maw-ssh/LICENSE`. This plugin and the Oracle Workboard branding are
ours; sshx is credited as the originating open-source project per MIT terms.

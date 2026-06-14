# USAGE — `maw board`

End-user guide for the Oracle Workboard plugin on **macOS** and **Linux**.

> **Status**: local install + dev sidecar implemented. APK packaging is planned.

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| **maw-js** ≥ 1.1.0 | `maw --version` to verify |
| **maw-ssh source** | Clone `MEYD-605/maw-ssh` (the sshx fork) |
| **Bun** ≥ 1.1 | Runtime for maw-js |

Optional (APK packaging only):

| Requirement | Notes |
|-------------|-------|
| Android SDK + JDK 11+ | For `maw board apk` |
| `@nicolo-ribaudo/bubblewrap` | `npm i -g @nicolo-ribaudo/bubblewrap` |

---

## Quick Start

```sh
# 1. Install a prebuilt runtime bundle
maw board install --prebuilt /path/to/workboard-prebuilt.tgz

# Or build from a source checkout when Rust/npm are available
maw board install --source ~/Code/github.com/MEYD-605/maw-ssh

# 2. Start the installed workboard
maw board serve

# 3. Open in browser (auto-opens by default)
maw board open
```

The workboard serves on `http://127.0.0.1:3457/go` by default — a separate
port so it never collides with maw-js (`:3456`).

> ⚠️ **Gotcha — local install needs `./` prefix**
>
> When installing from a local checkout, always use a path that starts with
> `./` or `/`:
>
> ```sh
> # ✅ Correct — maw sees a local path
> maw plugin install ./plugins/workboard
>
> # ❌ Wrong — maw regex reads "plugins/workboard" as GitHub owner/repo → 404
> maw plugin install plugins/workboard
> ```
>
> The maw plugin resolver uses a regex to distinguish local paths from
> `owner/repo` shorthand. A bare `plugins/workboard` (no leading `./` or `/`)
> matches the `owner/repo` pattern and triggers a GitHub fetch that 404s.

---

## Commands

### `maw board` / `maw board open`

Open the workboard and auto-create one `Oracle Board` shell when no
plugin-owned client is alive.

```sh
maw board
maw board open
maw board open --no-open
```

### `maw board status`

Show current sidecar status: install directory, source directory, URL, and
whether the sidecar processes are alive.

```sh
maw board status
```

| Flag | Default | Description |
|------|---------|-------------|
| `--host` | `127.0.0.1` | Sidecar bind address |
| `--port` | `3457` | Sidecar port |
| `--password` | none | Access password for this invocation only |
| `--url-file` | `~/.sshx-oracle-url.txt` | Live session URL file |
| `--no-open` | `false` | Print URL without opening browser |

### `maw board install`

Install or rebuild the sidecar from a prebuilt bundle or maw-ssh source checkout.

```sh
maw board install --prebuilt /path/to/workboard-prebuilt.tgz
maw board install --prebuilt /path/to/workboard-prebuilt-dir --version e8a74f0
maw board install
maw board install --source /path/to/maw-ssh
maw board install --version v0.3.0
```

| Flag | Default | Description |
|------|---------|-------------|
| `--source` | `$MAW_WORKBOARD_SRC` or `~/Code/github.com/MEYD-605/maw-ssh` | Path to maw-ssh checkout |
| `--prebuilt` | none | Directory or tarball with `bin/sshx-server`, `bin/sshx`, `build/`, `SHA256SUMS` |
| `--version` | current checkout | Assert the source checkout is already at this ref |

### `maw board serve`

Start the workboard sidecar server. Without `--dev`, this uses the runtime
created by `maw board install`.

```sh
maw board serve
maw board serve --dev
maw board serve --host 0.0.0.0 --port 8080 --password secret123
```

| Flag | Default | Description |
|------|---------|-------------|
| `--dev` | `false` | Run from source checkout instead of installed binaries |
| `--source` | (see install) | Path to maw-ssh checkout |
| `--host` | `127.0.0.1` | Bind address |
| `--port` | `3457` | Listen port |
| `--password` | none | Access password for the session |
| `--url-file` | none | Write the live URL to this file |

### `maw board stop`

Stop a running workboard sidecar.

```sh
maw board stop
```

### `maw board password status`

Show env-only password state without printing the password.

```sh
maw board password status
```

### `maw board apk`

Package the workboard PWA as an Android APK (Trusted Web Activity).

```sh
maw board apk
maw board apk --source ~/Code/MEYD-605/maw-ssh --version v0.3.0
```

| Flag | Default | Description |
|------|---------|-------------|
| `--source` | (see install) | Path to maw-ssh checkout |
| `--version` | current checkout | Git ref for the build |

The APK flow uses Bubblewrap to wrap the hosted PWA at
`https://ssh.example.com` into a native Android shell.

**Output artifacts** are written to:

```
~/.local/share/maw/workboard/apk/<version>/
├── app-release-signed.apk    # sideload / direct install
└── app-release-bundle.aab    # Play Store submission
```

> **Note**: Full-screen TWA mode requires Android Digital Asset Links.
> After the first APK build, `maw board apk` prints the SHA-256 fingerprint
> and the `assetlinks.json` payload to deploy on the workboard origin
> (`https://ssh.example.com/.well-known/assetlinks.json`).

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `MAW_WORKBOARD_SRC` | Override the default maw-ssh source directory |
| `MAW_WORKBOARD_DATA_DIR` | Override runtime install directory (default: `~/.local/share/maw/workboard`) |
| `MAW_WORKBOARD_STATE_DIR` | Override pid/log/state directory (default: `~/.local/state/maw/workboard`) |
| `SSHX_BOARD_PASSWORD` | Enable the app-layer password gate |
| `SSHX_ORACLE_URL_FILE` | Path where the sidecar writes its live URL on startup. Set a separate file per instance when running multiple workboards or test fixtures in parallel. |

> **Tip — test isolation**: When testing locally, set both vars to throwaway
> paths so you don't pollute your real workboard state:
>
> ```sh
> export MAW_WORKBOARD_DATA_DIR=/tmp/wb-data-$$
> export MAW_WORKBOARD_STATE_DIR=/tmp/wb-test-$$
> export SSHX_ORACLE_URL_FILE=/tmp/wb-url-$$.txt
> maw board serve --dev
> ```

---

## Platform Notes

### macOS

- `maw board open` uses `open` to launch the default browser.
- If you use Homebrew-installed Bun, ensure `bun` is on your `$PATH`.
- APK packaging requires a JDK (`brew install openjdk@11`).

### Linux

- `maw board open` uses `xdg-open` (or prints the URL if no desktop).
- On headless servers, use `--no-open` and access the URL from another
  machine by binding to `--host 0.0.0.0`.
- The sidecar port `3457` may need a firewall rule if accessed remotely.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `maw plugin install plugins/workboard` → 404 | Use `./plugins/workboard` (with `./` prefix) — see gotcha above |
| `maw board status` shows "source (missing)" | Clone maw-ssh or set `--source` / `MAW_WORKBOARD_SRC` |
| `maw board serve` says no installed runtime | Run `maw board install` first or use `--dev --source PATH` |
| Port 3457 already in use | Use `--port` to pick another port, or `maw board stop` first |
| Test state leaks into main install | Set `MAW_WORKBOARD_STATE_DIR` + `SSHX_ORACLE_URL_FILE` to isolated paths |
| `maw board apk` fails with "bubblewrap not found" | `npm i -g @nicolo-ribaudo/bubblewrap` |
| APK installs but shows browser chrome | Digital Asset Links not configured — see APK section |

---

## Alias

`maw workboard` is an alias for `maw board` — both work identically.

---

*Plugin version 0.1.0 · maw-js ≥ 1.1.0 · MIT License*

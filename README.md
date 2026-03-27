# Beads MCP Wrapper Server

This project is a stdio MCP server that exposes Beads CLI commands as MCP tools.
It lets MCP clients (for example VS Code Copilot Chat in agent mode) call Beads through structured tool invocations.

## What This Server Does

It maps MCP tool calls to Beads CLI operations:

- `beads_init`
- `beads_ready`
- `beads_list`
- `beads_show`
- `beads_create`
- `beads_close`
- `beads_dep_add`
- `beads_exec` (advanced/raw command passthrough)

## Prerequisites

You need all of the following:

1. Node.js installed (recommended Node 18+)
2. `@beads/bd` installed globally or locally (you need `bd.exe` on Windows)
3. Dolt installed and available in PATH (Beads uses Dolt for state/repository backend)


<img width="1018" height="466" alt="image" src="https://github.com/user-attachments/assets/8424b902-39c3-4bd0-8254-9651e97e1969" />

### Install `@beads/bd` (choose one)

Global install:

```powershell
npm install -g @beads/bd
```

Local install (inside this wrapper folder):

```powershell
cd scripts/beads-mcp-server
npm install @beads/bd
```

### Install Dolt

Install Dolt from:

https://docs.dolthub.com/introduction/installation

After install, verify:

```powershell
dolt --version
```

## Install Wrapper Dependencies

```powershell
cd scripts/beads-mcp-server
npm install
```

## Configure MCP (`mcp.json`)

Add this server under `servers` in your VS Code user MCP config.

### Recommended Windows config (explicit `bd.exe` path)

```jsonc
"beads-wrapper": {
  "type": "stdio",
  "command": "node",
  "args": [
    "C:/path/server.mjs"
  ],
  "env": {
    "BEADS_CWD": "workingdir",
    "BEADS_BIN": "Pathtobid"
  }
}
```

<img width="1336" height="225" alt="image" src="https://github.com/user-attachments/assets/7b8c2c81-8722-49d6-b86f-538e86bcd4c4" />

### If using global `bd` in PATH

You can omit `BEADS_BIN`, and the wrapper will use:

- Windows: `bd.exe`
- Linux/macOS: `bd`

## Environment Variables

The wrapper supports these environment variables:

- `BEADS_CWD`: default working directory for all Beads commands
- `BEADS_BIN`: full path to Beads binary (`bd.exe` on Windows)

Notes:

- If a tool call passes `cwd`, that value overrides `BEADS_CWD`.
- `cwd` can be a normal path or a `file:///` URI.

## How To Use

1. Save `mcp.json` changes.
2. Reload VS Code window.
3. Start (or restart) the `beads-wrapper` MCP server.
4. Call tools from your MCP client.

## Typical Flow

Initialize Beads in your project:

- `beads_init` with `cwd`

Check ready work:

- `beads_ready`

Create an issue:

- `beads_create` with `title`, optional `type`, optional `priority`

Inspect and close:

- `beads_show`
- `beads_close`

## First-Time Validation Checklist

Use this order when validating a new machine:

1. `beads_exec` with args `['--version']`
2. `beads_init`
3. `beads_ready`
4. `beads_create`
5. `beads_list`

## Troubleshooting

### Server shows Running but no output

This is normal for stdio MCP servers. They are mostly silent until a tool is called.

### `spawn EINVAL`

Usually means child-process execution/config mismatch on Windows.

Check:

1. `command` is `node` (or full path to `node.exe`)
2. `args` points to the real `server.mjs`
3. `BEADS_BIN` points to a valid `bd.exe`
4. Restart MCP server after config changes

### Beads command fails with Dolt error

Example symptoms:

- "failed to open Dolt store"
- "dolt is not installed"

Fix:

1. Install Dolt
2. Ensure `dolt` is in PATH
3. Restart VS Code and rerun `beads_init`

### `beads_init` succeeds but warns about server host

If you see a warning about host defaulting to `127.0.0.1`, this is informational for local use.
For remote Dolt, configure host explicitly through Beads/Dolt settings.

## Publishing Notes

If you share/upload this wrapper, document these external requirements clearly:

1. Node.js runtime
2. `@beads/bd` installation (global or local)
3. Dolt installation and runtime availability

Without Dolt, the MCP wrapper can start, but Beads initialization and state operations will fail.

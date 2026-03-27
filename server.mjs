import { spawn } from 'node:child_process';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const isWindows = process.platform === 'win32';

// Resolve constants first — normalizeCwd depends on defaultCwd
const defaultCwd = process.env.BEADS_CWD ?? process.cwd();

// Point to your bd.exe explicitly, or fall back to 'bd' on PATH
const bdBin = process.env.BEADS_BIN ?? (isWindows ? 'bd.exe' : 'bd');

function normalizeCwd(cwd) {
  if (!cwd || typeof cwd !== 'string') return defaultCwd;
  if (cwd.startsWith('file:///')) {
    const decoded = decodeURIComponent(cwd.replace('file:///', ''));
    return isWindows ? decoded.replace(/\//g, '\\') : `/${decoded}`;
  }
  return cwd;
}

const server = new McpServer(
  { name: 'beads-mcp-server', version: '0.1.0' },
  { capabilities: { logging: {} } }
);

function quoteArg(arg) {
  if (/^[a-zA-Z0-9_./:@-]+$/.test(arg)) return arg;
  return `"${arg.replace(/(["\\$`])/g, '\\$1')}"`;
}

function runCommand(bin, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      cwd: normalizeCwd(cwd),
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: isWindows,   // needed on Windows to exec .exe and .cmd correctly
      windowsHide: true
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    child.on('error', (error) => {
      resolve({
        ok: false, code: null, stdout, stderr,
        error: `${String(error)} | bin=${bin} args=${JSON.stringify(args)}`
      });
    });

    child.on('close', (code) => {
      resolve({ ok: code === 0, code, stdout, stderr, error: null });
    });
  });
}

async function runBd(argv, cwd = defaultCwd) {
  const result = await runCommand(bdBin, argv, cwd);
  return {
    ...result,
    invocation: [bdBin, ...argv].map(quoteArg).join(' '),
    mode: 'direct'
  };
}

function toolResult(result, expectJson = false) {
  const base = {
    ok: result.ok,
    code: result.code,
    mode: result.mode,
    invocation: result.invocation,
    stdout: result.stdout,
    stderr: result.stderr,
    error: result.error
  };

  if (expectJson && result.stdout.trim()) {
    try {
      const parsed = JSON.parse(result.stdout);
      return {
        content: [{ type: 'text', text: `Beads OK: ${result.invocation}` }],
        structuredContent: { ...base, parsed }
      };
    } catch {
      // stdout wasn't JSON — fall through to text output
    }
  }

  const summary = result.ok
    ? `Beads command succeeded: ${result.invocation}`
    : `Beads command failed (code: ${String(result.code)}): ${result.invocation}`;

  return {
    isError: !result.ok,
    content: [{
      type: 'text',
      text: `${summary}\n\nstdout:\n${result.stdout || '<empty>'}\n\nstderr:\n${result.stderr || '<empty>'}${result.error ? `\n\nspawn error:\n${result.error}` : ''}`
    }],
    structuredContent: base
  };
}

// ── Tools ────────────────────────────────────────────────────────────────────

server.registerTool('beads_init', {
  description: 'Initialize a Beads database in a project directory.',
  inputSchema: z.object({ cwd: z.string().optional(), quiet: z.boolean().optional() })
}, async ({ cwd, quiet }) => {
  const argv = ['init'];
  if (quiet) argv.push('--quiet');
  return toolResult(await runBd(argv, cwd ?? defaultCwd), false);
});

server.registerTool('beads_ready', {
  description: 'List Beads issues ready to work on.',
  inputSchema: z.object({ cwd: z.string().optional(), json: z.boolean().optional().default(true) })
}, async ({ cwd, json }) => {
  const argv = ['ready'];
  if (json) argv.push('--json');
  return toolResult(await runBd(argv, cwd ?? defaultCwd), Boolean(json));
});

server.registerTool('beads_list', {
  description: 'List Beads issues.',
  inputSchema: z.object({ cwd: z.string().optional(), json: z.boolean().optional().default(true) })
}, async ({ cwd, json }) => {
  const argv = ['list'];
  if (json) argv.push('--json');
  return toolResult(await runBd(argv, cwd ?? defaultCwd), Boolean(json));
});

server.registerTool('beads_show', {
  description: 'Show one Beads issue by ID.',
  inputSchema: z.object({
    issueId: z.string(),
    cwd: z.string().optional(),
    json: z.boolean().optional().default(true)
  })
}, async ({ issueId, cwd, json }) => {
  const argv = ['show', issueId];
  if (json) argv.push('--json');
  return toolResult(await runBd(argv, cwd ?? defaultCwd), Boolean(json));
});

server.registerTool('beads_create', {
  description: 'Create a new Beads issue.',
  inputSchema: z.object({
    title: z.string(),
    cwd: z.string().optional(),
    type: z.string().optional(),
    priority: z.number().int().min(0).max(5).optional(),
    json: z.boolean().optional().default(true)
  })
}, async ({ title, cwd, type, priority, json }) => {
  const argv = ['create', title];
  if (type) argv.push('-t', type);
  if (priority !== undefined) argv.push('-p', String(priority));
  if (json) argv.push('--json');
  return toolResult(await runBd(argv, cwd ?? defaultCwd), Boolean(json));
});

server.registerTool('beads_close', {
  description: 'Close a Beads issue.',
  inputSchema: z.object({
    issueId: z.string(),
    cwd: z.string().optional(),
    reason: z.string().optional(),
    json: z.boolean().optional().default(true)
  })
}, async ({ issueId, cwd, reason, json }) => {
  const argv = ['close', issueId];
  if (reason) argv.push('--reason', reason);
  if (json) argv.push('--json');
  return toolResult(await runBd(argv, cwd ?? defaultCwd), Boolean(json));
});

server.registerTool('beads_dep_add', {
  description: 'Add a dependency from one issue to another.',
  inputSchema: z.object({
    fromIssueId: z.string(),
    toIssueId: z.string(),
    cwd: z.string().optional(),
    json: z.boolean().optional().default(true)
  })
}, async ({ fromIssueId, toIssueId, cwd, json }) => {
  const argv = ['dep', 'add', fromIssueId, toIssueId];
  if (json) argv.push('--json');
  return toolResult(await runBd(argv, cwd ?? defaultCwd), Boolean(json));
});

server.registerTool('beads_exec', {
  description: 'Run an arbitrary bd command for advanced usage.',
  inputSchema: z.object({
    args: z.array(z.string()).min(1),
    cwd: z.string().optional(),
    expectJson: z.boolean().optional().default(false)
  })
}, async ({ args, cwd, expectJson }) => {
  return toolResult(await runBd(args, cwd ?? defaultCwd), Boolean(expectJson));
});

// ── Start ────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`beads-mcp-server running | bin=${bdBin} cwd=${defaultCwd}`);
}

main().catch((error) => {
  console.error('Fatal error in beads-mcp-server:', error);
  process.exit(1);
});
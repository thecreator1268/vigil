#!/usr/bin/env node
// PreToolUse hook: refuse any Edit/Write/NotebookEdit that touches secrets/
// or a .env* file, anywhere in the repo. Exit 2 blocks the call.
import { readFileSync } from 'node:fs';

const BLOCKED_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit']);

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0); // malformed input — fail open, don't break unrelated tools
}

const { tool_name: toolName, tool_input: toolInput } = input;
if (!BLOCKED_TOOLS.has(toolName)) process.exit(0);

const path = (toolInput?.file_path ?? '').replace(/\\/g, '/');
const base = path.split('/').pop() ?? '';

const isSecrets = /\/secrets\//.test(`/${path}`) || /^secrets\//.test(path);
const isEnv = /^\.env/.test(base);

if (isSecrets || isEnv) {
  process.stderr.write(
    `Blocked: ${toolName} on "${path}". secrets/ and .env* files are off-limits — ` +
      `never read, edit, or print their contents.\n`,
  );
  process.exit(2);
}

process.exit(0);

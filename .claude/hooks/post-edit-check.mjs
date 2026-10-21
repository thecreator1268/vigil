#!/usr/bin/env node
// PostToolUse hook: after an Edit/Write/NotebookEdit, lint and typecheck just
// the workspace package the changed file lives in. Fast, scoped feedback
// instead of waiting for a full `pnpm lint && pnpm typecheck` at the end.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const { tool_name: toolName, tool_input: toolInput } = input;
if (!['Edit', 'Write', 'NotebookEdit'].includes(toolName)) process.exit(0);

const filePath = toolInput?.file_path;
if (!filePath || !/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(filePath)) process.exit(0);

const rel = relative(ROOT, filePath).replace(/\\/g, '/');
const parts = rel.split('/');
if (!['apps', 'packages', 'services'].includes(parts[0]) || parts.length < 2) process.exit(0);

const pkgDir = join(ROOT, parts[0], parts[1]);
const pkgJsonPath = join(pkgDir, 'package.json');
if (!existsSync(pkgJsonPath)) process.exit(0);

const pkgName = JSON.parse(readFileSync(pkgJsonPath, 'utf8')).name;
const problems = [];

const eslintConfigExists = existsSync(join(ROOT, 'eslint.config.js')) || existsSync(join(ROOT, 'eslint.config.mjs'));
if (eslintConfigExists) {
  const lint = spawnSync('npx', ['eslint', relative(ROOT, filePath)], { cwd: ROOT, encoding: 'utf8', shell: true });
  if (lint.status !== 0) problems.push(`eslint:\n${lint.stdout}${lint.stderr}`);
}

const hasTypecheck = JSON.parse(readFileSync(pkgJsonPath, 'utf8')).scripts?.typecheck;
if (hasTypecheck && pkgName) {
  const tsc = spawnSync('npx', ['pnpm', '--filter', pkgName, 'typecheck'], { cwd: ROOT, encoding: 'utf8', shell: true });
  if (tsc.status !== 0) problems.push(`typecheck (${pkgName}):\n${tsc.stdout}${tsc.stderr}`);
}

if (problems.length) {
  process.stderr.write(problems.join('\n\n'));
  process.exit(2); // surfaced to Claude as feedback; the edit itself already happened
}

process.exit(0);

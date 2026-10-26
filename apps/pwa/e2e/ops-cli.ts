/**
 * Drives the REAL ops CLI (services/counselor-identity-service/src/cli.ts,
 * built to dist/cli.js) inside the running container via `docker compose
 * exec`, exactly as an operator would — never reads secrets/ from the host.
 * The container already has /run/secrets/internal_token mounted by Compose.
 */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function run(args: string[]): Record<string, unknown> {
  const out = execFileSync('docker', ['compose', 'exec', '-T', 'counselor-identity-service', 'node', 'dist/cli.js', ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  const lastLine = out.trim().split('\n').pop() ?? '{}';
  return JSON.parse(lastLine);
}

let operatorCounter = 0;

/** Bootstraps a brand-new counselor and returns a one-time enrollment token for their first passkey. */
export function bootstrapCounselor(counselorId: string): string {
  const operatorId = `e2e-op-${Date.now()}-${operatorCounter++}`;
  const { token } = run(['add-operator', operatorId, 'E2E test operator']) as { token: string };
  const { enrollmentToken } = run(['bootstrap', counselorId, '--operator-id', operatorId, '--operator-token', token]) as { enrollmentToken: string };
  return enrollmentToken;
}

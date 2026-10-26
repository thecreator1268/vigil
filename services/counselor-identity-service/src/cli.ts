#!/usr/bin/env node
/**
 * Ops CLI for counselor recovery — deliberately NOT an HTTP route reachable
 * from the public internet. Run on a host with network access to the
 * service and the `internal_token` secret. See
 * docs/design/counselor-passkey-login.md §4 for why recovery is an
 * out-of-band, two-distinct-operator process rather than an admin-console
 * feature.
 *
 * Usage:
 *   ops add-operator <operatorId> <displayName>
 *   ops bootstrap <counselorId> --operator-id <id> --operator-token <token>
 *   ops recovery-request <counselorId> --operator-id <id> --operator-token <token>
 *   ops recovery-approve <requestId> --operator-id <id> --operator-token <token>
 */
import { readSecret } from '@vigil/service-kit';

function print(line: string): void {
  process.stdout.write(`${line}\n`);
}

function flag(args: string[], name: string): string {
  const i = args.indexOf(`--${name}`);
  if (i === -1 || !args[i + 1]) throw new Error(`Missing --${name}`);
  return args[i + 1] as string;
}

async function call(baseUrl: string, internalToken: string, path: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-vigil-internal-token': internalToken },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${path} failed (${res.status}): ${JSON.stringify(json)}`);
  return json;
}

export async function runCli(argv: string[], env = process.env): Promise<unknown> {
  const [command, ...rest] = argv;
  const baseUrl = env.COUNSELOR_IDENTITY_URL ?? 'http://localhost:3000';
  const internalToken = readSecret('internal_token') as string;

  switch (command) {
    case 'add-operator': {
      const [operatorId, displayName] = rest;
      if (!operatorId || !displayName) throw new Error('Usage: add-operator <operatorId> <displayName>');
      const result = await call(baseUrl, internalToken, '/internal/ops/operators', { operatorId, displayName });
      print('Operator token (store this now — it is never shown again):');
      print(JSON.stringify(result));
      return result;
    }
    case 'bootstrap': {
      const [counselorId] = rest;
      if (!counselorId) throw new Error('Usage: bootstrap <counselorId> --operator-id <id> --operator-token <token>');
      const result = await call(baseUrl, internalToken, '/internal/ops/bootstrap', {
        counselorId, operatorId: flag(rest, 'operator-id'), operatorToken: flag(rest, 'operator-token'),
      });
      print(JSON.stringify(result));
      return result;
    }
    case 'recovery-request': {
      const [counselorId] = rest;
      if (!counselorId) throw new Error('Usage: recovery-request <counselorId> --operator-id <id> --operator-token <token>');
      const result = await call(baseUrl, internalToken, '/internal/ops/recovery/request', {
        counselorId, operatorId: flag(rest, 'operator-id'), operatorToken: flag(rest, 'operator-token'),
      });
      print('Recovery request created — a DIFFERENT operator must now approve it:');
      print(JSON.stringify(result));
      return result;
    }
    case 'recovery-approve': {
      const [requestId] = rest;
      if (!requestId) throw new Error('Usage: recovery-approve <requestId> --operator-id <id> --operator-token <token>');
      const result = await call(baseUrl, internalToken, '/internal/ops/recovery/approve', {
        requestId, operatorId: flag(rest, 'operator-id'), operatorToken: flag(rest, 'operator-token'),
      });
      print('Enrollment token (relay out-of-band — never email/SMS it):');
      print(JSON.stringify(result));
      return result;
    }
    default:
      throw new Error(`Unknown command: ${command ?? '<none>'}`);
  }
}

if (process.argv[1]?.endsWith('cli.ts') || process.argv[1]?.endsWith('cli.js')) {
  runCli(process.argv.slice(2)).catch((err) => {
    console.error(String(err));
    process.exit(1);
  });
}

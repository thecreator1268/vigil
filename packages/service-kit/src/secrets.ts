import { existsSync, readFileSync } from 'node:fs';

/**
 * Read a secret from a Docker/Kubernetes secret file (`/run/secrets/<name>`),
 * from the path in `<NAME>_PATH`, or — for tests and local runs only — from
 * the env var `<NAME>`. Secrets are never baked into images.
 */
export function readSecret(name: string, opts: { optional?: boolean } = {}): string | undefined {
  const envName = name.toUpperCase();
  const explicitPath = process.env[`${envName}_PATH`];
  const candidates = [explicitPath, `/run/secrets/${name}`].filter((p): p is string => !!p);
  for (const p of candidates) {
    if (existsSync(p)) return readFileSync(p, 'utf8').trim();
  }
  const fromEnv = process.env[envName];
  if (fromEnv) return fromEnv;
  if (opts.optional) return undefined;
  throw new Error(`Secret "${name}" not found (looked in ${candidates.join(', ') || 'no paths'} and $${envName})`);
}

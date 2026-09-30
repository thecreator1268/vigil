#!/usr/bin/env node
// Generates local-development secrets into ./secrets (git-ignored).
// Production secrets come from the cluster's secret store — never from here.
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import selfsigned from 'selfsigned';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'secrets');
const force = process.argv.includes('--force');
mkdirSync(dir, { recursive: true });

function write(name, contents) {
  const path = join(dir, name);
  if (existsSync(path) && !force) {
    console.log(`  keep   secrets/${name}`);
    return;
  }
  writeFileSync(path, contents, { mode: 0o600 });
  console.log(`  wrote  secrets/${name}`);
}

console.log('Generating VIGIL dev secrets…');

if (force || !existsSync(join(dir, 'jwt_private_key.pem'))) {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  write('jwt_public_key.pem', publicKey.export({ type: 'spki', format: 'pem' }));
  write('jwt_private_key.pem', privateKey.export({ type: 'pkcs8', format: 'pem' }));
} else {
  console.log('  keep   secrets/jwt_*_key.pem');
}

if (force || !existsSync(join(dir, 'tls_cert.pem'))) {
  const pems = await selfsigned.generate([{ name: 'commonName', value: 'gateway' }], {
    keySize: 2048,
    algorithm: 'sha256',
    extensions: [{ name: 'subjectAltName', altNames: [
      { type: 2, value: 'gateway' },
      { type: 2, value: 'localhost' },
      { type: 7, ip: '127.0.0.1' },
    ] }],
  });
  write('tls_cert.pem', pems.cert);
  write('tls_key.pem', pems.private);
} else {
  console.log('  keep   secrets/tls_*.pem');
}

write('field_encryption_key', randomBytes(32).toString('base64'));
write('internal_token', randomBytes(32).toString('hex'));
console.log('Done.');

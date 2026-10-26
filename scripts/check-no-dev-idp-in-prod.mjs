#!/usr/bin/env node
// Fails if the dev-only identity provider (dev-idp) could ever run, or be
// reachable, in a production deployment. Run by CI on every PR — see
// docs/design/counselor-passkey-login.md §6 for why this exists: the
// gateway and dev-idp both now refuse to BOOT outside an explicit
// development/test NODE_ENV, but that's a runtime guard; this is the
// static, "never even shipped this way" guard for the files that describe
// production deployments themselves.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { glob } from 'node:fs/promises';

const ROOT = join(import.meta.dirname, '..');
let failures = 0;

function fail(file, reason) {
  console.error(`::error file=${file}::${reason}`);
  failures++;
}

function read(relPath) {
  return readFileSync(join(ROOT, relPath), 'utf8');
}

// Comments may legitimately document dev-idp's absence (that's the GOOD
// case) — only real YAML content (resource names, image refs, env values)
// should trip these checks.
function stripYamlComments(text) {
  return text
    .split('\n')
    .map((line) => line.replace(/#.*$/, ''))
    .join('\n');
}

// 1. infra/k8s must never mention dev-idp at all — it's not in that
//    deployment target by design (CLAUDE.md: "must never be referenced
//    from a production compose/k8s profile").
for await (const file of glob('infra/k8s/**/*.yaml', { cwd: ROOT })) {
  const text = stripYamlComments(read(file));
  if (/dev-idp/i.test(text)) {
    fail(file, 'References dev-idp. infra/k8s is a production-only deployment target; dev-idp must never appear here.');
  }
}

// 2. infra/compose.prod.yml: the dev-idp service, if present at all, must
//    stay behind the dev-only profile, and nothing in this file may force
//    dev tokens on (DEV_IDP_ENABLED=true) or point the gateway at a
//    dev-idp URL.
const prodCompose = stripYamlComments(read('infra/compose.prod.yml'));
const devIdpBlockMatch = prodCompose.match(/^ {2}dev-idp:\n([\s\S]*?)(?=\n\S|$)/m);
if (devIdpBlockMatch && !/profiles:\s*\[\s*dev-only\s*\]/.test(devIdpBlockMatch[1])) {
  fail('infra/compose.prod.yml', 'dev-idp service is defined but not gated behind `profiles: [dev-only]`.');
}
if (/DEV_IDP_ENABLED:\s*["']?true["']?/i.test(prodCompose)) {
  fail('infra/compose.prod.yml', 'DEV_IDP_ENABLED is set to true. Production must never enable dev tokens.');
}
if (/DEV_IDP_URL:\s*["']?http/i.test(prodCompose)) {
  fail('infra/compose.prod.yml', 'DEV_IDP_URL points somewhere non-empty. Production must keep this empty (gateway refuses to boot otherwise is a runtime guard, not a substitute for this).');
}

// 3. Belt-and-suspenders: scan EVERY file under infra/ that looks
//    production-labelled (by filename) for the same two red flags, in case
//    a future environment-specific override file is added under a
//    different name.
for await (const file of glob('infra/**/*.{yml,yaml}', { cwd: ROOT })) {
  if (!/prod/i.test(file)) continue;
  if (file === 'infra/compose.prod.yml') continue; // already checked precisely above
  const text = stripYamlComments(read(file));
  if (/DEV_IDP_ENABLED:\s*["']?true["']?/i.test(text)) fail(file, 'DEV_IDP_ENABLED is set to true in a production-labelled file.');
}

// 4. The gateway must never be directly reachable in production — only
//    Caddy (compose) or the Ingress -> pwa (k8s) are allowed public entry
//    points. See docs/design/counselor-passkey-login.md §5 (review round 3,
//    item 1): a direct path to the gateway is exactly what lets a forged
//    X-Forwarded-For bypass the trusted-proxy check.
const prodComposeGatewayBlock = prodCompose.match(/^ {2}gateway:\n([\s\S]*?)(?=\n {2}\S|\nvolumes:|(?![\s\S]))/m);
if (!prodComposeGatewayBlock || !/ports:\s*!reset\s*\[\s*\]/.test(prodComposeGatewayBlock[1])) {
  fail('infra/compose.prod.yml', 'gateway service does not reset ports to empty (`ports: !reset []`) — it would inherit the host port published in the base compose file.');
}

for await (const file of glob('infra/k8s/**/*.yaml', { cwd: ROOT })) {
  const text = stripYamlComments(read(file));
  // Any Service selecting the gateway must stay ClusterIP (the implicit
  // default — i.e. no `type:` override to NodePort/LoadBalancer at all).
  for (const svcBlock of text.matchAll(/kind:\s*Service[\s\S]*?(?=\n---|\n*$)/g)) {
    const block = svcBlock[0];
    if (/name:\s*gateway\b/.test(block) && /type:\s*(NodePort|LoadBalancer)/i.test(block)) {
      fail(file, 'A Service selecting the gateway is typed NodePort/LoadBalancer, which would expose it directly instead of routing through the Ingress -> pwa path.');
    }
  }
  // No Ingress resource may backend directly to the gateway service — only
  // pwa is allowed to be a public Ingress backend.
  for (const ingressBlock of text.matchAll(/kind:\s*Ingress[\s\S]*?(?=\n---|\n*$)/g)) {
    if (/service:\s*\{\s*name:\s*gateway\b|name:\s*gateway\s*$/m.test(ingressBlock[0])) {
      fail(file, 'An Ingress resource backends directly to the gateway service. Only pwa may be a public Ingress backend.');
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} problem(s) found — the dev identity provider must never be reachable in production.`);
  process.exit(1);
}
console.log('OK — no production compose file or Kubernetes manifest enables or references dev-idp.');

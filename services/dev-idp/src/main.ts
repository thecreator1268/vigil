import { readSecret, start } from '@vigil/service-kit';
import { buildIdp } from './app.js';

async function main() {
  const app = await buildIdp({
    privateKeyPem: readSecret('jwt_private_key') as string,
    issuer: process.env.JWT_ISSUER ?? 'https://idp.vigil.local',
    audience: process.env.JWT_AUDIENCE ?? 'vigil-api',
    enabled: process.env.DEV_IDP_ENABLED === 'true',
  });
  app.log.warn('dev-idp running — development tokens only, never deploy to production');
  await start(app);
}

main().catch((err) => {
  console.error(JSON.stringify({ level: 'fatal', service: 'dev-idp', msg: 'startup failed', err: String(err) }));
  process.exit(1);
});

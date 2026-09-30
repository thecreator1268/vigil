// Generates TypeScript types + a JSON copy of the OpenAPI contract.
// CI runs this and fails on `git diff --exit-code` so the generated files can
// never drift from openapi.yaml.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';
import { parse } from 'yaml';

const pkg = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(pkg, 'src', 'generated');
mkdirSync(out, { recursive: true });

const source = readFileSync(join(pkg, 'openapi.yaml'), 'utf8');
const doc = parse(source);

const banner = '// AUTO-GENERATED from openapi.yaml by scripts/generate.mjs — do not edit.\n';
writeFileSync(
  join(out, 'openapi-document.ts'),
  `${banner}/* eslint-disable */\nexport const openApiDocument = ${JSON.stringify(doc, null, 2)} as const;\n`,
);

const ast = await openapiTS(doc, { exportType: true, alphabetize: false });
writeFileSync(join(out, 'openapi.ts'), `${banner}/* eslint-disable */\n${astToString(ast)}`);
console.log('Generated src/generated/{openapi.ts,openapi-document.ts}');

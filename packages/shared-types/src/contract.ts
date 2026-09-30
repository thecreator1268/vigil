/**
 * Contract-test helpers: validate real request/response payloads against the
 * OpenAPI 3.1 document itself (JSON Schema 2020-12), not against the Zod mirror.
 * Used by every service's contract tests and by the frontend API client tests.
 */
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { openApiDocument } from './generated/openapi-document.js';

type Json = unknown;
type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

const DEFS_ID = 'vigil-contract';

function rewriteRefs(node: Json): Json {
  if (Array.isArray(node)) return node.map(rewriteRefs);
  if (node && typeof node === 'object') {
    const out: Record<string, Json> = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === '$ref' && typeof v === 'string') {
        out[k] = v.replace('#/components/schemas/', `${DEFS_ID}#/$defs/`);
      } else {
        out[k] = rewriteRefs(v);
      }
    }
    return out;
  }
  return node;
}

interface ResponseObject {
  $ref?: string;
  content?: { 'application/json'?: { schema: Json } };
}

export class ContractError extends Error {
  constructor(
    message: string,
    readonly errors: unknown,
  ) {
    super(message);
  }
}

export function createContractValidator() {
  // Ajv's CJS/ESM interop differs between bundlers; normalise the constructor.
  const AjvCtor = ((Ajv2020 as unknown as { default?: typeof Ajv2020 }).default ?? Ajv2020) as typeof Ajv2020;
  const formats = ((addFormats as unknown as { default?: typeof addFormats }).default ?? addFormats) as typeof addFormats;
  const ajv = new AjvCtor({ allErrors: true, strict: false });
  formats(ajv);
  ajv.addSchema({ $id: DEFS_ID, $defs: rewriteRefs(openApiDocument.components.schemas) as object });

  const doc = openApiDocument as unknown as {
    paths: Record<string, Record<string, { requestBody?: { content: Record<string, { schema: Json }> }; responses: Record<string, ResponseObject> }>>;
    components: { responses: Record<string, ResponseObject> };
  };

  function operation(method: Method, path: string) {
    const op = doc.paths[path]?.[method];
    if (!op) throw new ContractError(`No operation ${method.toUpperCase()} ${path} in contract`, null);
    return op;
  }

  function check(schema: Json, body: unknown, label: string) {
    const validate = ajv.compile(rewriteRefs(schema) as object);
    if (!validate(body)) {
      throw new ContractError(`${label} violates contract: ${ajv.errorsText(validate.errors)}`, validate.errors);
    }
  }

  return {
    /** Throws ContractError if `body` is not a valid response for method+path+status. */
    assertResponse(method: Method, path: string, status: number, body: unknown) {
      const op = operation(method, path);
      let resp = op.responses[String(status)];
      if (!resp) {
        throw new ContractError(`${method.toUpperCase()} ${path} does not declare status ${status}`, null);
      }
      if (resp.$ref) {
        const name = resp.$ref.split('/').pop() as string;
        resp = doc.components.responses[name] as ResponseObject;
      }
      const schema = resp.content?.['application/json']?.schema;
      if (schema) check(schema, body, `${method.toUpperCase()} ${path} ${status} response`);
    },
    /** Throws ContractError if `body` is not a valid request body for method+path. */
    assertRequest(method: Method, path: string, body: unknown) {
      const schema = operation(method, path).requestBody?.content['application/json']?.schema;
      if (!schema) throw new ContractError(`${method.toUpperCase()} ${path} has no request body`, null);
      check(schema, body, `${method.toUpperCase()} ${path} request`);
    },
    /** Validate against a named component schema. */
    assertSchema(name: string, body: unknown) {
      check({ $ref: `#/components/schemas/${name}` }, body, `schema ${name}`);
    },
  };
}

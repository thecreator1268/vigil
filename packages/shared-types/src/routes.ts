import { openApiDocument } from './generated/openapi-document.js';

export type Scope = 'victim' | 'counselor' | 'admin';
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ContractRoute {
  operationId: string;
  method: HttpMethod;
  /** OpenAPI-style path, e.g. /v1/victims/{id}/trend */
  path: string;
  /** Fastify/find-my-way style path, e.g. /v1/victims/:id/trend */
  routePath: string;
  service: string;
  scopes: readonly Scope[];
}

interface OperationLike {
  operationId: string;
  'x-vigil-service': string;
  'x-vigil-scopes': readonly Scope[];
}

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

/** Every operation in the contract, with the scopes the gateway must enforce. */
export const contractRoutes: readonly ContractRoute[] = Object.entries(
  openApiDocument.paths as Record<string, Partial<Record<(typeof METHODS)[number], OperationLike>>>,
).flatMap(([path, item]) =>
  METHODS.flatMap((m) => {
    const op = item[m];
    if (!op) return [];
    return [
      {
        operationId: op.operationId,
        method: m.toUpperCase() as HttpMethod,
        path,
        routePath: path.replace(/\{(\w+)\}/g, ':$1'),
        service: op['x-vigil-service'],
        scopes: op['x-vigil-scopes'],
      },
    ];
  }),
);

export const ADMIN_PREFIX = '/v1/admin/';

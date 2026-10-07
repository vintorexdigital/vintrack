import { Controller, Inject, Module, type Provider, type Type } from '@nestjs/common';
import type { EntityKit } from '@trackrex/schemas';
import { RequiresModule } from '../../core/auth/decorators.js';
import { Db } from '../../core/database/db.service.js';
import { AuditService } from '../../core/audit.service.js';
import { OutboxService } from '../../core/outbox.service.js';
import { Authz, ScopeResolver } from '../../core/rbac.service.js';
import { SequencesService } from '../../core/sequences.service.js';
import { CrudController } from './crud.controller.js';
import { CrudRepository } from './crud.repository.js';
import { CrudService, type CrudDeps } from './crud.service.js';

export interface ResourceInfo {
  kit: EntityKit;
  /** Path under /v1, no leading slash. */
  apiPath: string;
}

/** Every mounted CRUD resource, read by the OpenAPI generator and the permission matrix tests. */
export const RESOURCES: ResourceInfo[] = [];

export const apiPathFor = (kit: EntityKit): string => kit.def.path.replace(/^\//, '');

export interface CrudParts {
  kit: EntityKit;
  token: string;
  Service: Type<CrudService>;
  Controller: Type<CrudController>;
  depsProvider: Provider;
}

/**
 * Build the service and controller for an entity. Entities with custom logic pass their own
 * subclasses; plain entities need nothing but the kit.
 */
export function crudParts(kit: EntityKit, opts: { service?: Type<CrudService> } = {}): CrudParts {
  const token = `CRUD_SERVICE:${kit.def.key}`;
  const Base = opts.service ?? CrudService;
  const depsProvider: Provider = {
    provide: 'CRUD_DEPS',
    inject: [Db, Authz, ScopeResolver, AuditService, SequencesService, OutboxService],
    useFactory: (db: Db, authz: Authz, scope: ScopeResolver, audit: AuditService, sequences: SequencesService, outbox: OutboxService): CrudDeps => ({
      repo: new CrudRepository(kit, db), authz, scope, audit, sequences, outbox,
    }),
  };
  class C extends CrudController {
    constructor(@Inject(token) service: CrudService) {
      super(service);
    }
  }
  Controller(apiPathFor(kit))(C);
  if (kit.def.licenseModule) RequiresModule(kit.def.licenseModule)(C);
  RESOURCES.push({ kit, apiPath: apiPathFor(kit) });
  return { kit, token, Service: Base, Controller: C, depsProvider };
}

/** One-line module for a plain CRUD entity. */
export function crudModule(kit: EntityKit): Type<unknown> {
  const p = crudParts(kit);
  @Module({
    controllers: [p.Controller],
    providers: [p.depsProvider, { provide: p.token, useClass: p.Service }],
    exports: [p.token],
  })
  class EntityModule {}
  Object.defineProperty(EntityModule, 'name', { value: `${kit.def.key}-module` });
  return EntityModule;
}

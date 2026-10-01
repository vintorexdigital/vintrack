import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Db } from '../../core/database/db.service.js';
import { CrudService, type CrudDeps } from '../../shared/crud/crud.service.js';
import type { Row } from '../../shared/crud/crud.repository.js';

export const CONTACTS_SERVICE = 'CRUD_SERVICE:contacts';

/** A customer has at most one primary contact; marking another demotes the rest. */
@Injectable()
export class ContactsService extends CrudService {
  constructor(@Inject('CRUD_DEPS') deps: CrudDeps, private readonly pg: Db) {
    super(deps);
  }

  private async demoteOthers(row: Row): Promise<void> {
    if (!row.isPrimary) return;
    await this.pg.q.execute(sql`update contacts set is_primary = false, updated_at = now(), version = version + 1 where customer_id = ${row.customerId as string}::uuid and id <> ${row.id}::uuid and is_primary and deleted_at is null`);
  }
  protected override async afterCreate(row: Row): Promise<void> { await this.demoteOthers(row); }
  protected override async afterUpdate(_before: Row, after: Row): Promise<void> { await this.demoteOthers(after); }
}

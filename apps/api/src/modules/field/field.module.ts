import { Module } from '@nestjs/common';
import { geoFences } from '@trackrex/schemas';
import { crudModule } from '../../shared/crud/crud.factory.js';

/** Field operations: geo-fences now; customers, contacts and tasks join in Phase 3. */
@Module({ imports: [crudModule(geoFences)] })
export class FieldModule {}

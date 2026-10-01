'use client';
import { CrudListPage } from '@/shared/crud';
import { resources } from '@/features/resources';

export default function Page() {
  return <CrudListPage resource={resources.employeeTypes} />;
}

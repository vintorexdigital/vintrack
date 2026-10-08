'use client';
import { CrudForm } from '@/shared/crud';
import { resources } from '@/features/resources';

export default function Page() {
  return <CrudForm resource={resources.expenseCategories} />;
}

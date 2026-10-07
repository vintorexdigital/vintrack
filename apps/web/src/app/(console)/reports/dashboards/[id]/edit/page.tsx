'use client';
import { useParams } from 'next/navigation';
import { CrudDetail } from '@/shared/crud';
import { resources } from '@/features/resources';

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <CrudDetail resource={resources.dashboards} id={id} />;
}

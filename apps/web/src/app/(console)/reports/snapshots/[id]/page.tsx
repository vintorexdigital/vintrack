'use client';
import { useParams } from 'next/navigation';
import { SnapshotView } from '@/features/report-builder/snapshot-view';

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <SnapshotView id={id} />;
}

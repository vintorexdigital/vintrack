'use client';
import { useParams } from 'next/navigation';
import { SavedReportView } from '@/features/report-builder/saved-report-view';

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <SavedReportView id={id} />;
}

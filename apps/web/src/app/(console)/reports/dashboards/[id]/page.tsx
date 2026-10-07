'use client';
import { useParams } from 'next/navigation';
import { DashboardView } from '@/features/report-builder/dashboard-view';

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <DashboardView id={id} />;
}

'use client';
import { useParams } from 'next/navigation';
import { CaseDetail } from '@/features/onboarding/checklists';

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <CaseDetail id={id} />;
}

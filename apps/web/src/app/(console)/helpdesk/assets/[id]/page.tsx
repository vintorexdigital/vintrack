'use client';
import { useParams } from 'next/navigation';
import { AssetDetail } from '@/features/helpdesk/assets';

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <AssetDetail id={id} />;
}

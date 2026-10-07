'use client';
import { useParams } from 'next/navigation';
import { TicketDetail } from '@/features/helpdesk/tickets';

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <TicketDetail id={id} />;
}

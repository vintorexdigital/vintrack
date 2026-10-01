'use client';
import { PageHeader } from '@trackrex/ui';
import { BalanceStrip } from '@/features/leave/balances';
import { CrudListPage } from '@/shared/crud';
import { resources } from '@/features/resources';

export default function MyLeavePage() {
  return (
    <>
      <PageHeader title="My leave" scope="Employee" description="Your balances and requests. Apply with live validation against your leave rules." />
      <BalanceStrip />
      <CrudListPage resource={resources.leaveRequests} />
    </>
  );
}

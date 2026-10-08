'use client';
import { Skeleton } from '@trackrex/ui';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/shared/auth/auth';
import { AppShell } from '@/shared/layout/app-shell';

/** Everything under (console) needs a signed-in company user. */
export default function ConsoleLayout({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  useEffect(() => { if (status === 'anonymous') router.replace('/sign-in'); }, [status, router]);
  if (status !== 'authenticated') {
    return <div className="space-y-3 p-6" aria-busy="true" aria-label="Loading"><Skeleton className="h-8 w-48" /><Skeleton className="h-64" /></div>;
  }
  return <AppShell>{children}</AppShell>;
}

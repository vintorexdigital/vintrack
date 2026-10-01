'use client';
import { Banner } from '@trackrex/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { tokenStore } from '@/shared/api/client';
import { useAuth } from '@/shared/auth/auth';

/** Landing for a platform support hand-off. The token rides in the URL fragment so it never reaches a server log. */
export default function SupportEntry() {
  const router = useRouter();
  const { reload } = useAuth();
  const [error, setError] = useState('');
  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
    history.replaceState(null, '', '/support');
    if (!token) { setError('This support link is missing its token. Start the session again from the platform console.'); return; }
    tokenStore.set(token);
    reload().then(() => router.replace('/'), () => { tokenStore.set(null); setError('This support session has expired or was ended.'); });
  }, [reload, router]);
  return <main id="main" className="mx-auto max-w-md p-6">{error ? <Banner tone="error">{error}</Banner> : <p role="status" className="text-sm text-muted">Opening support session…</p>}</main>;
}

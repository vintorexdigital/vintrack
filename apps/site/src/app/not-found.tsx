import Link from 'next/link';

export default function NotFound() {
  return <div className="mx-auto max-w-xl px-4 py-24 text-center"><h1 className="text-3xl font-semibold">Page not found</h1><p className="mt-2 text-muted">The page you wanted is not here. Try the <Link href="/help/">help center</Link> or go <Link href="/">home</Link>.</p></div>;
}

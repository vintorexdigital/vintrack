import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-32 text-center">
      <p className="mb-4 font-mono text-sm text-cyan-400">&gt;_ 404</p>
      <h1 className="hero-title text-4xl font-extrabold tracking-tight sm:text-5xl"><span className="gradient-text">Page not found</span></h1>
      <p className="mt-4 text-text-secondary">The page you wanted is not here. Try the <Link href="/help/">help center</Link> or go <Link href="/">home</Link>.</p>
    </div>
  );
}

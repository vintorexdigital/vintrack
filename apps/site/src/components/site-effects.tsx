'use client';

import { MessageCircle, Moon, Sun } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

const THEME_KEY = 'trackrex-site-theme';

export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');document.documentElement.setAttribute('data-theme',t==='light'?'light':'dark')}catch(e){document.documentElement.setAttribute('data-theme','dark')}})();`;

export function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [turns, setTurns] = useState(0);

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  }, []);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {}
    setTheme(next);
    setTurns((t) => t + 1);
  };

  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      className="group relative flex h-11 w-11 items-center justify-center rounded-lg text-text-secondary transition-all duration-300 hover:bg-surface-hover hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-cyan/50"
    >
      <span className="block transition-transform duration-500 ease-out" style={{ transform: `rotate(${turns * 360}deg)` }}>
        {theme === 'dark' ? <Sun className="size-5" aria-hidden /> : <Moon className="size-5" aria-hidden />}
      </span>
      <span className="pointer-events-none absolute -bottom-8 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-bg-secondary px-2 py-1 text-[10px] text-text-primary opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 sm:block">
        {theme === 'dark' ? 'Light mode' : 'Dark mode'}
      </span>
    </button>
  );
}

export function NavLinks({ items, variant = 'bar' }: { items: readonly (readonly [string, string])[]; variant?: 'bar' | 'menu' }) {
  const pathname = usePathname() || '/';
  const isActive = (href: string) => {
    const base = href.split('/').filter(Boolean)[0];
    return !!base && pathname.split('/').filter(Boolean)[0] === base;
  };

  if (variant === 'menu') {
    return (
      <>
        {items.map(([label, href]) => (
          <Link
            key={href}
            href={href}
            className={`flex min-h-11 items-center rounded-lg px-3.5 text-sm font-medium no-underline transition-colors ${
              isActive(href) ? 'bg-accent-cyan/10 text-accent-cyan' : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            }`}
          >
            {label}
          </Link>
        ))}
      </>
    );
  }

  return (
    <div className="flex items-center rounded-xl border border-border bg-surface/70 p-1 backdrop-blur-xl">
      {items.map(([label, href]) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`relative rounded-lg px-3 py-2 text-sm font-medium no-underline transition-all duration-200 ${
              active ? 'bg-accent-cyan/10 text-accent-cyan' : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            }`}
          >
            {label}
            {active && <span className="absolute -bottom-1 left-3 right-3 h-px rounded-full bg-accent-cyan" />}
          </Link>
        );
      })}
    </div>
  );
}

/** Fixed header shell: transparent at the top, glassier and shadowed once the page scrolls. */
export function HeaderShell({ children }: { children: React.ReactNode }) {
  const [scrolled, setScrolled] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, window.scrollY / max) : 0;
      setScrolled(window.scrollY > 24);
      setProgress(p);
      document.documentElement.style.setProperty('--scroll-progress', p.toFixed(4));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return (
    <nav
      aria-label="Main"
      className={`fixed left-0 right-0 top-0 z-40 transition-all duration-500 ${
        scrolled ? 'border-b border-border bg-bg-primary/70 shadow-lg shadow-black/10 backdrop-blur-xl' : 'bg-bg-primary/20 backdrop-blur-sm'
      }`}
    >
      <div
        aria-hidden
        className="absolute left-0 top-0 h-0.5 bg-gradient-to-r from-cyan-500 via-violet-500 to-rose-500 transition-[width] duration-150"
        style={{ width: `${progress * 100}%` }}
      />
      {children}
    </nav>
  );
}

/** Tracks which [data-section] element is in view and mirrors it on <html> so the backdrop tint can follow. */
function useSectionTracker() {
  useEffect(() => {
    const root = document.documentElement;
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-section]'));
    if (!nodes.length || !('IntersectionObserver' in window)) {
      root.removeAttribute('data-section');
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const name = visible?.target.getAttribute('data-section');
        if (name) root.setAttribute('data-section', name);
      },
      { rootMargin: '-40% 0px -40% 0px', threshold: [0, 0.25, 0.5] },
    );
    nodes.forEach((n) => io.observe(n));
    return () => {
      io.disconnect();
      root.removeAttribute('data-section');
    };
  }, []);
}

/** Drifting particle network drawn behind every page. */
function ParticleCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const colors = ['6,182,212', '139,92,246', '244,63,94', '148,163,184'];
    let w = 0;
    let h = 0;
    let raf = 0;
    type P = { x: number; y: number; vx: number; vy: number; r: number; c: string };
    let pts: P[] = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(70, (w * h) / 22000));
      pts = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        r: Math.random() * 1.8 + 0.6,
        c: colors[Math.floor(Math.random() * colors.length)]!,
      }));
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]!;
        if (!reduce) {
          a.x += a.vx;
          a.y += a.vy;
          if (a.x < 0 || a.x > w) a.vx *= -1;
          if (a.y < 0 || a.y > h) a.vy *= -1;
        }
        for (let j = i + 1; j < pts.length; j++) {
          const b = pts[j]!;
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < 140) {
            ctx.strokeStyle = `rgba(${a.c},${0.12 * (1 - d / 140)})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
        ctx.fillStyle = `rgba(${a.c},0.55)`;
        ctx.beginPath();
        ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (!reduce) raf = requestAnimationFrame(draw);
    };

    resize();
    draw();
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={ref} className="immersive-bg__canvas" aria-hidden />;
}

export function ImmersiveBackground() {
  useSectionTracker();
  return (
    <div className="immersive-bg" aria-hidden>
      <div className="immersive-bg__glow" />
      <div className="immersive-bg__grid" />
      <ParticleCanvas />
      <div className="immersive-bg__scrim" />
    </div>
  );
}

export function TypingText({ phrases, className }: { phrases: string[]; className?: string }) {
  const [index, setIndex] = useState(0);
  const [text, setText] = useState(phrases[0] ?? '');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const full = phrases[index % phrases.length] ?? '';
    let delay = deleting ? 40 : 85;
    if (!deleting && text === full) delay = 1800;
    if (deleting && text === '') delay = 300;

    const t = setTimeout(() => {
      if (!deleting && text === full) setDeleting(true);
      else if (deleting && text === '') {
        setDeleting(false);
        setIndex((i) => (i + 1) % phrases.length);
      } else setText(deleting ? full.slice(0, text.length - 1) : full.slice(0, text.length + 1));
    }, delay);
    return () => clearTimeout(t);
  }, [text, deleting, index, phrases]);

  return (
    <span className={className}>
      <span className="text-cyan-400">&gt;_ </span>
      <span className="text-text-primary">{text}</span>
      <span className="ml-0.5 inline-block h-6 w-0.5 animate-pulse bg-cyan-400 align-middle" aria-hidden />
    </span>
  );
}

export function DemoFab() {
  return (
    <Link
      href="/demo/"
      aria-label="Book a live demo"
      className="fab-enter group fixed bottom-6 right-6 z-50 flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-violet-600 text-white no-underline shadow-xl shadow-cyan-500/30 transition-[opacity,transform,box-shadow] duration-300 hover:scale-105 hover:shadow-cyan-500/50 active:scale-95 lg:size-16"
    >
      <span className="absolute inset-0 animate-ping rounded-full bg-cyan-400/20 [animation-duration:2.6s]" aria-hidden />
      <MessageCircle className="relative size-6" aria-hidden />
      <span className="absolute -top-10 right-0 hidden whitespace-nowrap rounded-lg border border-border bg-bg-secondary px-3 py-1.5 text-xs text-text-primary opacity-0 shadow-lg transition-opacity group-hover:opacity-100 lg:block">
        Talk to our team
      </span>
    </Link>
  );
}

import { cn } from './cn';

/** The Trackrex SVG Mark with Google's 4-color palette and GPS precision beacon. */
export function TrackrexMarkSvg({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0 select-none transition-transform duration-300 hover:scale-105', className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="tr-blue" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4285F4" />
          <stop offset="100%" stopColor="#1A73E8" />
        </linearGradient>
        <linearGradient id="tr-red" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#EA4335" />
          <stop offset="100%" stopColor="#D93025" />
        </linearGradient>
        <linearGradient id="tr-yellow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FBBC05" />
          <stop offset="100%" stopColor="#F9AB00" />
        </linearGradient>
        <linearGradient id="tr-green" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#34A853" />
          <stop offset="100%" stopColor="#1E8E3E" />
        </linearGradient>
      </defs>
      {/* Top arc - Google Blue */}
      <path
        d="M24 5C33.2 5 41 11.5 42.7 20.2L36 21.6C34.8 15.7 29.8 11.5 24 11.5C18.6 11.5 13.9 15.1 12.4 20.2L5.8 18.4C7.9 10.6 15.3 5 24 5Z"
        fill="url(#tr-blue)"
      />
      {/* Right arc - Google Red */}
      <path
        d="M43 24C43 32.3 37.5 39.3 29.8 41.8L27.8 35.2C32.8 33.5 36.5 29.2 36.5 24C36.5 21.4 35.7 19 34.2 17L40 12.8C41.9 16 43 19.8 43 24Z"
        fill="url(#tr-red)"
      />
      {/* Bottom arc - Google Yellow */}
      <path
        d="M24 43C16 43 9 38.2 6.2 31.2L12.5 28.8C14.3 33.2 18.8 36.5 24 36.5C25.8 36.5 27.6 36.1 29.2 35.2L32.4 41.4C29.9 42.4 27 43 24 43Z"
        fill="url(#tr-yellow)"
      />
      {/* Left arc - Google Green */}
      <path
        d="M5 24C5 18 8.1 12.7 12.8 9.8L16.2 15.8C13.5 17.6 11.5 20.6 11.5 24C11.5 26.2 12.3 28.2 13.6 29.8L7.8 33.8C6 31 5 27.6 5 24Z"
        fill="url(#tr-green)"
      />
      {/* Center GPS / Telemetry Pulse */}
      <circle cx="24" cy="24" r="5" fill="#4285F4" />
      <circle cx="24" cy="24" r="2.2" fill="#FFFFFF" />
    </svg>
  );
}

/** The Trackrex mark. Renders the crisp vector mark with Google 4-color branding. */
export function BrandMark({ className }: { className?: string }) {
  return <TrackrexMarkSvg className={className} />;
}

const NAME = 'Trackrex';
export const BRAND_TAGLINE = 'Track It Easy';

/**
 * The Trackrex name in its brand lettering (needs @trackrex/tokens/wordmark.css), optionally with the tagline under
 * it. Scales with font size, so size it with text-* classes. The four-colour lettering needs a light background.
 */
export function Wordmark({ className, tagline, taglineClassName }: { className?: string; tagline?: boolean; taglineClassName?: string }) {
  const name = (
    <span className={cn('wordmark inline-block', !tagline && className)}>
      {[...NAME].map((ch, i) => <span key={i} aria-hidden>{ch}</span>)}
      <span className="sr-only">{NAME}</span>
    </span>
  );
  if (!tagline) return name;
  return (
    <span className={cn('wordmark-lockup', className)}>
      {name}
      <span className={cn('wordmark-tagline', taglineClassName)}>{BRAND_TAGLINE}</span>
    </span>
  );
}

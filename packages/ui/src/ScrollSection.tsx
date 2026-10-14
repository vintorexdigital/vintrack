'use client';

import React, { type ReactNode } from 'react';
import { cn } from './cn';
import { useScrollReveal } from './useScrollReveal';

export interface ScrollSectionProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  variant?: 'fade-up' | 'scale' | 'fade-in' | 'slide-right' | 'slide-left';
  threshold?: number;
}

/**
 * ScrollSection wraps its children and reveals them with an Apple-style smooth scroll animation
 * when scrolled into view.
 */
export function ScrollSection({
  children,
  className,
  delay = 0,
  variant = 'fade-up',
  threshold = 0.1,
}: ScrollSectionProps) {
  const { ref, isVisible } = useScrollReveal({ threshold });

  const getVariantStyles = () => {
    switch (variant) {
      case 'scale':
        return isVisible
          ? 'opacity-100 scale-100 translate-y-0'
          : 'opacity-0 scale-[0.96] translate-y-6';
      case 'fade-in':
        return isVisible ? 'opacity-100' : 'opacity-0';
      case 'slide-right':
        return isVisible
          ? 'opacity-100 translate-x-0'
          : 'opacity-0 -translate-x-12';
      case 'slide-left':
        return isVisible
          ? 'opacity-100 translate-x-0'
          : 'opacity-0 translate-x-12';
      case 'fade-up':
      default:
        return isVisible
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-8';
    }
  };

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        'transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform',
        getVariantStyles(),
        className
      )}
    >
      {children}
    </div>
  );
}

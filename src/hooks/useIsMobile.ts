import { useState, useEffect } from 'react';

export const MOBILE_BREAKPOINT = 768; // Tailwind's md breakpoint

export function isMobileWidth(width: number): boolean {
  return width < MOBILE_BREAKPOINT;
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => isMobileWidth(window.innerWidth));

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return isMobile;
}

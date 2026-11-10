import { useEffect, useState } from 'react';
import { clockIn } from './time';

/** Today's date and the current minute in the user's time zone, ticking every 15 s. */
export function useClock(timeZone: string): { date: string; minute: number } {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 15_000);
    // Back from the background (phone locked, other tab): catch up at once.
    const onVisible = () => document.visibilityState === 'visible' && setNow(new Date());
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return clockIn(timeZone, now);
}

"use client";

import { useEffect, useState } from "react";

/** Anchor each server sample to a monotonic clock; never accumulate timer ticks. */
export function useServerClock(serverNow: string) {
  const [sample, setSample] = useState({ serverNow, elapsed: 0 });
  useEffect(() => {
    const receivedAt = performance.now();
    const timer = window.setInterval(() => {
      setSample({ serverNow, elapsed: performance.now() - receivedAt });
    }, 100);
    return () => window.clearInterval(timer);
  }, [serverNow]);
  return Date.parse(serverNow) + (sample.serverNow === serverNow ? sample.elapsed : 0);
}

"use client";

import { useEffect, useRef } from "react";

/** Keep the current section visible in the mobile navigation strip. */
export function useMobileNavigation(pathname: string) {
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1100px)");
    const reveal = () => {
      const container = nav.current;
      const active = container?.querySelector<HTMLElement>('a[aria-current="page"]');
      if (!media.matches || !container || !active) return;
      const viewport = container.getBoundingClientRect(), item = active.getBoundingClientRect();
      if (item.left < viewport.left || item.right > viewport.right) {
        container.scrollLeft += item.left - viewport.left - 12;
      }
    };
    const frame = requestAnimationFrame(reveal);
    media.addEventListener("change", reveal);
    return () => { cancelAnimationFrame(frame); media.removeEventListener("change", reveal); };
  }, [pathname]);
  return nav;
}

import { useEffect, useState } from "react";

import { formatTodayLabel, STATIC_TODAY_LABEL } from "./formatTodayLabel";

/**
 * Static Astro builds must not freeze a calendar date into the masthead. Render
 * the truthful generic label for SSR/hydration, then fill the exact Pacific
 * date on mount and keep it current across midnight.
 */
export function useLiveTodayLabel(): string {
  const [label, setLabel] = useState(STATIC_TODAY_LABEL);

  useEffect(() => {
    const refresh = () => {
      const next = formatTodayLabel();
      setLabel((previous) => previous === next ? previous : next);
    };
    refresh();
    const id = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(id);
  }, []);

  return label;
}

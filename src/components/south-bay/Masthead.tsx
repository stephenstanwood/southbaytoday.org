// ---------------------------------------------------------------------------
// Masthead — the one site header + tab nav, used by every page type:
// the SignalApp tabs (hydrated), CityPage (hydrated), and the static
// CalendarShell pages (server-rendered only). Styles live in
// src/styles/sbt/chrome.css.
//
// Tabs are real links so crawlers, cmd-click, and no-JS readers all work.
// SignalApp passes `onNavigate` to switch tabs in place instead of loading
// a new page.
//
// The date: SSR/static HTML carries the neutral "Today" label (a static
// build must never freeze a calendar date — see useLiveTodayLabel). Hydrated
// pages fill the Pacific date from the hook; static pages get it from the
// tiny inline script in BaseLayout that fills every [data-sbt-today].
// ---------------------------------------------------------------------------

import type { MouseEvent } from "react";
import type { Tab } from "../../lib/south-bay/types";
import { TABS } from "../../lib/south-bay/types";
import { useLiveTodayLabel } from "../../lib/south-bay/useLiveTodayLabel";

export const TAB_HREF: Partial<Record<Tab, string>> = {
  overview: "/",
  events: "/events",
  camps: "/camps",
  government: "/gov",
  technology: "/tech",
  food: "/food",
};

export interface MastheadProps {
  /** Tab to highlight. Sub-routes (city pages, event pages) pass the closest
   *  parent tab or null. */
  activeTab?: Tab | null;
  /** In-app tab switching (SignalApp). Plain modified clicks still open the
   *  link normally. */
  onNavigate?: (tab: Tab) => void;
}

export default function Masthead({ activeTab = null, onNavigate }: MastheadProps) {
  const todayLabel = useLiveTodayLabel();

  const handleClick = (tab: Tab) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (!onNavigate) return;
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onNavigate(tab);
  };

  return (
    <>
      <header className="sb-header">
        <div className="sb-header-inner">
          <a href="/" className="sb-brand" aria-label="The South Bay Today — home">
            <img
              src="/images/sbt-avatar-172.png"
              alt=""
              width={76}
              height={76}
              className="sb-brand-mark"
              aria-hidden="true"
              decoding="async"
            />
            <span className="sb-logo" aria-hidden="true">
              <span className="sb-logo-main-row">
                <span className="sb-logo-the">the</span>
                <span className="sb-logo-south-bay">South Bay</span>
              </span>
              <span className="sb-logo-signal-row">
                <span className="sb-logo-signal-rule" />
                <span className="sb-logo-signal-word">Today</span>
                <span className="sb-logo-signal-rule" />
              </span>
            </span>
          </a>
          <p className="sb-dateline">
            <span className="sb-date" data-sbt-today="" suppressHydrationWarning>{todayLabel}</span>
            <span className="sb-dateline-sep" aria-hidden="true">·</span>
            <span className="sb-slogan">All local. Good vibes. No ads.</span>
          </p>
        </div>
      </header>

      <nav className="sb-nav" aria-label="Sections">
        <div className="sb-nav-inner">
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <a
                key={tab.id}
                href={TAB_HREF[tab.id] ?? "/"}
                className={`sb-tab${active ? " sb-tab--active" : ""}`}
                aria-current={active ? "page" : undefined}
                onClick={handleClick(tab.id)}
              >
                {tab.label}
              </a>
            );
          })}
        </div>
      </nav>
    </>
  );
}

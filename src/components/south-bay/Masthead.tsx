// ---------------------------------------------------------------------------
// Masthead — site branding header for pages outside the SignalApp shell.
// ---------------------------------------------------------------------------
// SignalApp renders its own inline masthead because it owns tab state. For
// pages mounted directly under BaseLayout (notably /city/[slug]), this is the
// reusable equivalent: same JSX shape, same CSS class names, but the nav tabs
// are plain anchor links instead of SignalApp state-toggles. Self-contained
// <style> block so it works in any layout without depending on global CSS.
// ---------------------------------------------------------------------------

import { useState, useEffect } from "react";
import { formatTodayLabel } from "../../lib/south-bay/formatTodayLabel";

type TabId = "overview" | "events" | "camps" | "government" | "technology" | "food";

const TABS: Array<{ id: TabId; label: string; href: string }> = [
  { id: "overview",   label: "Today",  href: "/" },
  { id: "events",     label: "Events", href: "/events" },
  { id: "camps",      label: "Camps",  href: "/camps" },
  { id: "government", label: "Gov",    href: "/gov" },
  { id: "technology", label: "Tech",   href: "/tech" },
  { id: "food",       label: "Food",   href: "/food" },
];

export interface MastheadProps {
  /** Optional tab id to highlight (only useful when the page corresponds to a
   *  tab). City pages pass null since they're sub-routes, not tabs. */
  activeTab?: TabId | null;
}

export default function Masthead({ activeTab = null }: MastheadProps) {
  // Same pattern as SignalApp's masthead: the server HTML carries the build
  // night's date, so refresh it on mount (suppressHydrationWarning covers the
  // text swap) and keep it current across midnight for long-lived tabs.
  const [todayLabel, setTodayLabel] = useState<string>(() => formatTodayLabel());
  useEffect(() => {
    setTodayLabel(formatTodayLabel());
    const id = setInterval(() => {
      const next = formatTodayLabel();
      setTodayLabel((prev) => (prev === next ? prev : next));
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <header className="sb-header">
        <div className="sb-header-inner">
          <a href="/" className="sb-brand">
            <img
              src="/images/sbt-newsletter-avatar.png"
              alt=""
              width={86}
              height={86}
              className="sb-brand-mark"
              aria-hidden="true"
            />
            <span className="sb-logo">
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
          <div className="sb-date">
            <div suppressHydrationWarning>{todayLabel}</div>
          </div>
          <div className="sb-slogan">All local. Good vibes. No ads.</div>
        </div>
      </header>

      <nav className="sb-nav">
        <div className="sb-nav-inner">
          {TABS.map((tab) => (
            <a
              key={tab.id}
              href={tab.href}
              className={`sb-tab${activeTab === tab.id ? " sb-tab--active" : ""}`}
              aria-current={activeTab === tab.id ? "page" : undefined}
            >
              {tab.label}
            </a>
          ))}
        </div>
      </nav>

      <style>{`
        :root {
          --sb-max-width: 960px;
        }
        .sb-header {
          background:
            radial-gradient(circle at 50% -18%, rgba(255, 123, 43, 0.24), transparent 34%),
            linear-gradient(180deg, #fffaf5 0%, var(--sb-bg) 100%);
          padding: 26px 24px 14px;
          text-align: center;
          border-bottom: none;
        }
        .sb-header-inner {
          max-width: var(--sb-max-width);
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          position: relative;
        }
        .sb-brand {
          text-decoration: none;
          color: var(--sb-ink);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 9px;
        }
        .sb-brand-mark {
          width: 86px;
          height: 86px;
          border-radius: 999px;
          display: block;
          background: #fff;
          border: 4px solid #fff;
          box-shadow: 0 14px 34px rgba(31, 12, 73, 0.16), 0 0 0 1px rgba(123, 47, 190, 0.12);
        }
        .sb-logo { display: inline-block; user-select: none; }
        .sb-logo-main-row { display: flex; align-items: baseline; gap: 6px; }
        .sb-logo-the { font-family: var(--sb-serif); font-weight: 400; font-style: italic; font-size: 18px; color: var(--sb-ink); }
        .sb-logo-south-bay { font-family: var(--sb-serif); font-weight: 900; font-size: 40px; line-height: 1; color: var(--sb-ink); letter-spacing: -0.01em; }
        .sb-logo-signal-row { display: flex; align-items: center; gap: 8px; margin-top: 2px; }
        .sb-logo-signal-rule { flex: 1; height: 2px; background: linear-gradient(90deg, #ff7b2b, #f43f7c, #8738f5, #22c6d3); opacity: 0.8; }
        .sb-logo-signal-word { font-family: 'Space Mono', monospace; font-size: 10px; letter-spacing: 0.4em; text-transform: uppercase; color: #8738f5; }
        .sb-date {
          font-size: 12px;
          color: var(--sb-muted);
          font-weight: 400;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          margin-top: 4px;
        }
        .sb-slogan {
          font-family: var(--sb-sans);
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--sb-light);
          margin-top: 6px;
        }
        .sb-nav {
          background: rgba(255, 250, 245, 0.92);
          backdrop-filter: blur(14px);
          border-top: 1px solid rgba(123, 47, 190, 0.18);
          border-bottom: 1px solid rgba(34, 198, 211, 0.18);
          padding: 0 24px;
          position: sticky;
          top: 0;
          z-index: 99;
        }
        .sb-nav-inner {
          max-width: var(--sb-max-width);
          margin: 0 auto;
          display: flex;
          justify-content: flex-start;
          gap: 0;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }
        @media (min-width: 860px) {
          .sb-nav-inner { justify-content: center; }
        }
        .sb-nav-inner::-webkit-scrollbar { display: none; }
        .sb-tab {
          padding: 10px 14px;
          font-family: var(--sb-sans);
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--sb-muted);
          border: none;
          background: none;
          cursor: pointer;
          white-space: nowrap;
          border-bottom: 2px solid transparent;
          transition: color 0.15s, border-color 0.15s;
          text-decoration: none;
          display: inline-block;
        }
        .sb-tab:hover { color: var(--sb-ink); }
        .sb-tab--active {
          color: #12062f;
          border-bottom-color: #8738f5;
        }
        @media (max-width: 640px) {
          .sb-header { padding: 20px 16px 12px; }
          .sb-brand-mark { width: 72px; height: 72px; }
          .sb-nav { padding: 0 16px; }
          .sb-tab { padding: 10px 16px; font-size: 11px; }
        }
      `}</style>
    </>
  );
}

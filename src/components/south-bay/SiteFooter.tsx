// ---------------------------------------------------------------------------
// SiteFooter — the one footer for every page type. The newsletter signup is
// passed in as `children` so each host controls hydration: SignalApp and
// CityPage render it inside their own island, and CalendarShell (static)
// mounts it as its own small `client:visible` island.
// Styles: src/styles/sbt/chrome.css (.sb-footer*).
// ---------------------------------------------------------------------------

import type { ReactNode } from "react";
import { TABS } from "../../lib/south-bay/types";
import { TAB_HREF } from "./Masthead";

export default function SiteFooter({ children }: { children?: ReactNode }) {
  return (
    <footer className="sb-footer">
      {children && <div className="sb-footer-signup">{children}</div>}
      <ul className="sb-footer-nav" aria-label="Sections">
        {TABS.map((tab) => (
          <li key={tab.id}>
            <a href={TAB_HREF[tab.id] ?? "/"}>{tab.label}</a>
          </li>
        ))}
      </ul>
      <p className="sb-footer-meta">
        <span>
          a project of{" "}
          <a href="https://stanwood.dev" target="_blank" rel="noopener noreferrer" className="sb-footer-maker">
            stanwood.dev
          </a>
        </span>
        <span className="sb-footer-dot" aria-hidden="true">·</span>
        <a href="/about">about</a>
        <span className="sb-footer-dot" aria-hidden="true">·</span>
        <a href="/newsletters">newsletter archive</a>
        <span className="sb-footer-dot" aria-hidden="true">·</span>
        <a href="/rss.xml">RSS</a>
        <span className="sb-footer-dot" aria-hidden="true">·</span>
        <a href="/privacy">privacy</a>
      </p>
      <p className="sb-footer-copy">© Stoa Works LLC</p>
    </footer>
  );
}

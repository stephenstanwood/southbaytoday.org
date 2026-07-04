import { useState, useCallback, useRef, useEffect, lazy, Suspense } from "react";
import type { Tab, City } from "../../lib/south-bay/types";
import { TABS } from "../../lib/south-bay/types";
import { CITIES } from "../../lib/south-bay/cities";
import SouthBayTodayView from "./homepage/SouthBayTodayView";
import NewsletterSignup from "./NewsletterSignup";

// Non-default tabs are lazy-loaded so a user who only looks at the Today tab
// doesn't pay for Events/Tech/etc. code + their deps (recharts, etc.)
// upfront. Each becomes its own chunk the browser fetches on tab activation.
const GovernmentView = lazy(() => import("./views/GovernmentView"));
const EventsView = lazy(() => import("./views/EventsView"));
const TechnologyView = lazy(() => import("./views/TechnologyView"));
const FoodView = lazy(() => import("./views/FoodView"));
const CampsView = lazy(() => import("./views/CampsView"));

function formatTodayLabel(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Los_Angeles",
  });
}

const TAB_IDS = new Set<string>(TABS.map((t) => t.id));

// Short-slug URLs (e.g. /gov, /tech) so the address bar reads cleanly instead
// of the older /#government-style hash routing. Hash routing is preserved as a
// fallback so existing bookmarks keep working.
const TAB_TO_SLUG: Partial<Record<Tab, string>> = {
  overview:   "/",
  events:     "/events",
  camps:      "/camps",
  government: "/gov",
  technology: "/tech",
  food:       "/food",
};
const SLUG_TO_TAB: Record<string, Tab> = Object.fromEntries(
  Object.entries(TAB_TO_SLUG).map(([tab, slug]) => [slug, tab as Tab]),
);

function tabFromLocation(): Tab {
  if (typeof window === "undefined") return "overview";
  // Hash first: a tab-valid hash only exists on legacy /#events-style
  // bookmarks (navigateTo always pushes clean slug paths), and checking the
  // path first would swallow it — "/" maps to overview, so the fallback
  // never fired for exactly the bookmarks it was built for.
  const hash = window.location.hash.slice(1);
  if (TAB_IDS.has(hash)) return hash as Tab;
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  return SLUG_TO_TAB[path] ?? "overview";
}

interface SignalAppProps {
  initialTab?: Tab;
}

export default function SignalApp({ initialTab }: SignalAppProps = {}) {
  // Deterministic first render: the page's own tab, never the URL hash. A
  // legacy #events-style bookmark would make the hydrating client disagree
  // with the server HTML; the mount effect below resolves the hash instead.
  const [activeTab, setActiveTab] = useState<Tab>(() => initialTab ?? "overview");
  // Auto-refresh the masthead date on day rollover so a tab left open past
  // midnight doesn't show yesterday's label.
  const [todayLabel, setTodayLabel] = useState<string>(() => formatTodayLabel());
  useEffect(() => {
    // Refresh immediately on mount (server HTML may carry the build night's
    // date) and then keep it current across midnight for long-lived tabs.
    setTodayLabel(formatTodayLabel());
    const id = setInterval(() => {
      const next = formatTodayLabel();
      setTodayLabel((prev) => (prev === next ? prev : next));
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const navigateTo = useCallback((tab: Tab) => {
    setActiveTab(tab);
    const slug = TAB_TO_SLUG[tab] ?? "/";
    if (window.location.pathname !== slug || window.location.hash) {
      window.history.pushState({ tab }, "", slug);
    }
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const sync = () => { setActiveTab(tabFromLocation()); window.scrollTo(0, 0); };
    // Resolve legacy hash bookmarks (e.g. /#events) once after hydration.
    // No scroll reset here — on a plain load the tabs already agree and we
    // must not fight the browser's scroll restoration.
    const located = tabFromLocation();
    setActiveTab((cur) => (cur === located ? cur : located));
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
    };
  }, []);

  // Default = all cities selected. Honors a `?city=<id>` deep-link param so a
  // city-page link (e.g. the holiday banner on /city/cupertino) can drop the
  // resident on /events?city=cupertino with just that city pre-filtered.
  const [selectedCities, setSelectedCities] = useState<Set<City>>(() => {
    const allCities = new Set(CITIES.map((c) => c.id));
    if (typeof window === "undefined") return allCities;
    const param = new URLSearchParams(window.location.search).get("city");
    if (param && CITIES.some((c) => c.id === param)) {
      return new Set([param as City]);
    }
    return allCities;
  });
  // Purge any lingering home-city preference from a previous build. The
  // product is now "explore the whole area" — no anchor city. Keep this
  // as a one-time cleanup so users aren't staring at a stale label.
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("sb-home-city");
    }
  }, []);

  const toggleCity = useCallback((city: City) => {
    setSelectedCities((prev) => {
      const next = new Set(prev);
      if (next.has(city)) {
        next.delete(city);
      } else {
        next.add(city);
      }
      return next;
    });
  }, []);

  const navInnerRef = useRef<HTMLDivElement>(null);
  const [showNavArrow, setShowNavArrow] = useState(false);

  useEffect(() => {
    const el = navInnerRef.current;
    if (!el) return;
    const check = () => setShowNavArrow(el.scrollWidth > el.clientWidth + 4 && el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
    check();
    el.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check, { passive: true });
    return () => { el.removeEventListener("scroll", check); window.removeEventListener("resize", check); };
  }, []);

  const scrollNavRight = () => {
    navInnerRef.current?.scrollBy({ left: 120, behavior: "smooth" });
  };

  const toggleAll = useCallback(() => {
    setSelectedCities((prev) => {
      if (prev.size === CITIES.length) return new Set();
      return new Set(CITIES.map((c) => c.id));
    });
  }, []);

  // City filter is rendered inline inside EventsView's filter bar, not at app level.

  return (
    <>
      {/* Masthead */}
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

      <hr className="sb-masthead-rule" />

      {/* Navigation */}
      <nav className="sb-nav" style={{ position: "relative" }}>
        <div className="sb-nav-inner" ref={navInnerRef}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`sb-tab${activeTab === tab.id ? " sb-tab--active" : ""}`}
              onClick={() => navigateTo(tab.id)}
              aria-current={activeTab === tab.id ? "page" : undefined}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {showNavArrow && (
          <button
            onClick={scrollNavRight}
            aria-label="Scroll tabs right"
            className="sb-nav-scroll-arrow"
          >
            ›
          </button>
        )}
      </nav>

      {/* Content */}
      <main className="sb-main">
        {activeTab === "overview" && (
          <SouthBayTodayView onNavigate={navigateTo} />
        )}
        {activeTab !== "overview" && (
          <Suspense fallback={<div className="sb-loading"><div className="sb-spinner" /><div className="sb-loading-text">Loading…</div></div>}>
            {activeTab === "events" && (
              <EventsView
                selectedCities={selectedCities}
                onToggleCity={toggleCity}
                onToggleAllCities={toggleAll}
              />
            )}
            {activeTab === "government" && (
              <GovernmentView selectedCities={selectedCities} />
            )}
            {activeTab === "technology" && <TechnologyView />}
            {activeTab === "food" && <FoodView />}
            {activeTab === "camps" && <CampsView />}
          </Suspense>
        )}
      </main>

      {/* Footer — minimal newsletter signup baked in above the credit line. */}
      <footer className="sb-footer">
        <div style={{ marginBottom: 12 }}>
          <NewsletterSignup variant="minimal" />
        </div>
        a project of <a href="https://stanwood.dev" target="_blank" rel="noopener noreferrer" style={{ fontFamily: "'Permanent Marker', cursive", textDecoration: "none", color: "inherit" }}>stanwood.dev</a>
        <span aria-hidden="true" style={{ margin: "0 6px", opacity: 0.4 }}>·</span>
        <a href="/about" style={{ color: "inherit", textDecoration: "none", opacity: 0.7 }}>about</a>
        <span aria-hidden="true" style={{ margin: "0 6px", opacity: 0.4 }}>·</span>
        <a href="/privacy" style={{ color: "inherit", textDecoration: "none", opacity: 0.7 }}>privacy</a>
      </footer>
    </>
  );
}

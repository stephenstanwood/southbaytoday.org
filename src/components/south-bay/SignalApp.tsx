import { useState, useCallback, useEffect, lazy, Suspense } from "react";
import type { Tab, City } from "../../lib/south-bay/types";
import { TABS } from "../../lib/south-bay/types";
import { CITIES } from "../../lib/south-bay/cities";
import SouthBayTodayView from "./homepage/SouthBayTodayView";
import NewsletterSignup from "./NewsletterSignup";
import Masthead, { TAB_HREF } from "./Masthead";
import SiteFooter from "./SiteFooter";
import type EventsViewComponent from "./views/EventsView";
import type GovernmentViewComponent from "./views/GovernmentView";
import type TechnologyViewComponent from "./views/TechnologyView";
import type FoodViewComponent from "./views/FoodView";
import type CampsViewComponent from "./views/CampsView";

// Non-default tabs are lazy-loaded so a user who only looks at the Today tab
// doesn't pay for Events/Tech/etc. code + their deps (recharts, etc.)
// upfront. Each becomes its own chunk the browser fetches on tab activation.
const GovernmentView = lazy(() => import("./views/GovernmentView"));
const EventsView = lazy(() => import("./views/EventsView"));
const TechnologyView = lazy(() => import("./views/TechnologyView"));
const FoodView = lazy(() => import("./views/FoodView"));
const CampsView = lazy(() => import("./views/CampsView"));

const TAB_IDS = new Set<string>(TABS.map((t) => t.id));

// Short-slug URLs (e.g. /gov, /tech) so the address bar reads cleanly instead
// of the older /#government-style hash routing. Hash routing is preserved as a
// fallback so existing bookmarks keep working.
const TAB_TO_SLUG = TAB_HREF;
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

/**
 * Views a tab page bundles eagerly (see ./apps/). A lazy view can't hydrate
 * until its chunk arrives, and React was discarding the server-rendered tab
 * while it waited, so /events, /camps, etc. painted the Loading spinner
 * before popping back in. Each tab page's island passes its own view here;
 * the other tabs stay lazy for client-side switches.
 */
export interface EagerViews {
  events?: typeof EventsViewComponent;
  government?: typeof GovernmentViewComponent;
  technology?: typeof TechnologyViewComponent;
  food?: typeof FoodViewComponent;
  camps?: typeof CampsViewComponent;
}

interface SignalAppProps {
  initialTab?: Tab;
  eager?: EagerViews;
  /** Pacific date the page was built on, for views that render "today" into
   *  the static HTML (see useTodayPT). */
  buildDayPt?: string;
}

export default function SignalApp({ initialTab, eager, buildDayPt }: SignalAppProps = {}) {
  // Deterministic first render: the page's own tab, never the URL hash. A
  // legacy #events-style bookmark would make the hydrating client disagree
  // with the server HTML; the mount effect below resolves the hash instead.
  const [activeTab, setActiveTab] = useState<Tab>(() => initialTab ?? "overview");

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
  // city page's "all events" link can drop the resident on
  // /events?city=cupertino with just that city pre-filtered. The param is
  // applied after mount so the first render matches the build's HTML.
  const [selectedCities, setSelectedCities] = useState<Set<City>>(
    () => new Set(CITIES.map((c) => c.id)),
  );
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("city");
    if (param && CITIES.some((c) => c.id === param)) {
      setSelectedCities(new Set([param as City]));
    }
  }, []);
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

  const toggleAll = useCallback(() => {
    setSelectedCities((prev) => {
      if (prev.size === CITIES.length) return new Set();
      return new Set(CITIES.map((c) => c.id));
    });
  }, []);

  // City filter is rendered inline inside EventsView's filter bar, not at app level.

  const Events = eager?.events ?? EventsView;
  const Government = eager?.government ?? GovernmentView;
  const Technology = eager?.technology ?? TechnologyView;
  const Food = eager?.food ?? FoodView;
  const Camps = eager?.camps ?? CampsView;

  return (
    <>
      <Masthead activeTab={activeTab} onNavigate={navigateTo} />

      {/* Content */}
      <main className="sb-main" id="main-content">
        {activeTab === "overview" && (
          <SouthBayTodayView onNavigate={navigateTo} />
        )}
        {activeTab !== "overview" && (
          <Suspense fallback={<div className="sb-loading"><div className="sb-spinner" /><div className="sb-loading-text">Loading…</div></div>}>
            {activeTab === "events" && (
              <Events
                selectedCities={selectedCities}
                onToggleCity={toggleCity}
                onToggleAllCities={toggleAll}
                buildDayPt={buildDayPt}
              />
            )}
            {activeTab === "government" && (
              <Government selectedCities={selectedCities} />
            )}
            {activeTab === "technology" && <Technology />}
            {activeTab === "food" && <Food />}
            {activeTab === "camps" && <Camps />}
          </Suspense>
        )}
      </main>

      <SiteFooter>
        <NewsletterSignup variant="minimal" />
      </SiteFooter>
    </>
  );
}

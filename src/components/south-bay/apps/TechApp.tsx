import SignalApp from "../SignalApp";
import TechnologyView from "../views/TechnologyView";

// The /tech island: the app shell with this page's own view bundled eagerly,
// so hydration never waits on a lazy chunk. See EagerViews in SignalApp.
export default function TechApp({ buildDayPt }: { buildDayPt: string }) {
  return <SignalApp initialTab="technology" eager={{ technology: TechnologyView }} buildDayPt={buildDayPt} />;
}

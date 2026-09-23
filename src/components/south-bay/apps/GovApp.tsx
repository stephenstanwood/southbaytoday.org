import SignalApp from "../SignalApp";
import GovernmentView from "../views/GovernmentView";

// The /gov island: the app shell with this page's own view bundled eagerly,
// so hydration never waits on a lazy chunk. See EagerViews in SignalApp.
export default function GovApp({ buildDayPt }: { buildDayPt: string }) {
  return <SignalApp initialTab="government" eager={{ government: GovernmentView }} buildDayPt={buildDayPt} />;
}

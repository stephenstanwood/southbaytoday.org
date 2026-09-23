import SignalApp from "../SignalApp";
import CampsView from "../views/CampsView";

// The /camps island: the app shell with this page's own view bundled eagerly,
// so hydration never waits on a lazy chunk. See EagerViews in SignalApp.
export default function CampsApp({ buildDayPt }: { buildDayPt: string }) {
  return <SignalApp initialTab="camps" eager={{ camps: CampsView }} buildDayPt={buildDayPt} />;
}

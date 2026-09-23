import SignalApp from "../SignalApp";
import EventsView from "../views/EventsView";

// The /events island: the app shell with this page's own view bundled eagerly,
// so hydration never waits on a lazy chunk. See EagerViews in SignalApp.
export default function EventsApp({ buildDayPt }: { buildDayPt: string }) {
  return <SignalApp initialTab="events" eager={{ events: EventsView }} buildDayPt={buildDayPt} />;
}

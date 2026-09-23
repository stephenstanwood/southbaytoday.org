import SignalApp from "../SignalApp";
import FoodView from "../views/FoodView";

// The /food island: the app shell with this page's own view bundled eagerly,
// so hydration never waits on a lazy chunk. See EagerViews in SignalApp.
export default function FoodApp() {
  return <SignalApp initialTab="food" eager={{ food: FoodView }} />;
}

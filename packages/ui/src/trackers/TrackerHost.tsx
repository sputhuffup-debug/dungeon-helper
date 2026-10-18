import { ClockTracker } from "./ClockTracker";
import { CountdownTracker } from "./CountdownTracker";
import { GenericTracker } from "./GenericTracker";
import { InitiativeTracker } from "./InitiativeTracker";
import { LifecycleTracker } from "./LifecycleTracker";
import { getTracker, registerTracker } from "./registry";
import { StealthTracker } from "./StealthTracker";
import { StoryPointsTracker } from "./StoryPointsTracker";
import { StressTracker } from "./StressTracker";
import { SupplyTracker } from "./SupplyTracker";
import type { TrackerProps } from "./types";

export function registerDefaultTrackers(): void {
  registerTracker("clock", ClockTracker);
  registerTracker("countdown", CountdownTracker);
  registerTracker("initiative", InitiativeTracker);
  registerTracker("stress", StressTracker);
  registerTracker("story-points", StoryPointsTracker);
  registerTracker("supply", SupplyTracker);
  registerTracker("stealth", StealthTracker);
  registerTracker("lifecycle", LifecycleTracker);
}

registerDefaultTrackers();

/** Picks the tracker component by `def.kind`, falling back to the generic JSON editor. */
export function TrackerHost(props: TrackerProps) {
  const Component = getTracker(props.def.kind) ?? GenericTracker;
  return <Component {...props} />;
}

/** A thread clock as a row of segments: filled, about to fill (`next`), empty, with milestone marks. */
export function ClockBar({ segments, filled, next, milestones = [], label }: { segments: number; filled: number; next?: number; milestones?: number[]; label?: string }) {
  const marks = new Set(milestones);
  return (
    <span className="arc-clock" role="img" aria-label={label ?? `Clock ${filled} of ${segments}`} data-filled={filled} data-segments={segments}>
      {Array.from({ length: segments }, (_, i) => {
        const n = i + 1;
        const state = n <= filled ? "filled" : next !== undefined && n <= next ? "next" : "empty";
        return <span key={i} className={`arc-clock__seg arc-clock__seg--${state}${marks.has(n) ? " arc-clock__seg--milestone" : ""}`} />;
      })}
    </span>
  );
}

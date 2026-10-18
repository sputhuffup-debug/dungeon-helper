import type { CSSProperties } from "react";
import type { DieSpec } from "@campaign-forge/module-sdk";
import { cx } from "../sheet/paths";

export interface DieFaceProps {
  spec?: DieSpec;
  value: number;
  /** Kept from a previous roll (not re-rolled on push). */
  kept?: boolean;
  /** The base die of the system gets the plain style; others are "special". */
  special?: boolean;
  size?: "sm" | "md";
  className?: string;
}

/** One rolled die: value, colour from the DieSpec, and a symbol badge when the face carries one. */
export function DieFace({ spec, value, kept, special, className }: DieFaceProps) {
  const symbol = spec?.symbols?.[value];
  const style = spec?.color ? ({ "--cf-die-color": spec.color } as CSSProperties) : undefined;
  return (
    <span
      className={cx("cf-die", special && "cf-die--special", kept && "cf-die--kept", symbol && "cf-die--symbol", className)}
      style={style}
      data-die={spec?.id}
      data-value={value}
      data-symbol={symbol}
      role="img"
      aria-label={`${spec?.name ?? "die"} ${value}${symbol ? ` (${symbol})` : ""}${kept ? ", kept" : ""}`}
    >
      <span className="cf-die__value">{value}</span>
      {symbol && <span className={cx("cf-die__symbol", `cf-die__symbol--${symbol}`)}>{symbol}</span>}
    </span>
  );
}

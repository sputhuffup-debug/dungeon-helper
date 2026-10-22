/** The print paper choice (Letter or A4), shared by the booklet, agenda cards and the player packet; remembered on this device. */
import { useState } from "react";

export type Paper = "letter" | "a4";

const PAPER_KEY = "cf.print.paper";

export const PAPER_LABELS: Record<Paper, string> = { letter: "Letter", a4: "A4" };

/** The saved choice, else the locale's usual paper. */
export function defaultPaper(): Paper {
  try {
    const saved = localStorage.getItem(PAPER_KEY);
    if (saved === "letter" || saved === "a4") return saved;
  } catch {
    // storage blocked: fall through to the locale
  }
  const lang = typeof navigator !== "undefined" ? navigator.language : "en-US";
  return /^en-(US|CA)$|^es-(MX|US)$|-(PH|CL|CO)$/i.test(lang) ? "letter" : "a4";
}

export function usePaper(): [Paper, (p: Paper) => void] {
  const [paper, setPaper] = useState<Paper>(defaultPaper);
  const set = (p: Paper) => {
    setPaper(p);
    try {
      localStorage.setItem(PAPER_KEY, p);
    } catch {
      // not saved; the choice still applies to this view
    }
  };
  return [paper, set];
}

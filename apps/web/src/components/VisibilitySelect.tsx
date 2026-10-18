import type { Visibility } from "@campaign-forge/core";
import type { VisibilityLevel } from "@campaign-forge/module-sdk";

const LEVELS: Array<{ id: VisibilityLevel; label: string; hint: string }> = [
  { id: "gm", label: "GM only", hint: "Only the GM sees this." },
  { id: "players", label: "Players", hint: "Every player may see this." },
  { id: "revealed", label: "Revealed", hint: "Revealed to players during play." },
  { id: "some_players", label: "Some players", hint: "Only chosen players (needs player members)." },
];

export function VisibilitySelect({ value, onChange, id, hasPlayers = false }: { value: Visibility; onChange: (v: Visibility) => void; id?: string; hasPlayers?: boolean }) {
  return (
    <select
      id={id}
      className="cf-select"
      aria-label="Visibility"
      value={value.level}
      onChange={(e) => {
        const level = e.target.value as VisibilityLevel;
        const next: Visibility = { level };
        if (level === "some_players") next.players = value.players ?? [];
        if (level === "revealed" && value.revealedIn) next.revealedIn = value.revealedIn;
        onChange(next);
      }}
    >
      {LEVELS.map((l) => (
        <option key={l.id} value={l.id} title={l.hint} disabled={l.id === "some_players" && !hasPlayers && value.level !== "some_players"}>
          {l.label}
        </option>
      ))}
    </select>
  );
}

export function visibilityLabel(v: Visibility | undefined): string {
  return LEVELS.find((l) => l.id === v?.level)?.label ?? "GM only";
}

export function visibilityTone(v: Visibility | undefined): "muted" | "accent" | "success" | "warning" {
  switch (v?.level) {
    case "players":
      return "success";
    case "revealed":
      return "accent";
    case "some_players":
      return "warning";
    default:
      return "muted";
  }
}

/**
 * The GM screen read on screen: the panels the GM picked for printing, in
 * their order, as cards (GM side first, then the player side), each block
 * with its citation. For a tablet or a second monitor at the table; the
 * same content as the printed screen, nothing more.
 */
import type { GmScreenContent, ResolvedGmScreenPanel } from "@campaign-forge/module-sdk";
import { Fragment, type ReactNode } from "react";
import { Card } from "../../components/ui";
import type { PanelChoice } from "./gmScreenModel";

/** Text with `**bold**` spans (all the markup the screen's content keeps). */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) => (p.startsWith("**") && p.endsWith("**") && p.length > 4 ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>))}
    </>
  );
}

function Content({ c }: { c: GmScreenContent }): ReactNode {
  switch (c.t) {
    case "heading":
      return <h5 className="app-screen__heading">{c.text}</h5>;
    case "para":
      return (
        <p className="app-screen__para">
          {c.marker ? <span className="app-screen__marker">{c.marker} </span> : null}
          <Inline text={c.text} />
        </p>
      );
    case "entry":
      return (
        <p className="app-screen__para">
          <strong>{c.term}</strong> <Inline text={c.text} />
        </p>
      );
    case "table":
      return (
        <div className="app-scroll-x">
          <table className="cf-table app-screen__table">
            {c.head && (
              <thead>
                <tr>
                  {c.head.map((h, i) => (
                    <th key={i}>{h}</th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {c.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((cell, j) => (
                    <td key={j}>
                      <Inline text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

function Panel({ panel }: { panel: ResolvedGmScreenPanel }) {
  return (
    <Card title={panel.title} className="app-screen__panel" data-panel={panel.id}>
      {panel.blocks.map((b) => (
        <section key={b.key} className="app-screen__block" aria-label={b.title}>
          <h4 className="app-screen__title">
            {b.title}
            {b.cite && <span className="cf-muted app-screen__cite"> {b.cite}</span>}
          </h4>
          {b.content.map((c, i) => (
            <Content key={i} c={c} />
          ))}
        </section>
      ))}
    </Card>
  );
}

export function ScreenView({ choices }: { choices: PanelChoice[] }) {
  const included = choices.filter((c) => c.included).map((c) => c.panel);
  const sides = [
    { side: "gm" as const, title: "GM side" },
    { side: "players" as const, title: "Player side" },
  ];
  if (included.length === 0) return <p className="cf-muted">No panels are ticked. Tick some under Print.</p>;
  return (
    <div className="app-stack" data-testid="gm-screen-onscreen">
      {sides.map(({ side, title }) => {
        const panels = included.filter((p) => p.side === side);
        if (panels.length === 0) return null;
        return (
          <section key={side} aria-label={title} className="app-stack">
            <h2 className="app-subtitle">{title}</h2>
            <div className="app-screen">
              {panels.map((p) => (
                <Panel key={p.id} panel={p} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

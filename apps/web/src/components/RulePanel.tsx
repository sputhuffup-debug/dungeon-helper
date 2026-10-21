/**
 * Rule card in a drawer, with linked tables opening in a dialog and linked
 * rules replacing the card. Used by the sheet "?" buttons and the rules page.
 */
import type { LoadedModule, RollTable } from "@campaign-forge/module-sdk";
import { useState } from "react";
import { useCampaign } from "../state/hooks";
import { Badge, Dialog, Drawer, PageRef, RuleCardView } from "./ui";

export function RuleDrawer({ ruleId, onClose, onOpenRule }: { ruleId: string | undefined; onClose: () => void; onOpenRule: (id: string) => void }) {
  const { module } = useCampaign();
  const card = ruleId ? module.rule(ruleId) : undefined;
  const [tableId, setTableId] = useState<string | undefined>();
  return (
    <>
      <Drawer open={!!ruleId} onClose={onClose} title={card?.title ?? "Rule"}>
        {card ? (
          <RuleCardView
            card={card}
            onOpenRule={onOpenRule}
            onOpenTable={setTableId}
            resolveName={(kind, id) => resolveLinkName(module, kind, id)}
          />
        ) : (
          ruleId && <p className="cf-muted">No rule card with id {ruleId}.</p>
        )}
      </Drawer>
      <TableDialog tableId={tableId} onClose={() => setTableId(undefined)} />
    </>
  );
}

export function resolveLinkName(module: LoadedModule, kind: "rule" | "table" | "field" | "tracker", id: string): string | undefined {
  switch (kind) {
    case "rule":
      return module.rule(id)?.title;
    case "table":
      return module.table(id)?.name;
    case "tracker":
      return module.tracker(id)?.name;
    case "field": {
      const types = [...module.module.entityTypes].sort((a, b) => b.id.length - a.id.length);
      const def = types.find((t) => id.startsWith(`${t.id}.`));
      if (!def) return id;
      const path = id.slice(def.id.length + 1);
      for (const s of def.sheet.sections) {
        const f = s.fields.find((x) => x.path === path);
        if (f?.label) return `${def.name}: ${f.label}`;
      }
      return `${def.name}: ${path}`;
    }
  }
}

export function TableDialog({ tableId, onClose }: { tableId: string | undefined; onClose: () => void }) {
  const { module } = useCampaign();
  const table = tableId ? module.table(tableId) : undefined;
  return (
    <Dialog open={!!tableId} onClose={onClose} title={table?.name ?? "Table"} className="app-table-dialog">
      {table ? <TableView table={table} /> : <p className="cf-muted">No table with id {tableId}.</p>}
    </Dialog>
  );
}

export function TableView({ table }: { table: RollTable }) {
  return (
    <div className="app-tableview">
      <p className="app-row">
        <Badge tone="accent">{table.dice}</Badge>
        <PageRef page={table.page} cite={table.cite} original={table.original} />
        {table.unverified && <Badge tone="warning">unverified</Badge>}
        {table.notes && <span className="cf-muted">{table.notes}</span>}
      </p>
      <div className="app-scroll-x">
        <table className="cf-table">
          <thead>
            <tr>
              <th>Roll</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => (
              <tr key={i}>
                <td className="cf-table__num cf-mono">{formatRange(row.range)}</td>
                <td>
                  <strong>{row.label ?? ""}</strong>
                  {row.label ? " " : ""}
                  <span className="cf-muted">{formatResult(row.result, row.label)}</span>
                  {row.gmDecides && (
                    <>
                      {" "}
                      <Badge tone="warning">GM decides</Badge>
                    </>
                  )}
                  {row.roll?.map((n) => (
                    <span key={n.table} className="cf-muted">
                      {" "}
                      then roll {module_name(n.table)}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function module_name(id: string): string {
  return id.split(".").pop() ?? id;
}

function formatRange([a, b]: [number, number]): string {
  const lo = a <= -99 ? "≤" + b : String(a);
  if (a <= -99) return lo;
  if (b >= 99) return `${a}+`;
  return a === b ? String(a) : `${a}–${b}`;
}

function formatResult(result: unknown, label?: string): string {
  if (typeof result === "string") return result === label ? "" : result;
  if (result && typeof result === "object") {
    return Object.entries(result as Record<string, unknown>)
      .filter(([, v]) => v !== undefined && v !== null && v !== "" && String(v) !== label)
      .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
      .join(", ");
  }
  return "";
}

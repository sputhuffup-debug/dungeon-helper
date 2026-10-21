import { useState } from "react";
import { Button } from "../primitives/Button";
import { Markdown } from "../primitives/Markdown";
import { isRecord } from "../sheet/paths";
import { ListField } from "./structured";
import type { WidgetProps } from "./types";
import { configString } from "./types";

/**
 * A list of named text entries (traits, actions, features) read like a stat
 * block: "**Name.** text" paragraphs, rendered as Markdown. "Edit" switches to
 * the list editor. `config.nameKey` / `config.textKey` (default `name` / `desc`).
 */
export function EntriesField(props: WidgetProps) {
  const { value, readonly, field } = props;
  const [editing, setEditing] = useState(false);
  const nameKey = configString(field, "nameKey", "name") as string;
  const textKey = configString(field, "textKey", "desc") as string;
  const items = (Array.isArray(value) ? value : []).filter(isRecord);
  if (editing && !readonly) {
    return (
      <div className="cf-entries cf-entries--editing">
        <ListField {...props} />
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
          Done
        </Button>
      </div>
    );
  }
  return (
    <div className="cf-entries">
      {items.length === 0 && <span className="cf-muted">None</span>}
      {items.map((it, i) => {
        const name = typeof it[nameKey] === "string" ? (it[nameKey] as string).trim() : "";
        const text = typeof it[textKey] === "string" ? (it[textKey] as string).trim() : "";
        // The name leads the first paragraph, as in a printed stat block.
        const md = name ? `***${name.replace(/[*_]/g, "")}.*** ${text}` : text;
        return (
          <div key={i} className="cf-entries__item" data-entry={name || i}>
            <Markdown text={md} />
          </div>
        );
      })}
      {!readonly && (
        <div>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </div>
      )}
    </div>
  );
}

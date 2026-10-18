import { useState } from "react";

/** Chips plus a text box; Enter or comma adds a tag. */
export function TagInput({ value, onChange, placeholder = "Add tag", label = "Tags" }: { value: string[]; onChange: (tags: string[]) => void; placeholder?: string; label?: string }) {
  const [text, setText] = useState("");
  const add = () => {
    const parts = text
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (parts.length) onChange([...new Set([...value, ...parts])]);
    setText("");
  };
  return (
    <div className="cf-chips app-taginput">
      {value.map((t) => (
        <span key={t} className="cf-chip">
          {t}
          <button type="button" className="cf-chip__remove" aria-label={`Remove tag ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}>
            ×
          </button>
        </span>
      ))}
      <input
        className="cf-input cf-input--inline"
        aria-label={label}
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={add}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          } else if (e.key === "Backspace" && text === "" && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
      />
    </div>
  );
}

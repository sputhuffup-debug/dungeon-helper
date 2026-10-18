import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "../sheet/paths";

export interface TabItem {
  id: string;
  label: ReactNode;
  content?: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: TabItem[];
  /** Controlled active tab id. */
  value?: string;
  defaultValue?: string;
  onChange?: (id: string) => void;
  className?: string;
}

export function Tabs({ tabs, value, defaultValue, onChange, className }: TabsProps) {
  const base = useId();
  const [inner, setInner] = useState(defaultValue ?? tabs[0]?.id ?? "");
  const active = value ?? inner;
  const select = (id: string) => {
    setInner(id);
    onChange?.(id);
  };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const enabled = tabs.filter((t) => !t.disabled);
    const cur = enabled.findIndex((t) => t.id === tabs[index]?.id);
    if (cur < 0) return;
    let next: number | undefined;
    if (e.key === "ArrowRight") next = (cur + 1) % enabled.length;
    else if (e.key === "ArrowLeft") next = (cur - 1 + enabled.length) % enabled.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = enabled.length - 1;
    if (next === undefined) return;
    e.preventDefault();
    const target = enabled[next];
    if (!target) return;
    select(target.id);
    document.getElementById(`${base}-tab-${target.id}`)?.focus();
  };
  const current = tabs.find((t) => t.id === active);
  return (
    <div className={cx("cf-tabs", className)}>
      <div className="cf-tabs__list" role="tablist">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            id={`${base}-tab-${t.id}`}
            type="button"
            role="tab"
            className={cx("cf-tabs__tab", t.id === active && "cf-tabs__tab--active")}
            aria-selected={t.id === active}
            aria-controls={`${base}-panel-${t.id}`}
            tabIndex={t.id === active ? 0 : -1}
            disabled={t.disabled}
            onClick={() => select(t.id)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {current?.content !== undefined && (
        <div className="cf-tabs__panel" role="tabpanel" id={`${base}-panel-${current.id}`} aria-labelledby={`${base}-tab-${current.id}`}>
          {current.content}
        </div>
      )}
    </div>
  );
}

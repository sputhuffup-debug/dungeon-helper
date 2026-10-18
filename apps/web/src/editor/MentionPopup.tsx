import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { EntityIcon } from "../components/EntityIcon";
import type { MentionController } from "./mention";

export function MentionPopup({ controller, typeInfo }: { controller: MentionController; typeInfo: (typeId: string | undefined) => { name?: string; icon?: string; kind?: string } }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  if (!state.active || typeof document === "undefined") return null;
  const style = state.rect ? { left: Math.max(8, Math.min(state.rect.left, window.innerWidth - 300)), top: state.rect.bottom + 6 } : { left: 16, top: 16 };
  const keep = (e: React.MouseEvent) => e.preventDefault();
  return createPortal(
    <div className="cf-mention" style={style} role="listbox" aria-label="Mention suggestions" data-testid="mention-popup" onMouseDown={keep}>
      {state.mode === "items" ? (
        state.items.length === 0 ? (
          <div className="cf-mention__empty">Type a name to search or create</div>
        ) : (
          state.items.map((item, i) => {
            const info = item.kind === "entity" ? typeInfo(item.type) : undefined;
            return (
              <button
                key={item.kind === "entity" ? item.id : "__create"}
                type="button"
                role="option"
                aria-selected={i === state.index}
                className={`cf-mention__item${i === state.index ? " is-active" : ""}${item.kind === "create" ? " cf-mention__item--create" : ""}`}
                onMouseDown={keep}
                onClick={() => controller.choose(i)}
              >
                {item.kind === "entity" ? (
                  <>
                    <EntityIcon icon={info?.icon} kind={info?.kind} size={14} />
                    <span className="cf-mention__name">{item.name}</span>
                    <span className="cf-mention__type">{info?.name ?? ""}</span>
                  </>
                ) : (
                  <span className="cf-mention__name">Create “{item.name}” as…</span>
                )}
              </button>
            );
          })
        )
      ) : (
        <>
          <div className="cf-mention__head">Create “{state.query.trim()}” as</div>
          {state.types.map((t, i) => (
            <button
              key={t.id}
              type="button"
              role="option"
              aria-selected={i === state.index}
              className={`cf-mention__item${i === state.index ? " is-active" : ""}`}
              onMouseDown={keep}
              onClick={() => controller.choose(i)}
            >
              <EntityIcon icon={t.icon} kind={t.kind} size={14} />
              <span className="cf-mention__name">{t.name}</span>
            </button>
          ))}
        </>
      )}
    </div>,
    document.body,
  );
}

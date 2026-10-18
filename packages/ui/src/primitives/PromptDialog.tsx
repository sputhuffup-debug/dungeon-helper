import { useEffect, useState } from "react";
import type { Effect, Prompt } from "@campaign-forge/module-sdk";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { PageRef } from "./PageRef";

export interface PromptAnswer {
  promptId: string;
  kind: Prompt["kind"];
  /** yes/no, chosen option id, number, or text. */
  value: boolean | string | number | undefined;
  optionId?: string;
  /** Effects the module attached to this answer, for the app to apply. */
  effects: Effect[];
  /** For roll prompts: what to roll. */
  roll?: Prompt["roll"];
  entity?: string;
}

export interface PromptDialogProps {
  prompt: Prompt | null | undefined;
  open?: boolean;
  onAnswer: (answer: PromptAnswer) => void;
  onCancel?: () => void;
  /** Resolve the prompt's entity id to a name for the title. */
  resolveEntityName?: (id: string) => string | undefined;
}

/** Renders a module `Prompt` (yesno / choice / number / text / roll) as a modal. */
export function PromptDialog({ prompt, open, onAnswer, onCancel, resolveEntityName }: PromptDialogProps) {
  const [text, setText] = useState("");
  const [num, setNum] = useState<number>(0);
  useEffect(() => {
    setText("");
    setNum(0);
  }, [prompt?.id]);

  const isOpen = (open ?? true) && !!prompt;
  if (!prompt) return <Dialog open={false} />;

  const base = { promptId: prompt.id, kind: prompt.kind, entity: prompt.entity };
  const who = prompt.entity ? resolveEntityName?.(prompt.entity) ?? prompt.entity : undefined;

  let body: React.ReactNode;
  let footer: React.ReactNode;
  switch (prompt.kind) {
    case "yesno":
      footer = (
        <>
          <Button onClick={() => onAnswer({ ...base, value: false, effects: [] })}>No</Button>
          <Button variant="primary" onClick={() => onAnswer({ ...base, value: true, effects: prompt.onYes ?? [] })}>
            Yes
          </Button>
        </>
      );
      break;
    case "choice":
      body = (
        <div className="cf-prompt__options">
          {(prompt.options ?? []).map((o) => (
            <Button key={o.id} onClick={() => onAnswer({ ...base, value: o.id, optionId: o.id, effects: o.effects ?? [] })}>
              {o.label}
            </Button>
          ))}
        </div>
      );
      break;
    case "number":
      body = <input className="cf-input" type="number" aria-label="Answer" value={num} onChange={(e) => setNum(Number(e.target.value))} />;
      footer = (
        <Button variant="primary" onClick={() => onAnswer({ ...base, value: num, effects: prompt.onYes ?? [] })}>
          OK
        </Button>
      );
      break;
    case "text":
      body = <textarea className="cf-textarea" aria-label="Answer" value={text} onChange={(e) => setText(e.target.value)} />;
      footer = (
        <Button variant="primary" onClick={() => onAnswer({ ...base, value: text, effects: prompt.onYes ?? [] })}>
          OK
        </Button>
      );
      break;
    case "roll":
      body = (
        <p className="cf-muted">
          {prompt.roll?.operation ? `Operation: ${prompt.roll.operation}` : prompt.roll?.table ? `Table: ${prompt.roll.table}` : "Roll now."}
        </p>
      );
      footer = (
        <Button variant="primary" onClick={() => onAnswer({ ...base, value: undefined, effects: prompt.onYes ?? [], roll: prompt.roll })}>
          Roll
        </Button>
      );
      break;
  }

  return (
    <Dialog open={isOpen} onClose={onCancel} title={who ? `${who}` : "Question"} footer={footer} className="cf-prompt">
      <p className="cf-prompt__text">
        {prompt.text} <PageRef page={prompt.page} />
      </p>
      {body}
    </Dialog>
  );
}

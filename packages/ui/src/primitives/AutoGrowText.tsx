/**
 * A text box that wraps and grows taller as the text passes its width, in
 * place of a single-line `<input>` for free text. It is a `<textarea rows=1>`
 * (role textbox, like the input) styled as `cf-input`, so a short value looks
 * the same; it grows with CSS `field-sizing: content` where the browser has it
 * and with a measured height elsewhere, up to `maxRows` lines (8), then
 * scrolls.
 *
 * Single-line by default: Enter never inserts a newline (it submits the form
 * the box is in, as Enter in an input does, unless a key handler took it), and
 * newlines pasted or dropped in become spaces. `multiline` lets Enter and
 * newlines through.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, type ChangeEvent, type CSSProperties, type KeyboardEvent, type Ref, type TextareaHTMLAttributes } from "react";
import { cx } from "../sheet/paths";

export interface AutoGrowTextProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "rows" | "cols"> {
  /** Let Enter and pasted newlines through (default: single line). */
  multiline?: boolean;
  /** Lines it grows to before it scrolls (default 8). */
  maxRows?: number;
  /** Marks the value invalid (`cf-input--invalid`). */
  invalid?: boolean;
  ref?: Ref<HTMLTextAreaElement>;
}

/** The text with each line break turned into a space (what a single-line box keeps). */
export function singleLineText(text: string): string {
  return text.replace(/\r\n|[\r\n]/g, " ");
}

let fieldSizing: boolean | undefined;
/** Whether the browser sizes a textarea to its content in CSS. */
function cssSizesToContent(): boolean {
  if (fieldSizing === undefined) fieldSizing = typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("field-sizing", "content");
  return fieldSizing;
}

/** Fallback sizing: the content's height, capped at the CSS max-height (then it scrolls). */
function fitHeight(el: HTMLTextAreaElement): void {
  if (cssSizesToContent()) return;
  el.style.height = "auto";
  // not laid out (hidden, or a test DOM): leave the height to CSS
  if (el.scrollHeight === 0) {
    el.style.height = "";
    return;
  }
  const cs = getComputedStyle(el);
  const borders = (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
  const max = parseFloat(cs.maxHeight);
  const want = el.scrollHeight + borders;
  const capped = Number.isFinite(max) && want > max;
  el.style.height = `${capped ? max : want}px`;
  el.style.overflowY = capped ? "auto" : "hidden";
}

const TEXT_INPUT_TYPES = new Set(["text", "search", "url", "tel", "email", "password", "date", "month", "week", "time", "datetime-local", "number"]);

/**
 * What Enter does in a single-line input inside a form: click the form's
 * default (first) submit button, or, with none, submit when this is the only
 * field that blocks implicit submission.
 */
function implicitSubmit(el: HTMLTextAreaElement): void {
  const form = el.form;
  if (!form) return;
  const controls = Array.from(form.elements);
  const submitter = controls.find((c) => (c instanceof HTMLButtonElement && c.type === "submit") || (c instanceof HTMLInputElement && (c.type === "submit" || c.type === "image"))) as HTMLButtonElement | HTMLInputElement | undefined;
  if (submitter) {
    if (!submitter.disabled) form.requestSubmit(submitter);
    return;
  }
  const blocking = controls.filter((c) => (c instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(c.type)) || (c instanceof HTMLTextAreaElement && c.dataset.singleLine === "true"));
  if (blocking.length === 1) form.requestSubmit();
}

export function AutoGrowText({ multiline = false, maxRows, invalid, className, style, onChange, onKeyDown, ref, ...rest }: AutoGrowTextProps) {
  const inner = useRef<HTMLTextAreaElement | null>(null);
  const setRef = useCallback(
    (el: HTMLTextAreaElement | null) => {
      inner.current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) (ref as { current: HTMLTextAreaElement | null }).current = el;
    },
    [ref],
  );

  // fallback sizing: on every value change, and when the width changes the wrapping
  useLayoutEffect(() => {
    if (inner.current) fitHeight(inner.current);
  }, [rest.value]);
  useEffect(() => {
    const el = inner.current;
    if (!el || cssSizesToContent() || typeof ResizeObserver === "undefined") return;
    let width = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      fitHeight(el);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const change = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    if (!multiline && /[\r\n]/.test(el.value)) {
      const caret = el.selectionStart;
      const before = singleLineText(el.value.slice(0, caret));
      el.value = singleLineText(el.value);
      el.setSelectionRange(before.length, before.length);
    }
    fitHeight(el);
    onChange?.(e);
  };

  const keyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(e);
    if (multiline || e.key !== "Enter" || e.nativeEvent.isComposing) return;
    if (e.defaultPrevented) return;
    e.preventDefault();
    implicitSubmit(e.currentTarget);
  };

  const sized: CSSProperties | undefined = maxRows ? ({ ...style, "--cf-autogrow-rows": maxRows } as CSSProperties) : style;
  return (
    <textarea
      {...rest}
      ref={setRef}
      rows={1}
      className={cx(className ?? "cf-input", "cf-autogrow", invalid && "cf-input--invalid")}
      style={sized}
      data-single-line={multiline ? undefined : "true"}
      onChange={change}
      onKeyDown={keyDown}
    />
  );
}

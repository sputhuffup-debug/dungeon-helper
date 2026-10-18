import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { RuleCard } from "@campaign-forge/module-sdk";
import { Markdown, PageRef, PromptDialog, RuleCardList, RuleCardView, clearToasts, formatPageRef, pushToast, ToastViewport, useTheme } from "../src/index";
import { exampleModule } from "./fixtures";

describe("PageRef", () => {
  it("formats single pages and ranges", () => {
    expect(formatPageRef(43)).toBe("p. 43");
    expect(formatPageRef([42, 43])).toBe("p. 42–43");
    render(<PageRef page={[40, 41]} />);
    expect(screen.getByText("p. 40–41")).toBeInTheDocument();
  });
});

describe("Markdown", () => {
  it("renders bold, italic, lists and links without raw HTML", () => {
    const { container } = render(<Markdown text={"**Bold** and *it*\n\n- one\n- two\n\n[site](https://example.com) <b>x</b>"} />);
    expect(container.querySelector("strong")).toHaveTextContent("Bold");
    expect(container.querySelector("em")).toHaveTextContent("it");
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(container.querySelector("a")).toHaveAttribute("href", "https://example.com");
    expect(container.querySelector("b")).toBeNull();
  });
});

describe("rule cards", () => {
  const rules = exampleModule.rules as RuleCard[];

  it("RuleCardView shows page, mode tags and link buttons", () => {
    const onOpenRule = vi.fn();
    render(<RuleCardView card={rules.find((r) => r.id === "example.rule.doom")!} onOpenRule={onOpenRule} />);
    expect(screen.getByText("p. 44")).toBeInTheDocument();
    expect(screen.getByText("hardcore")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "example.rule.push" }));
    expect(onOpenRule).toHaveBeenCalledWith("example.rule.push");
  });

  it("RuleCardList filters by search and mode", () => {
    render(<RuleCardList cards={rules} modes={exampleModule.manifest.modes} mode="standard" />);
    expect(screen.queryByText("Doom")).toBeNull();
    expect(screen.getByText("Wounds")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by mode" }), { target: { value: "" } });
    expect(screen.getByText("Doom")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search rules" }), { target: { value: "push" } });
    expect(screen.getByText("Pushing a roll")).toBeInTheDocument();
    expect(screen.queryByText("Wounds")).toBeNull();
  });
});

describe("PromptDialog", () => {
  it("answers a yes/no prompt with the module's onYes effects", () => {
    const prompts = exampleModule.hooks!.onSessionEnd!({ mode: "standard", characters: [{ id: "e1", name: "Hero", fields: {} }], trackerState: {} });
    const onAnswer = vi.fn();
    render(<PromptDialog prompt={prompts[0]} onAnswer={onAnswer} />);
    fireEvent.click(screen.getByRole("button", { name: "Yes", hidden: true }));
    expect(onAnswer).toHaveBeenCalledWith(expect.objectContaining({ promptId: "example.prompt.rest", value: true, effects: prompts[0]!.onYes }));
  });
});

describe("toasts", () => {
  afterEach(() => act(() => clearToasts()));
  it("pushes and dismisses toasts", () => {
    render(<ToastViewport />);
    act(() => {
      pushToast("Saved", { timeout: 0 });
    });
    expect(screen.getByText("Saved")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("Saved")).toBeNull();
  });
});

describe("useTheme", () => {
  it("writes data-theme on <html> and persists it", () => {
    function T() {
      const { theme, setTheme } = useTheme();
      return (
        <button type="button" onClick={() => setTheme("light")}>
          {theme}
        </button>
      );
    }
    render(<T />);
    fireEvent.click(screen.getByRole("button"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(localStorage.getItem("cf-theme")).toBe("light");
  });
});

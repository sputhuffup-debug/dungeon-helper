import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import type { SiteMap } from "@campaign-forge/core";
import { ZoneMapEditor, ZoneMapView, nextBorderKind } from "../src/index";

function emptyMap(): SiteMap {
  return {
    id: "map1",
    created: "2026-10-18T00:00:00Z",
    updated: "2026-10-18T00:00:00Z",
    name: "Deck B",
    zones: [],
    borders: [],
    accessPoints: [],
    visibility: { level: "gm" },
  };
}

let latest: SiteMap = emptyMap();
function Harness({ initial }: { initial: SiteMap }) {
  const [map, setMap] = useState(initial);
  latest = map;
  return (
    <ZoneMapEditor
      map={map}
      onChange={(m) => {
        latest = m;
        setMap(m);
      }}
    />
  );
}

function drag(el: Element, from: [number, number], to: [number, number]) {
  fireEvent.pointerDown(el, { clientX: from[0], clientY: from[1], button: 0, buttons: 1 });
  fireEvent.pointerMove(el, { clientX: (from[0] + to[0]) / 2, clientY: (from[1] + to[1]) / 2, buttons: 1 });
  fireEvent.pointerMove(el, { clientX: to[0], clientY: to[1], buttons: 1 });
  fireEvent.pointerUp(el, { clientX: to[0], clientY: to[1] });
}

function zoneRect(id: string): Element {
  const el = document.querySelector(`[data-zone="${id}"] rect.cf-zone`);
  if (!el) throw new Error(`zone ${id} not rendered`);
  return el;
}

describe("ZoneMapEditor", () => {
  it("creates a zone by dragging on empty space and lets the GM edit it", () => {
    render(<Harness initial={emptyMap()} />);
    const viewport = screen.getByTestId("map-viewport");
    drag(viewport, [100, 120], [300, 270]);
    expect(latest.zones).toHaveLength(1);
    expect(latest.zones[0]!.rect).toEqual({ x: 100, y: 120, w: 200, h: 150 });
    expect(latest.zones[0]!.cluttered).toBe(false);

    // The new zone is selected; edit name and cluttered in the side panel.
    fireEvent.change(screen.getByRole("textbox", { name: "Zone name" }), { target: { value: "Galley" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Cluttered" }));
    expect(latest.zones[0]).toMatchObject({ name: "Galley", cluttered: true });
    expect(screen.getByRole("button", { name: "Zone Galley, cluttered" })).toBeInTheDocument();
  });

  it("ignores tiny drags", () => {
    render(<Harness initial={emptyMap()} />);
    drag(screen.getByTestId("map-viewport"), [10, 10], [12, 13]);
    expect(latest.zones).toHaveLength(0);
  });

  it("moves a zone by dragging it", () => {
    const map = emptyMap();
    map.zones = [{ id: "a", name: "A", rect: { x: 50, y: 50, w: 100, h: 100 }, cluttered: false }];
    render(<Harness initial={map} />);
    const rect = zoneRect("a");
    fireEvent.pointerDown(rect, { clientX: 60, clientY: 60, button: 0 });
    fireEvent.pointerMove(screen.getByTestId("map-viewport"), { clientX: 90, clientY: 100, buttons: 1 });
    fireEvent.pointerUp(screen.getByTestId("map-viewport"), { clientX: 90, clientY: 100 });
    expect(latest.zones[0]!.rect).toEqual({ x: 80, y: 90, w: 100, h: 100 });
  });

  it("connect mode cycles a border open -> blocked -> door -> removed", () => {
    const map = emptyMap();
    map.zones = [
      { id: "a", name: "A", rect: { x: 0, y: 0, w: 100, h: 100 }, cluttered: false },
      { id: "b", name: "B", rect: { x: 200, y: 0, w: 100, h: 100 }, cluttered: true },
    ];
    render(<Harness initial={map} />);
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    const connect = () => {
      fireEvent.pointerDown(zoneRect("a"), { button: 0 });
      fireEvent.pointerDown(zoneRect("b"), { button: 0 });
    };
    connect();
    expect(latest.borders).toEqual([{ from: "a", to: "b", kind: "open" }]);
    expect(document.querySelector('[data-border="a-b"]')).toHaveAttribute("data-kind", "open");
    connect();
    expect(latest.borders).toEqual([{ from: "a", to: "b", kind: "blocked" }]);
    connect();
    expect(latest.borders).toEqual([{ from: "a", to: "b", kind: "door" }]);
    connect();
    expect(latest.borders).toEqual([]);
    // No zones were created or moved while connecting.
    expect(latest.zones.map((z) => z.rect)).toEqual(map.zones.map((z) => z.rect));
  });

  it("nextBorderKind cycles through the kinds", () => {
    expect(nextBorderKind(undefined)).toBe("open");
    expect(nextBorderKind("open")).toBe("blocked");
    expect(nextBorderKind("blocked")).toBe("door");
    expect(nextBorderKind("door")).toBeUndefined();
  });

  it("zoom buttons change the zoom level", () => {
    render(<Harness initial={emptyMap()} />);
    expect(screen.getByTestId("zoom")).toHaveTextContent("100%");
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByTestId("zoom")).toHaveTextContent("125%");
  });
});

describe("ZoneMapView", () => {
  it("renders zones, borders and tokens read-only", () => {
    const map = emptyMap();
    map.zones = [
      { id: "a", name: "Bridge", rect: { x: 0, y: 0, w: 100, h: 100 }, cluttered: false },
      { id: "b", name: "Airlock", rect: { x: 200, y: 0, w: 100, h: 100 }, cluttered: false },
    ];
    map.borders = [{ from: "a", to: "b", kind: "door" }];
    render(<ZoneMapView map={map} tokens={[{ id: "t1", label: "Ripley", zone: "b" }]} />);
    expect(screen.getByText("Bridge")).toBeInTheDocument();
    expect(document.querySelector('[data-border="a-b"]')).toHaveAttribute("data-kind", "door");
    const token = document.querySelector('[data-token="t1"]');
    expect(token?.closest("[data-zone]")).toHaveAttribute("data-zone", "b");
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});

import "fake-indexeddb/auto";
import { listCampaigns } from "@campaign-forge/core";
import { act, render, screen, waitFor } from "@testing-library/react";
import { useMemo } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { createCampaign, createEntity, createEntityFromPreset, deleteCampaign, linkEntities, updateEntityField } from "./actions";
import { CampaignProvider, openCampaign, useCampaign } from "./CampaignProvider";
import { useComputed, useList, useMeta, useOfflineStatus, useRecord } from "./hooks";

const opened: Array<() => void> = [];
afterEach(() => {
  while (opened.length) opened.pop()?.();
});

describe("campaign actions", () => {
  it("creates a campaign, registers it, and opens it again", async () => {
    const id = await createCampaign({ name: "Fixture", moduleId: "example", gmName: "Ana" });
    expect((await listCampaigns()).some((c) => c.id === id)).toBe(true);
    const ctx = await openCampaign(id);
    opened.push(ctx.close);
    const meta = ctx.store.meta();
    expect(meta.name).toBe("Fixture");
    expect(meta.mode).toBe("standard");
    expect(meta.members[0]?.name).toBe("Ana");
    expect(ctx.module.manifest.id).toBe("example");
  });

  it("creates entities from presets with defaults and provenance", async () => {
    const id = await createCampaign({ name: "Presets", moduleId: "example" });
    const ctx = await openCampaign(id);
    opened.push(ctx.close);
    const e = createEntityFromPreset(ctx, "example.preset.veteran", { name: "Old Bram" });
    expect(e.name).toBe("Old Bram");
    expect(e.provenance?.preset).toBe("example.preset.veteran");
    expect((e.fields.attributes as Record<string, number>).might).toBe(4);
    const blank = createEntity(ctx, { type: "example.place", name: "" });
    expect(blank.name).toBe("Place");
    expect(blank.fields.danger).toBe("quiet");
    const rel = linkEntities(ctx, "example.guards", e.id, blank.id);
    expect(linkEntities(ctx, "example.guards", e.id, blank.id).id).toBe(rel.id);
  });

  it("records edits on generated entities", async () => {
    const id = await createCampaign({ name: "Gen", moduleId: "example" });
    const ctx = await openCampaign(id);
    opened.push(ctx.close);
    const run = ctx.store.insert("generatorRuns", {
      procedure: "p",
      moduleId: "example",
      moduleVersion: "0.1.0",
      seed: "s",
      inputs: {},
      rolls: [],
      results: {},
      produced: [],
      editedFields: [],
    });
    const e = ctx.store.createEntity({ type: "example.place", name: "Rolled", provenance: { generatorRun: run.id } });
    updateEntityField(ctx, e.id, "danger", "deadly");
    expect(ctx.store.get("entities", e.id)?.fields.danger).toBe("deadly");
    expect(ctx.store.get("entities", e.id)?.provenance?.editedFields).toEqual(["danger"]);
    expect(ctx.store.get("generatorRuns", run.id)?.editedFields).toEqual([{ entity: e.id, path: "danger" }]);
  });

  it("deletes a campaign from the device", async () => {
    const id = await createCampaign({ name: "Doomed", moduleId: "example" });
    await deleteCampaign(id);
    expect((await listCampaigns()).some((c) => c.id === id)).toBe(false);
    await expect(openCampaign(id)).rejects.toThrow(/No campaign/);
  });
});

describe("state hooks", () => {
  it("re-render on record, list, meta and computed changes with stable snapshots", async () => {
    const id = await createCampaign({ name: "Hooks", moduleId: "example" });
    let ctxRef: ReturnType<typeof useCampaign> | undefined;
    let renders = 0;
    const seen: unknown[] = [];

    function Probe({ entityId }: { entityId?: string }) {
      ctxRef = useCampaign();
      renders++;
      const meta = useMeta();
      const filter = useMemo(() => (e: { type: string }) => e.type === "example.hero", []);
      const heroes = useList("entities", filter);
      const hero = useRecord("entities", entityId);
      const computed = useComputed(hero);
      seen.push(hero);
      return (
        <div>
          <span data-testid="name">{meta.name}</span>
          <span data-testid="count">{heroes.length}</span>
          <span data-testid="health">{String(computed.health ?? "")}</span>
        </div>
      );
    }

    const view = render(
      <CampaignProvider campaignId={id} loading={<span>loading</span>}>
        <Probe />
      </CampaignProvider>,
    );
    await screen.findByTestId("name");
    expect(screen.getByTestId("name").textContent).toBe("Hooks");
    expect(screen.getByTestId("count").textContent).toBe("0");

    let heroId = "";
    act(() => {
      heroId = createEntityFromPreset(ctxRef!, "example.preset.veteran").id;
    });
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));

    view.rerender(
      <CampaignProvider campaignId={id} loading={<span>loading</span>}>
        <Probe entityId={heroId} />
      </CampaignProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("health").textContent).toBe("8"));

    // stable snapshot: unrelated re-renders keep the same record object
    const before = seen[seen.length - 1];
    act(() => {
      ctxRef!.store.updateMeta({ name: "Renamed" });
    });
    await waitFor(() => expect(screen.getByTestId("name").textContent).toBe("Renamed"));
    expect(seen[seen.length - 1]).toBe(before);

    act(() => {
      updateEntityField(ctxRef!, heroId, "attributes.might", 5);
    });
    await waitFor(() => expect(screen.getByTestId("health").textContent).toBe("10"));
    expect(renders).toBeGreaterThan(3);
    view.unmount();
  });

  it("useOfflineStatus follows the browser's online events", async () => {
    let online = true;
    Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => online });
    function Status() {
      const { offline } = useOfflineStatus();
      return <span data-testid="status">{offline ? "offline" : "online"}</span>;
    }
    render(<Status />);
    expect(screen.getByTestId("status").textContent).toBe("online");
    act(() => {
      online = false;
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByTestId("status").textContent).toBe("offline");
    act(() => {
      online = true;
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.getByTestId("status").textContent).toBe("online");
  });
});

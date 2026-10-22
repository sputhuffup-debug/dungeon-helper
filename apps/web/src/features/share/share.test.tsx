import "fake-indexeddb/auto";
import { fromMarkdown, revealZones, runMapGenerator, shareBaseline, startLive, type Id } from "@campaign-forge/core";
import { exampleModule, exampleSiteGenerator } from "@campaign-forge/module-example";
import { svgPagesToPdf } from "@campaign-forge/ui";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCampaign, createEntity } from "../../state/actions";
import { CampaignContext, openCampaign, type CampaignContextValue } from "../../state/CampaignProvider";
import { planNextSession } from "../../state/tableActions";
import { applyPrimerDraft, draftConflicts, primerDraft, startPrimer } from "../../state/primerActions";
import { primerShareSections } from "./primerShare";
import { ShareDialog, sessionShare } from "./ShareDialog";
import { buildShareFiles, canShareFiles, sendFiles } from "./shareExport";
import { markdownBlocks, packetPages, phoneCards, shareSections, cardSvg } from "./shareLayout";

/** Strings planted where only the GM may look. */
const SECRETS = ["SECRET-GM-NOTES", "SECRET-GM-SITUATION", "SECRET-UNREVEALED", "SECRET-AGENDA", "SECRET-GM-FIELD", "SECRET-GM-NPC", "SECRET-SESSION-LOG"];

/** Every string a PDF from the app's writer shows (its text operators), decoded. */
export function pdfText(bytes: Uint8Array): string {
  const raw = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  const out: string[] = [];
  for (const m of raw.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)) {
    out.push(m[1]!.replace(/\\([0-7]{3}|.)/g, (_x, e: string) => (/^[0-7]{3}$/.test(e) ? String.fromCharCode(parseInt(e, 8)) : e)));
  }
  return out.join("\n");
}

const opened: Array<() => void> = [];
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  while (opened.length) opened.pop()?.();
});


interface Seeded {
  ctx: CampaignContextValue;
  sessionId: Id;
  sceneId: Id;
  revealed: Id;
}

/** A campaign with GM-only text, GM map layers, unrevealed handouts and GM fields beside what the players may see. */
async function seed(): Promise<Seeded> {
  const ctx = await openCampaign(await createCampaign({ name: "Share test", moduleId: "example" }));
  opened.push(ctx.close);
  const { store, registry } = ctx;
  const write = (id: Id | undefined, md: string) => id && fromMarkdown(registry.open(id), md);
  const npc = createEntity(ctx, { type: "example.hero", name: "SECRET-GM-NPC", fields: { attributes: { might: 2, wits: 2 } } });
  const pc = createEntity(ctx, { type: "example.hero", name: "Aria", fields: { isPC: true, attributes: { might: 4, wits: 2 }, notes: "SECRET-GM-FIELD" } });
  store.update("entities", pc.id, { visibility: { level: "players" } });

  const adventure = store.createAdventure({ title: "The Barrow", withDocs: true });
  write(adventure.playerIntroDoc, "Find the lost bell.");
  write(adventure.gmSituationDoc, "SECRET-GM-SITUATION");
  const act1 = store.createAct(adventure.id, { title: "Arrival" });
  const result = runMapGenerator(exampleModule, exampleSiteGenerator, {}, { seed: "share" });
  const map = store.createMap({ name: "Keep map" });
  store.update("maps", map.id, { layout: result.layout, generator: { id: exampleSiteGenerator.id, seed: "share", inputs: {} } });
  startLive(store, map.id, 1);
  const layout = result.layout;
  const other = layout.zones.find((z) => z.id !== layout.start && z.layer !== "duct" && layout.decks.find((d) => d.id === z.deck)?.layer !== "duct");
  if (other) revealZones(store, map.id, [other.id]);
  const scene = store.createScene(act1.id, { title: "At the gate", map: map.id, withReadAloudDoc: true });
  write(scene.bodyDoc, "SECRET-GM-NOTES");
  write(scene.readAloudDoc, "Rain on the old stones.");

  const session = planNextSession(ctx, { title: "Into the keep" });
  write(session.logDoc, "SECRET-SESSION-LOG");
  const revealed = store.createHandout({ title: "The ransom note", visibility: { level: "revealed", revealedIn: session.id } });
  write(revealed.bodyDoc, `Bring the bell to [[${npc.id}|the stranger]] at dawn.`);
  const hidden = store.createHandout({ title: "SECRET-UNREVEALED" });
  write(hidden.bodyDoc, "SECRET-UNREVEALED");
  const agenda = store.createHandout({ title: "SECRET-AGENDA", kind: "agenda", character: pc.id, visibility: { level: "some_players", players: ["m1"] } });
  write(agenda.bodyDoc, "SECRET-AGENDA");
  return { ctx, sessionId: session.id, sceneId: scene.id, revealed: revealed.id };
}

describe("share layout", () => {
  it("reads simple Markdown into blocks", () => {
    expect(markdownBlocks("# Title\n\nSome **bold** text\nwraps.\n\n- one\n- two\n\n> said aloud")).toEqual([
      { kind: "heading", text: "Title" },
      { kind: "para", text: "Some bold text wraps." },
      { kind: "para", text: "one", style: "bullet", marker: "•" },
      { kind: "para", text: "two", style: "bullet", marker: "•" },
      { kind: "para", text: "said aloud", style: "quote" },
    ]);
  });
});

describe("share safety", () => {
  it("keeps GM-only content out of the cards and the PDF packet", async () => {
    const s = await seed();
    const share = await sessionShare(s.ctx, s.sessionId, s.sceneId, "2026-10-22T20:00:00.000Z");
    const json = JSON.stringify(share);
    for (const x of SECRETS) expect(json, x).not.toContain(x);
    // the map came through, fogged, without the generator's spawn and clue markers
    expect(share.maps).toHaveLength(1);
    expect(share.maps[0]!.layout.fogged.length).toBeGreaterThan(0);
    expect(share.maps[0]!.layout.markers.some((m) => m.kind === "spawn" || m.kind === "clue")).toBe(false);

    const sections = shareSections({ share: { ...share, party: share.party }, format: "pdf" });
    const cards = phoneCards(sections, share);
    expect(cards.map((c) => c.section)).toEqual(["briefing", `map:${share.maps[0]!.id}:${share.maps[0]!.decks[0]}`, `handout:${s.revealed}`, "party"]);
    for (const c of cards) {
      expect(c.width).toBe(1080);
      const svg = cardSvg(c);
      for (const x of SECRETS) expect(svg, x).not.toContain(x);
    }
    expect(cards.find((c) => c.kind === "handout")!.text.join(" ")).toContain("Bring the bell to the stranger at dawn.");
    // every card says whose it is and when it was shared
    for (const c of cards) expect(c.text.join(" ")).toMatch(/Share test · Session 1: Into the keep · shared \d+ Oct 2026/);

    for (const paper of ["letter", "a4"] as const) {
      const { pages } = packetPages(sections, share, paper);
      const text = pdfText(svgPagesToPdf(pages));
      expect(text).toContain("The ransom note");
      expect(text).toContain("Rain on the old stones.");
      expect(text).toContain("Aria");
      for (const x of SECRETS) expect(text, x).not.toContain(x);
      expect(pages[0]!.width).toBeCloseTo(paper === "letter" ? 612 : 595.28);
    }
  });

  it("builds the PDF file without a browser canvas", async () => {
    const s = await seed();
    const share = await sessionShare(s.ctx, s.sessionId, s.sceneId, "2026-10-22T20:00:00.000Z");
    const sections = shareSections({ share, format: "pdf" });
    const [file] = await buildShareFiles({ share, sections, images: { ready: new Map(), originals: new Map() }, format: "pdf", paper: "a4" });
    expect(file!.name).toBe("share-test-session-1.pdf");
    expect(file!.type).toBe("application/pdf");
    const text = pdfText(new Uint8Array(await file!.arrayBuffer()));
    expect(text).toContain("The ransom note");
    for (const x of SECRETS) expect(text).not.toContain(x);
  });
});

describe("sending", () => {
  const files = () => [new File(["a"], "01-a.png", { type: "image/png" }), new File(["b"], "02-b.png", { type: "image/png" })];

  it("uses the share sheet when the browser can share files", async () => {
    const share = vi.fn(async () => undefined);
    const target = { canShare: () => true, share };
    expect(canShareFiles(files(), target)).toBe(true);
    expect(await sendFiles(files(), { title: "T", text: "msg", zipName: "x.zip" }, target)).toBe("shared");
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ title: "T", text: "msg", files: expect.any(Array) }));
    // closing the sheet is not a share
    const abort = { canShare: () => true, share: vi.fn(async () => Promise.reject(new DOMException("closed", "AbortError"))) };
    expect(await sendFiles(files(), { title: "T", text: "m", zipName: "x.zip" }, abort)).toBe("cancelled");
  });

  it("falls back to downloading a zip when files cannot be shared", async () => {
    const urls: Blob[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((b) => (urls.push(b as Blob), "blob:x"));
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    expect(canShareFiles(files(), {})).toBe(false);
    expect(await sendFiles(files(), { title: "T", text: "m", zipName: "pack.zip" }, {})).toBe("downloaded");
    expect(click).toHaveBeenCalledTimes(1);
    expect(urls[0]!.type).toBe("application/zip");
    // a single file downloads as it is
    expect(await sendFiles(files().slice(0, 1), { title: "T", text: "m", zipName: "pack.zip" }, { canShare: () => false, share: async () => undefined })).toBe("downloaded");
    expect(urls[1]!.type).toBe("image/png");
  });
});

describe("ShareDialog", () => {
  it("previews the share, downloads the PDF without navigator.share, records it and then offers only what is new", async () => {
    const s = await seed();
    expect("share" in navigator).toBe(false);
    const urls: Blob[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((b) => (urls.push(b as Blob), "blob:x"));
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const onClose = vi.fn();
    const ui = (
      <CampaignContext.Provider value={s.ctx}>
        <ShareDialog open onClose={onClose} sessionId={s.sessionId} sceneId={s.sceneId} />
      </CampaignContext.Provider>
    );
    const view = render(ui);
    // first share: everything, "only what's new" off, party card off by default
    expect(screen.getByTestId<HTMLInputElement>("share-only-new").checked).toBe(false);
    await waitFor(() => expect(screen.getByTestId<HTMLInputElement>("share-include-party").disabled).toBe(false));
    expect(screen.getByTestId<HTMLInputElement>("share-include-party").checked).toBe(false);
    fireEvent.click(screen.getByTestId("share-format-pdf"));
    fireEvent.click(screen.getByTestId("share-include-party"));
    await waitFor(() => expect(screen.getAllByTestId("share-preview-item").length).toBeGreaterThan(1));
    expect(screen.getByTestId("share-preview").getAttribute("data-format")).toBe("pdf");
    expect(screen.getByTestId<HTMLTextAreaElement>("share-message").value).toBe("Share test, Session 1 update: the briefing for “At the gate”, 1 new handout, the map and the party roster.");
    await waitFor(() => expect(screen.getByTestId("share-send").textContent).toBe("Download"));
    await act(async () => fireEvent.click(screen.getByTestId("share-send")));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(urls.at(-1)!.type).toBe("application/pdf");
    expect(onClose).toHaveBeenCalled();
    const shares = s.ctx.store.get("sessions", s.sessionId)!.shares!;
    expect(shares).toHaveLength(1);
    expect(shares[0]).toMatchObject({ handouts: [s.revealed], scene: s.sceneId, party: true, format: "pdf" });
    expect(shareBaseline(s.ctx.store.list("sessions")).count).toBe(1);
    view.unmount();

    // the next share starts with "only what's new" on, and there is nothing new
    render(ui);
    expect(screen.getByTestId<HTMLInputElement>("share-only-new").checked).toBe(true);
    await waitFor(() => expect(screen.getByTestId("share-empty").textContent).toContain("Nothing new since the last share"));
    expect(screen.getByTestId<HTMLButtonElement>("share-send").disabled).toBe(true);
    fireEvent.click(screen.getByTestId("share-only-new"));
    await waitFor(() => expect(screen.queryByTestId("share-empty")).toBeNull());
  });
});

describe("campaign primer", () => {
  it("drafts from player-visible data only, and its PDF holds the section titles but no GM secret", async () => {
    const s = await seed();
    const { ctx } = s;
    createEntity(ctx, { type: "example.place", name: "Ferry landing", fields: { terrain: "hills" } });
    ctx.store.update("entities", ctx.store.list("entities").find((e) => e.name === "Ferry landing")!.id, { visibility: { level: "players" }, summary: "Where the barges tie up." });
    createEntity(ctx, { type: "example.place", name: "SECRET-GM-PLACE", fields: { terrain: "swamp" } });
    const primer = await startPrimer(ctx);
    expect(primer.sections.map((x) => x.id)).toEqual(["welcome", "setting", "lore", "places", "tone", "house-rules", "characters", "opening", "oaths"]);
    const draft = await primerDraft(ctx);
    expect(JSON.stringify(draft)).not.toMatch(/SECRET/);
    // the starter text in "setting" is not drafted over; "places" is new
    expect(await draftConflicts(ctx, draft)).toEqual([]);
    expect(await applyPrimerDraft(ctx, draft)).toEqual(expect.arrayContaining(["welcome", "places", "characters", "opening"]));
    const sections = await primerShareSections(ctx);
    expect(sections.map((x) => x.title)).toEqual(expect.arrayContaining(["Welcome", "The marches", "Places and factions you've heard of", "Tone and content", "Making your character", "Where we begin"]));
    const share = await sessionShare(ctx, s.sessionId, s.sceneId, "2026-10-22T20:00:00.000Z");
    const text = pdfText(svgPagesToPdf(packetPages(sections, { ...share }, "letter").pages));
    for (const title of ["Welcome", "The marches", "Where we begin"]) expect(text).toContain(title);
    expect(text).toContain("Ferry landing");
    expect(text).toContain("Find the lost bell.");
    for (const x of [...SECRETS, "SECRET-GM-PLACE"]) expect(text, x).not.toContain(x);
    // one phone card per section
    expect(phoneCards(sections, share).map((c) => c.section)).toEqual(sections.map((x) => x.id));
  });

  it("is offered in the share dialog and recorded with the share", async () => {
    const s = await seed();
    await startPrimer(s.ctx);
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => "blob:x");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    render(
      <CampaignContext.Provider value={s.ctx}>
        <ShareDialog open onClose={() => undefined} sessionId={s.sessionId} primer={{ defaultOn: true, only: true }} />
      </CampaignContext.Provider>,
    );
    await waitFor(() => expect(screen.getByTestId<HTMLInputElement>("share-include-primer").checked).toBe(true));
    expect(screen.getByTestId<HTMLInputElement>("share-include-handouts").checked).toBe(false);
    fireEvent.click(screen.getByTestId("share-format-pdf"));
    await waitFor(() => expect(screen.getByTestId<HTMLTextAreaElement>("share-message").value).toBe("Share test, Session 1 update: the campaign primer."));
    await waitFor(() => expect(screen.getByTestId("share-send").textContent).toBe("Download"));
    await act(async () => fireEvent.click(screen.getByTestId("share-send")));
    await waitFor(() => expect(s.ctx.store.get("sessions", s.sessionId)!.shares?.[0]).toMatchObject({ primer: true, handouts: [], format: "pdf" }));
  });
});

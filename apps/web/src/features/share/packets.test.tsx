import "fake-indexeddb/auto";
import { LONG_AGENDA_PURPOSE, memberViewer, playerMembers, projectCampaignForViewer, type Id, type PlayerPacket } from "@campaign-forge/core";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { strFromU8, unzipSync } from "fflate";
import { afterEach, describe, expect, it } from "vitest";
import { GiveToPlayer } from "../../components/GiveToPlayer";
import { CampaignContext, openCampaign, type CampaignContextValue } from "../../state/CampaignProvider";
import { loadDemoCampaign } from "../../state/tableActions";
import { sessionPackets } from "./PacketsBody";
import { ShareDialog } from "./ShareDialog";
import { buildShareFiles, packetsZip, type LoadedImages } from "./shareExport";
import { packetPages, packetSections, phoneCards, sharePageHtml } from "./shareLayout";

/** Every string a PDF from the app's writer shows (its text operators), decoded. */
function pdfText(bytes: Uint8Array): string {
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
  while (opened.length) opened.pop()?.();
});

const NO_IMAGES: LoadedImages = { ready: new Map(), originals: new Map() };
const AT = "2026-11-07T19:00:00.000Z";

async function skyfire(): Promise<{ ctx: CampaignContextValue; sessionId: Id; packets: PlayerPacket[] }> {
  const id = await loadDemoCampaign();
  const ctx = await openCampaign(id);
  opened.push(ctx.close);
  const sessionId = ctx.store.list("sessions")[0]!.id;
  return { ctx, sessionId, packets: await sessionPackets(ctx, sessionId, undefined, AT) };
}

/** What each player's packet must hold, and what only another player or the GM has. */
function expectations(ctx: CampaignContextValue, memberId: Id) {
  const maps = ctx.store.toJSON();
  const viewer = memberViewer(maps, memberId);
  const proj = projectCampaignForViewer(maps, ctx.module.module, viewer);
  const mine: string[] = [];
  const notMine: string[] = [];
  for (const e of Object.values(maps.entities)) {
    const rec = e.fields["campaignAgenda"] as { goal?: { text: string }; beat?: { text: string }; secret?: { text: string } } | undefined;
    if (!rec?.goal) continue;
    const own = viewer.characters?.includes(e.id);
    (own ? mine : notMine).push(rec.goal.text, rec.beat!.text, `Agenda: ${e.name}`);
    notMine.push(rec.secret!.text);
    if (typeof e.fields["secret"] === "string" && e.fields["secret"]) notMine.push(e.fields["secret"]);
  }
  for (const m of maps.meta.members) if (m.contact) notMine.push(m.contact);
  // GM-only entities are never linked, and the GM's own agenda cards never go
  const ids = Object.keys(maps.entities).filter((id) => !proj.entities[id]);
  for (const h of Object.values(maps.handouts)) if (h.purpose === LONG_AGENDA_PURPOSE) ids.push(h.id);
  return { mine, notMine, ids };
}

describe("player packets in the web app", () => {
  it("exports one web page per player in a zip: each holds that player's sheet, agenda and shared note, nothing of the others'", async () => {
    const { ctx, packets } = await skyfire();
    expect(packets.map((p) => p.for)).toEqual(["Sam", "Priya", "Mateo", "Jun"]);
    const built = await Promise.all(
      packets.map(async (p) => {
        const sections = packetSections({ share: p, images: NO_IMAGES.ready, format: "page" });
        return { share: p, files: await buildShareFiles({ share: p, sections, images: NO_IMAGES, format: "page", paper: "letter" }) };
      }),
    );
    for (const b of built) expect(b.files.map((f) => f.name)).toEqual([`skyfire-down-session-1-for-${b.share.for.toLowerCase()}.html`]);
    const zip = await packetsZip(built, "packets.zip");
    const files = unzipSync(new Uint8Array(await zip.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual(["jun", "mateo", "priya", "sam"].map((n) => `skyfire-down-session-1-for-${n}.html`));
    for (const p of packets) {
      const html = strFromU8(files[`skyfire-down-session-1-for-${p.for.toLowerCase()}.html`]!);
      const plain = html.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
      expect(plain).toContain(`<title>Skyfire Down for ${p.for}: Session 1: The offer</title>`);
      const { mine, notMine, ids } = expectations(ctx, p.member.id);
      for (const s of mine) expect(plain, `${p.for}: ${s}`).toContain(s);
      for (const s of notMine) expect(plain, `${p.for} must not get: ${s}`).not.toContain(s);
      for (const id of ids) expect(html).not.toContain(id);
      expect(plain.includes("An unsigned note"), p.for).toBe(p.for === "Priya");
      expect(plain).toContain(p.characters[0]!.name);
      expect(plain).toMatch(/Stress/);
    }
  });

  it("writes the same packet as a PDF and phone cards, titled for the player", async () => {
    const { ctx, packets } = await skyfire();
    const sam = packets.find((p) => p.for === "Sam")!;
    const sections = packetSections({ share: sam, images: NO_IMAGES.ready, format: "pdf" });
    const [pdf] = await buildShareFiles({ share: sam, sections, images: NO_IMAGES, format: "pdf", paper: "a4" });
    expect(pdf!.name).toBe("skyfire-down-session-1-for-sam.pdf");
    const text = pdfText(new Uint8Array(await pdf!.arrayBuffer()));
    expect(text).toContain("Skyfire Down for Sam");
    expect(text).toContain("for Sam only");
    const { mine, notMine } = expectations(ctx, sam.member.id);
    const pages = packetPages(sections, sam, "a4").text.flat().join(" ");
    expect(pages).toContain(sam.characters[0]!.name);
    for (const s of notMine) expect(pages).not.toContain(s.slice(0, 30));
    expect(mine.length).toBeGreaterThan(0);
    const cards = phoneCards(packetSections({ share: sam, images: NO_IMAGES.ready, format: "images" }), sam);
    expect(cards[0]!.text.join(" ")).toContain("YOUR CHARACTER");
    expect(cards.every((c) => c.text.some((t) => t.includes("for Sam")))).toBe(true);
  });

  it("previews a player's packet in the dialog from their own projection", async () => {
    const { ctx, sessionId } = await skyfire();
    render(
      <CampaignContext.Provider value={ctx}>
        <ShareDialog open onClose={() => undefined} sessionId={sessionId} packets />
      </CampaignContext.Provider>,
    );
    const dialog = await screen.findByTestId("packets-dialog");
    await waitFor(() => expect(within(dialog).getAllByTestId("packet-player")).toHaveLength(4));
    expect(within(dialog).getAllByTestId("packet-changes")[0]!.textContent).toMatch(/First packet|Preparing/);
    const frame = await within(dialog).findByTestId("share-preview-page", undefined, { timeout: 10_000 });
    const html = frame.getAttribute("srcdoc") ?? "";
    expect(html).toContain("Skyfire Down for Sam");
    const priya = playerMembers(ctx.store.meta()).find((m) => m.name === "Priya")!;
    expect(html).not.toContain("An unsigned note");
    expect(priya).toBeTruthy();
    expect(within(dialog).getByTestId("packet-title").textContent).toBe("Skyfire Down for Sam: Session 1: The offer");
  });
});

describe("Give to <player>", () => {
  it("is a note, not a toggle, on the GM's campaign agenda card, and a toggle on the job's agenda card", async () => {
    const { ctx } = await skyfire();
    const handouts = ctx.store.list("handouts");
    const gmCard = handouts.find((h) => h.purpose === LONG_AGENDA_PURPOSE)!;
    const jobCard = handouts.find((h) => h.kind === "agenda" && h.title.startsWith("Agenda: "))!;
    const view = render(
      <CampaignContext.Provider value={ctx}>
        <GiveToPlayer handout={gmCard} />
        <GiveToPlayer handout={jobCard} />
      </CampaignContext.Provider>,
    );
    expect(view.getByTestId("give-to-player-gm-only").textContent).toBe("Players get their agenda in their packet; this card stays with you.");
    const toggles = view.getAllByTestId("give-to-player");
    expect(toggles).toHaveLength(1);
    expect(toggles[0]!.getAttribute("aria-label")).toBe(`Give ${jobCard.title} to ${playerMembers(ctx.store.meta()).find((m) => m.id === ctx.store.get("entities", jobCard.character!)!.ownerMemberId)!.name}`);
  });
});

describe("sharePageHtml", () => {
  it("escapes text and stands alone", () => {
    const html = sharePageHtml(
      [{ id: "h", kind: "handout", eyebrow: "Handout", title: "<script>x</script>", blocks: [{ kind: "para", text: "a & b < c" }], file: "h" }],
      { campaign: "C", session: { id: "s", number: 1, label: "Session 1" }, at: AT, for: "Sam" },
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("a &amp; b &lt; c");
    expect(html).not.toMatch(/<(script|link|iframe)\b/);
    expect(html).not.toMatch(/https?:\/\//);
  });
});

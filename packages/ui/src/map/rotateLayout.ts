/**
 * Turn a site layout's geometry by a multiple of 90°, keeping every id and
 * all data. Prints that turn a deck to fit the roll draw the turned layout,
 * so labels are placed and drawn upright on the page instead of the finished
 * drawing being rotated (which would leave every label running sideways).
 */
import type { MapPoint, SiteLayout } from "@campaign-forge/module-sdk";

export type QuarterTurn = 0 | 90 | 180 | 270;

/**
 * Rotate each deck clockwise by `degrees` about its own frame:
 * 90 maps (x, y) on a w × h deck to (h - y, x) on an h × w deck, so the
 * screen map's top edge ends up on the right.
 */
export function rotateLayout(layout: SiteLayout, degrees: QuarterTurn): SiteLayout {
  const turn = (((degrees % 360) + 360) % 360) as QuarterTurn;
  if (turn === 0) return layout;
  const size = new Map(layout.decks.map((d) => [d.id, { w: d.width, h: d.height }]));
  const fallback = { w: layout.decks[0]?.width ?? 0, h: layout.decks[0]?.height ?? 0 };
  const pt = (deck: string | undefined, [x, y]: MapPoint): MapPoint => {
    const { w, h } = (deck !== undefined ? size.get(deck) : undefined) ?? fallback;
    if (turn === 90) return [h - y, x];
    if (turn === 180) return [w - x, h - y];
    return [y, w - x];
  };
  const deckOfZone = new Map(layout.zones.map((z) => [z.id, z.deck]));
  return {
    ...layout,
    decks: layout.decks.map((d) => (turn === 180 ? { ...d } : { ...d, width: d.height, height: d.width })),
    zones: layout.zones.map((z) => ({ ...z, poly: z.poly.map((p) => pt(z.deck, p)) })),
    borders: layout.borders.map((b) => {
      if (!b.segment) return { ...b };
      const deck = deckOfZone.get(b.a) ?? deckOfZone.get(b.b);
      return { ...b, segment: [pt(deck, b.segment[0]), pt(deck, b.segment[1])] as [MapPoint, MapPoint] };
    }),
  };
}

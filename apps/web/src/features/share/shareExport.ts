/**
 * Turning a share into files on this device, and handing them over: phone
 * card PNGs (SVG drawn to a canvas), handout images as they were uploaded,
 * or the PDF packet (the app's own PDF writer); then the Web Share API with
 * files where the browser has it (phones and tablets open the share sheet:
 * Messages, Messenger, WhatsApp), else a download (a zip when there are
 * several files). Nothing leaves the device except through that share sheet
 * or download.
 */
import type { AssetStore, PlayerShare } from "@campaign-forge/core";
import { svgPagesToPdf } from "@campaign-forge/ui";
import { zipSync } from "fflate";
import { downloadFile, slug } from "../../lib/download";
import type { Paper } from "../../lib/paper";
import { cardSvg, packetPages, phoneCards, type PhoneCard, type ReadyImage, type ShareLayoutInput, type ShareSection } from "./shareLayout";

/** Longest side of an image embedded in a card or the packet. */
const MAX_IMAGE_SIDE = 1600;

export interface LoadedImages {
  /** Asset id -> JPEG data URL and size, for cards and the packet. */
  ready: Map<string, ReadyImage>;
  /** Asset id -> the stored file, for sharing a handout image as it is. */
  originals: Map<string, Blob>;
}

async function decode(blob: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close?: () => void } | undefined> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(blob);
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      // fall back to an <img>
    }
  }
  if (typeof Image === "undefined") return undefined;
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("image"));
      img.src = url;
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight };
  } catch {
    return undefined;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** An image as a JPEG data URL on white (transparent areas print white), at most MAX_IMAGE_SIDE on its long side. */
async function toJpeg(blob: Blob): Promise<ReadyImage | undefined> {
  const img = await decode(blob);
  if (!img || !img.width || !img.height) return undefined;
  try {
    const k = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * k));
    const height = Math.max(1, Math.round(img.height * k));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const c = canvas.getContext("2d");
    if (!c) return undefined;
    c.fillStyle = "#ffffff";
    c.fillRect(0, 0, width, height);
    c.drawImage(img.source, 0, 0, width, height);
    const href = canvas.toDataURL("image/jpeg", 0.88);
    return href.startsWith("data:image/jpeg") ? { href, width, height } : undefined;
  } finally {
    img.close?.();
  }
}

/** Load every image the share uses (handout images, portraits). Images that fail to load are left out. */
export async function loadShareImages(assets: Pick<AssetStore, "get">, share: PlayerShare): Promise<LoadedImages> {
  const ids = new Set<string>();
  for (const h of share.handouts) if (h.image) ids.add(h.image.asset);
  for (const m of share.party) if (m.portrait) ids.add(m.portrait.asset);
  const ready = new Map<string, ReadyImage>();
  const originals = new Map<string, Blob>();
  await Promise.all(
    [...ids].map(async (id) => {
      const blob = await assets.get(id).catch(() => undefined);
      if (!blob) return;
      originals.set(id, blob);
      const jpeg = await toJpeg(blob).catch(() => undefined);
      if (jpeg) ready.set(id, jpeg);
    }),
  );
  return { ready, originals };
}

/** Draw an SVG document to a PNG. Browser only. */
export async function svgToPng(svg: string, width: number, height: number): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("The card could not be drawn to an image."));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const c = canvas.getContext("2d");
    if (!c) throw new Error("No canvas available.");
    c.fillStyle = "#ffffff";
    c.fillRect(0, 0, width, height);
    c.drawImage(img, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encoding failed."))), "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg", "image/avif": "avif" };

export interface ShareFilesInput {
  share: PlayerShare;
  sections: ShareSection[];
  images: LoadedImages;
  format: "images" | "pdf";
  paper: Paper;
  passable?: ShareLayoutInput["passable"];
}

/** The files of a share: card PNGs plus handout images as uploaded, or one PDF. */
export async function buildShareFiles(input: ShareFilesInput): Promise<File[]> {
  const { share, sections } = input;
  const opts = input.passable ? { passable: input.passable } : {};
  if (input.format === "pdf") {
    const { pages } = packetPages(sections, share, input.paper, opts);
    const bytes = svgPagesToPdf(pages, { title: `${share.campaign}: ${share.session.label}`, subject: "Player packet", creator: "Campaign Forge" });
    return [new File([bytes as BlobPart], `${slug(share.campaign)}-session-${share.session.number}.pdf`, { type: "application/pdf" })];
  }
  const cards = phoneCards(sections, share, opts);
  const files: File[] = [];
  // numbered in reading order, so a chat or a folder lists them as the packet reads
  const numbered = (stem: string) => `${String(files.length + 1).padStart(2, "0")}-${stem}`;
  for (const section of sections) {
    for (const card of cards.filter((c) => c.section === section.id)) {
      files.push(new File([await svgToPng(cardSvg(card), card.width, card.height)], numbered(card.name.replace(/^\d+-/, "")), { type: "image/png" }));
    }
    // a handout's own image goes along as it was uploaded, right after its card
    const blob = section.original ? input.images.originals.get(section.original.asset) : undefined;
    if (section.original && blob) {
      const type = blob.type || section.original.mime;
      files.push(new File([blob], numbered(`${section.file}.${EXT[type] ?? "img"}`), { type }));
    }
  }
  return files;
}

/** Several files as one zip (stored, not compressed: PNG, JPEG and PDF are compressed already). */
export async function zipFiles(files: File[], name: string): Promise<File> {
  const entries: Record<string, [Uint8Array, { level: 0 }]> = {};
  for (const f of files) entries[f.name] = [new Uint8Array(await f.arrayBuffer()), { level: 0 }];
  return new File([zipSync(entries) as BlobPart], name, { type: "application/zip" });
}

/** What the browser can do with files. */
export interface ShareTarget {
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void>;
}

/** True when the browser can hand these files to the system share sheet. */
export function canShareFiles(files: File[], target: ShareTarget | undefined = typeof navigator !== "undefined" ? navigator : undefined): boolean {
  if (!target?.share || !target.canShare) return false;
  try {
    return target.canShare({ files });
  } catch {
    return false;
  }
}

export type SendResult = "shared" | "downloaded" | "cancelled";

/**
 * Hand the files over: the share sheet when the browser can share files
 * (phones, tablets, some desktops), else downloads: one file as it is,
 * several as a zip.
 */
export async function sendFiles(files: File[], meta: { title: string; text: string; zipName: string }, target: ShareTarget | undefined = typeof navigator !== "undefined" ? navigator : undefined): Promise<SendResult> {
  if (files.length === 0) return "cancelled";
  if (canShareFiles(files, target)) {
    try {
      await target!.share!({ files, title: meta.title, text: meta.text });
      return "shared";
    } catch (e) {
      // the person closed the share sheet
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
      // NotAllowedError (no user activation left after a slow build) and others: download instead
    }
  }
  downloadSome(files.length === 1 ? files[0]! : await zipFiles(files, meta.zipName));
  return "downloaded";
}

function downloadSome(file: File): void {
  downloadFile(file, file.name, file.type);
}

/** Preview: the cards as SVG data URLs (cheap; no rasterising). */
export function cardPreviewUrl(card: PhoneCard): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(cardSvg(card))}`;
}

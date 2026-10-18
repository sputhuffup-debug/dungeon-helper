import type { ModuleManifest } from "@campaign-forge/module-sdk";
import { CAMPAIGN, modes } from "./modes";

export const ALIEN_MODULE_ID = "alien";
export const ALIEN_MODULE_VERSION = "0.1.0";

export const manifest: ModuleManifest = {
  id: ALIEN_MODULE_ID,
  version: ALIEN_MODULE_VERSION,
  name: "Alien RPG (Evolved Edition)",
  ruleset: "Year Zero Engine",
  edition: "Evolved Edition (2025)",
  publisher: "Free League Publishing",
  licenseNotice:
    "ALIEN is the property of 20th Century Studios and is licensed to Free League Publishing for the tabletop roleplaying game. " +
    "This module contains only structure (schemas, dice ranges, procedure graphs, page references) and short paraphrased reference data " +
    "intended for owners of the Alien RPG Evolved Edition core rulebook. It reproduces no rulebook prose or art. " +
    "Campaign Forge is a fan-made tool and is not affiliated with, endorsed by or sponsored by Free League Publishing or 20th Century Studios.",
  requiredCore: "0.1.0",
  modes,
  defaultMode: CAMPAIGN,
  dataStatus: "verified",
  sourceBook: {
    title: "Alien: The Roleplaying Game, Core Rules, Evolved Edition",
    year: 2025,
    pageNote: "Page references are the printed folios; in the PDF each page sits four pages later (printed p. 44 is PDF page 48).",
  },
};

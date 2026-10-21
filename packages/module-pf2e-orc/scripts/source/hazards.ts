/** GM Core hazards (traps, environmental and haunts) as presets of the hazard entity type. */
import type { EntityPreset } from "@campaign-forge/module-sdk";
import { cite, HAZARD, preset } from "../ids.ts";
import { actionCost, frequencyText, line, md, traitText, traitsLine, usable, type Ctx } from "./common.ts";
import { num, obj, objs, str, strs, type Entry } from "./read.ts";

const words = (s: string) => s.replace(/-/g, " ");

function iwr(list: unknown, withValue: boolean): string[] {
  return objs(list).map((x) => `${words(str(x.type))}${withValue && x.value !== undefined ? ` ${num(x.value)}` : ""}`);
}

export function convertHazards(entries: Entry[], ctx: Ctx): EntityPreset[] {
  return entries
    .filter((e) => usable(ctx, e))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => {
      const s = e.system;
      const attrs = obj(s.attributes);
      const details = obj(s.details);
      const level = num(obj(details.level).value, 0);
      const complex = details.isComplex === true;
      const stealth = obj(attrs.stealth);
      const hp = obj(attrs.hp);
      const saves = obj(s.saves);
      const actions = e.items
        .filter((i) => i.type === "action")
        .map((i) => {
          const sys = obj(i.system);
          const cost = actionCost(sys);
          const traits = traitsLine(sys);
          const text = md(ctx, obj(sys.description).value);
          const frequency = /\*\*Frequency\*\*/.test(text) ? "" : frequencyText(sys.frequency);
          return {
            name: `${line(ctx, i.name)}${cost ? ` ${cost}` : ""}`,
            desc: [traits ? `(${traits})` : "", frequency ? `**Frequency** ${frequency}` : "", text].filter(Boolean).join(" "),
          };
        })
        .filter((a) => a.name.trim());
      const slug = e.file.split("/").pop()!.replace(/\.json$/, "");
      const fields: Record<string, unknown> = {
        level,
        complexity: complex ? "complex" : "simple",
        rarity: str(obj(s.traits).rarity) || "common",
        traits: strs(obj(s.traits).value).map(traitText),
        stealth: num(stealth.value, 0),
        ...(line(ctx, stealth.details) ? { stealthNote: line(ctx, stealth.details) } : {}),
        description: md(ctx, details.description),
        disable: md(ctx, details.disable),
        ac: num(obj(attrs.ac).value, 0),
        saves: { fortitude: num(obj(saves.fortitude).value), reflex: num(obj(saves.reflex).value), will: num(obj(saves.will).value) },
        hardness: num(attrs.hardness, 0),
        hp: { max: num(hp.max, 0), current: num(hp.max, 0), temp: 0 },
        ...(line(ctx, hp.details) ? { hpNote: line(ctx, hp.details) } : {}),
        immunities: iwr(attrs.immunities, false),
        weaknesses: iwr(attrs.weaknesses, true),
        resistances: iwr(attrs.resistances, true),
        actions,
        ...(md(ctx, details.routine) ? { routine: md(ctx, details.routine) } : {}),
        ...(md(ctx, details.reset) ? { reset: md(ctx, details.reset) } : {}),
      };
      return {
        id: preset(`hazard.${slug}`),
        entityType: HAZARD,
        name: e.name,
        summary: `${complex ? "Complex" : "Simple"} hazard ${level}. ${(fields.traits as string[]).join(", ")}. Stealth DC ${10 + num(stealth.value, 0)}.`,
        cite: cite(e.book, "Hazards", e.name),
        tags: ["hazard", complex ? "complex" : "simple"],
        fields,
      };
    });
}

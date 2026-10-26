/** Rules reference: searchable rule cards filtered by mode and tag; a card opens with links to tables and fields. */
import { supplementOf, type RuleCard } from "@campaign-forge/module-sdk";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { resolveLinkName, TableDialog } from "../../components/RulePanel";
import { Dialog, Drawer, RuleCardList, RuleCardView } from "../../components/ui";
import { useCampaign, useMeta } from "../../state/hooks";
import { ModuleAttribution } from "../modules/ModuleLicense";

export function RulesPage() {
  const ctx = useCampaign();
  const meta = useMeta();
  const search = useSearch({ from: "/c/$campaignId/rules" });
  const navigate = useNavigate({ from: "/c/$campaignId/rules" });
  const [tag, setTag] = useState("");
  const [tableId, setTableId] = useState<string | undefined>();
  const [field, setField] = useState<string | undefined>();
  const rules = ctx.module.module.rules;
  const tags = useMemo(() => [...new Set(rules.flatMap((r) => r.tags ?? []))].sort(), [rules]);
  const cards = useMemo(() => (tag ? rules.filter((r) => r.tags?.includes(tag)) : rules), [rules, tag]);
  const open = search.rule ? ctx.module.rule(search.rule) : undefined;
  const openRule = (id: string | undefined) => void navigate({ search: id ? { rule: id } : {} });

  return (
    <div className="app-page">
      <header className="app-page__header">
        <h1 className="app-title">Rules</h1>
        <div className="app-row">
          <select className="cf-select" aria-label="Filter by tag" value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">All tags</option>
            {tags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <Link to="/c/$campaignId/reference" params={{ campaignId: ctx.campaignId }} className="cf-btn">
            Reference data
          </Link>
          <Link to="/c/$campaignId/gm-screen" params={{ campaignId: ctx.campaignId }} className="cf-btn" data-testid="open-gm-screen">
            GM screen
          </Link>
        </div>
      </header>
      <p className="cf-muted">
        {ctx.module.manifest.citationStyle === "section"
          ? `Rule cards from ${ctx.module.manifest.sourceBook?.title ?? "the source"}, cited by section; cards marked Original are the module's own advice.`
          : `Short paraphrases with page references to ${ctx.module.manifest.sourceBook?.title ?? "the rulebook"}.`}{" "}
        {ctx.module.manifest.sourceBook?.pageNote ?? ""}
      </p>
      <RuleCardList cards={cards} modes={ctx.module.manifest.modes} mode={meta.mode} onOpen={(c: RuleCard) => openRule(c.id)} sourceOf={(id) => supplementOf(ctx.module.manifest, id)?.name} />
      <Drawer open={!!open} onClose={() => openRule(undefined)} title={open?.title ?? "Rule"}>
        {open && (
          <RuleCardView
            card={open}
            onOpenRule={(id) => openRule(id)}
            onOpenTable={setTableId}
            onOpenField={setField}
            resolveName={(kind, id) => resolveLinkName(ctx.module, kind, id)}
            sourceOf={(id) => supplementOf(ctx.module.manifest, id)?.name}
          />
        )}
      </Drawer>
      <ModuleAttribution license={ctx.module.manifest.license} />
      <TableDialog tableId={tableId} onClose={() => setTableId(undefined)} />
      <Dialog open={!!field} onClose={() => setField(undefined)} title="Sheet field">
        {field && <FieldInfo fieldRef={field} />}
      </Dialog>
    </div>
  );
}

function FieldInfo({ fieldRef }: { fieldRef: string }) {
  const ctx = useCampaign();
  const name = resolveLinkName(ctx.module, "field", fieldRef);
  const types = [...ctx.module.module.entityTypes].sort((a, b) => b.id.length - a.id.length);
  const def = types.find((t) => fieldRef.startsWith(`${t.id}.`));
  return (
    <div className="app-stack">
      <p>
        <strong>{name}</strong>
      </p>
      <p className="cf-muted">
        This rule applies to the field <code>{def ? fieldRef.slice(def.id.length + 1) : fieldRef}</code>
        {def ? ` on every ${def.name.toLowerCase()} sheet` : ""}. The “?” next to the field on a sheet opens this rule.
      </p>
      {def && (
        <Link to="/c/$campaignId/atlas" params={{ campaignId: ctx.campaignId }} className="cf-btn">
          Browse {def.plural.toLowerCase()}
        </Link>
      )}
    </div>
  );
}

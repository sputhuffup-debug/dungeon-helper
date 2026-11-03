/**
 * Funds: balances (summed from entries, never stored; a personal account
 * reads its holder's money field, e.g. a PC's sheet cash, when the module
 * names one), the ledger with a running balance, a category filter, adding
 * entries and CSV export.
 */
import { ledgerBalance, ledgerBalances, ledgerRows, type Entity, type Id } from "@campaign-forge/core";
import type { LedgerCategoryDef, LedgerDef } from "@campaign-forge/module-sdk";
import { useMemo, useState, type FormEvent } from "react";
import { AutoGrowText, Badge, Button, Card, IconButton, PageRef, pushToast } from "../../components/ui";
import { useCampaign, useList, useMeta } from "../../state/hooks";
import { addLedgerEntry, deleteLedgerEntry, exportLedgerCsv, money, personalAccount } from "../../state/shipActions";

/** The entities that hold a personal account: the module's account types, player characters only. */
function useAccountHolders(def: LedgerDef): Entity[] {
  const types = def.accountEntityTypes ?? [];
  return useList("entities").filter((e) => types.includes(e.type) && (e.fields.isPC === true || !!e.ownerMemberId));
}

function categoryLabel(def: LedgerDef, id: string): string {
  return def.categories.find((c) => c.id === id)?.label ?? id;
}

export function FundsSummary({ def }: { def: LedgerDef }) {
  const ctx = useCampaign();
  const entries = useList("ledger");
  const balance = useMemo(() => ledgerBalance(ctx.store, { account: null }), [ctx.store, entries]);
  const holders = useAccountHolders(def);
  // every holder (its sheet's money when the module names the field), then any other account with entries
  const personal = useMemo(() => {
    const out: Array<[Id, number]> = def.accountField ? holders.map((h) => [h.id, personalAccount(ctx, h.id).balance]) : [];
    for (const [k, v] of Object.entries(ledgerBalances(ctx.store))) if (k !== "" && !out.some(([id]) => id === k)) out.push([k, def.accountField ? personalAccount(ctx, k).balance : v]);
    return out;
  }, [ctx, entries, holders, def.accountField]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="ship-funds" data-testid="funds">
      <div className="ship-funds__main">
        <span className="app-stat__label">{def.defaultAccount}</span>
        <span className={`ship-funds__balance${balance < 0 ? " is-negative" : ""}`} data-testid="funds-balance">
          {money(ctx, balance)}
        </span>
      </div>
      {personal.length > 0 && (
        <ul className="ship-funds__accounts" aria-label="Personal accounts">
          {personal.map(([id, amount]) => (
            <li key={id} className="app-stat" data-account={id}>
              <span className="app-stat__label">{ctx.store.get("entities", id)?.name ?? id}</span>
              <span className="app-stat__value" data-testid="account-balance">
                {money(ctx, amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function LedgerCard({ def, shipId }: { def: LedgerDef; shipId?: Id }) {
  const ctx = useCampaign();
  const entries = useList("ledger");
  const [category, setCategory] = useState<string>("");
  const [account, setAccount] = useState<string>("");
  const filter = useMemo(() => ({ ...(category ? { categories: [category] } : {}), ...(account === "" ? {} : { account: account === "shared" ? null : account }) }), [category, account]);
  const holders = useAccountHolders(def);
  const personalId = account !== "" && account !== "shared" ? account : undefined;
  // one personal account: its running balance starts from what it held before its entries (the sheet's starting cash)
  const holder = useList("entities").find((e) => e.id === personalId);
  const opening = useMemo(() => (personalId && def.accountField && !category ? personalAccount(ctx, personalId).opening : 0), [ctx, personalId, def.accountField, category, entries, holder]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => ledgerRows(ctx.store, filter, ctx.module.module.calendar, opening), [ctx.store, ctx.module, filter, entries, opening]);
  const usedCategories = useMemo(() => new Set(entries.map((e) => e.category)), [entries]);

  return (
    <Card
      title="Ledger"
      subtitle="Money in and out. Balances are summed from these entries."
      data-testid="ledger"
      actions={
        <Button size="sm" onClick={() => exportLedgerCsv(ctx)} data-testid="ledger-csv">
          Export CSV
        </Button>
      }
    >
      <div className="app-stack">
        <div className="app-filters">
          <label className="app-label">
            <span>Category</span>
            <select className="cf-select" aria-label="Filter by category" value={category} onChange={(e) => setCategory(e.target.value)} data-testid="ledger-filter">
              <option value="">All categories</option>
              {def.categories
                .filter((c) => usedCategories.has(c.id) || c.id === category)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
            </select>
          </label>
          {holders.length > 0 && (
            <label className="app-label">
              <span>Account</span>
              <select className="cf-select" aria-label="Filter by account" value={account} onChange={(e) => setAccount(e.target.value)}>
                <option value="">All accounts</option>
                <option value="shared">{def.defaultAccount}</option>
                {holders.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="app-scroll-x">
          <table className="cf-table ship-ledger" data-testid="ledger-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Note</th>
                <th className="ship-num">Amount</th>
                <th className="ship-num">Balance</th>
                <th>
                  <span className="cf-sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {opening !== 0 && (
                <tr data-testid="ledger-opening">
                  <td className="cf-mono ship-nowrap">–</td>
                  <td className="ship-nowrap">On the sheet</td>
                  <td className="cf-muted">{rows.length ? "Before these entries" : "Not on the books yet"}</td>
                  <td className="ship-num cf-mono" />
                  <td className={`ship-num cf-mono${opening < 0 ? " is-negative" : ""}`}>{money(ctx, opening)}</td>
                  <td />
                </tr>
              )}
              {rows.length === 0 && opening === 0 && (
                <tr>
                  <td colSpan={6} className="cf-muted">
                    No entries{category ? " in this category" : ""} yet.
                  </td>
                </tr>
              )}
              {rows.map(({ entry, balance }) => (
                <tr key={entry.id} data-testid="ledger-row" data-category={entry.category}>
                  <td className="cf-mono ship-nowrap">{entry.inWorldDate ?? entry.realDate}</td>
                  <td className="ship-nowrap">
                    {categoryLabel(def, entry.category)}
                    {entry.account && <span className="cf-muted"> · {ctx.store.get("entities", entry.account)?.name ?? "personal"}</span>}
                  </td>
                  <td>{entry.note}</td>
                  <td className={`ship-num cf-mono${entry.amount < 0 ? " is-negative" : ""}`}>{money(ctx, entry.amount, { sign: true })}</td>
                  <td className={`ship-num cf-mono${balance < 0 ? " is-negative" : ""}`}>{money(ctx, balance)}</td>
                  <td>
                    <IconButton
                      size="sm"
                      variant="ghost"
                      label={`Delete entry: ${entry.note ?? categoryLabel(def, entry.category)}`}
                      icon="×"
                      onClick={() => {
                        deleteLedgerEntry(ctx, entry.id);
                        pushToast("Entry deleted.");
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {personalId && def.accountField ? (
          <p className="cf-muted">The balance column runs from what the sheet held before these entries; an entry on this account changes the sheet too.</p>
        ) : (
          (category || account) && <p className="cf-muted">The balance column runs over the entries shown.</p>
        )}
        <AddEntryForm def={def} holders={holders.map((h) => ({ id: h.id, name: h.name }))} {...(shipId ? { shipId } : {})} />
      </div>
    </Card>
  );
}

function signFor(cat: LedgerCategoryDef | undefined): 1 | -1 {
  return cat?.direction === "out" ? -1 : 1;
}

function AddEntryForm({ def, holders, shipId }: { def: LedgerDef; holders: Array<{ id: Id; name: string }>; shipId?: Id }) {
  const ctx = useCampaign();
  const meta = useMeta();
  const [category, setCategory] = useState(def.categories.find((c) => c.id === "other")?.id ?? def.categories[0]?.id ?? "other");
  const cat = def.categories.find((c) => c.id === category);
  const [direction, setDirection] = useState<1 | -1>(signFor(cat));
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState("");
  const [account, setAccount] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = Number(amount.replace(/[,\s$]/g, ""));
    if (!Number.isFinite(n) || n === 0) {
      pushToast("Enter an amount.", { tone: "warning" });
      return;
    }
    addLedgerEntry(ctx, {
      amount: Math.abs(n) * direction,
      category,
      note,
      ...(date.trim() || meta.currentDate ? { inWorldDate: date.trim() || meta.currentDate } : {}),
      ...(account ? { account } : {}),
      ...(shipId && !account ? { links: { ship: shipId } } : {}),
    });
    setAmount("");
    setNote("");
    pushToast("Entry added.", { tone: "success" });
  };

  return (
    <form className="ship-entry" onSubmit={submit} data-testid="ledger-add" aria-label="Add a ledger entry">
      <label className="app-label">
        <span>Category</span>
        <select
          className="cf-select"
          aria-label="Entry category"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setDirection(signFor(def.categories.find((c) => c.id === e.target.value)));
          }}
        >
          {def.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label className="app-label">
        <span>In or out</span>
        <select className="cf-select" aria-label="Money in or out" value={direction} onChange={(e) => setDirection(Number(e.target.value) === -1 ? -1 : 1)}>
          <option value={1}>Money in</option>
          <option value={-1}>Money out</option>
        </select>
      </label>
      <label className="app-label">
        <span>Amount ({def.currency.symbol || def.currency.name})</span>
        <input className="cf-input cf-mono" aria-label="Amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <label className="app-label ship-entry__note">
        <span>Note</span>
        <AutoGrowText aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <label className="app-label">
        <span>In-world date</span>
        <input className="cf-input cf-mono" aria-label="In-world date" placeholder={meta.currentDate ?? ""} value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      {holders.length > 0 && (
        <label className="app-label">
          <span>Account</span>
          <select className="cf-select" aria-label="Account" value={account} onChange={(e) => setAccount(e.target.value)}>
            <option value="">{def.defaultAccount}</option>
            {holders.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="ship-entry__submit">
        <Button type="submit" variant="primary" data-testid="ledger-add-submit">
          Add entry
        </Button>
      </div>
      {cat && (
        <p className="cf-muted ship-entry__hint">
          {cat.description} {cat.page !== undefined ? <PageRef page={cat.page} /> : <Badge>GM bookkeeping</Badge>}
        </p>
      )}
    </form>
  );
}

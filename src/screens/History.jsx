import React, { useMemo, useState } from "react";
import { useAllData } from "../db/hooks.js";
import { useEntryActions } from "../app/useEntryActions.js";
import { EntryCard } from "../components/EntryCard.jsx";
import { EmptyState } from "../components/ui/Primitives.jsx";
import { whoKey } from "../lib/identity.js";
import { ME } from "../lib/identity.js";
import { whoName } from "../lib/names.js";

/* History (§7.5): every entry across every group, filterable by group, by
   passenger, and by date range. */
export function History() {
  const data = useAllData();
  const entryActions = useEntryActions();

  const [groupFilter, setGroupFilter] = useState("all");
  const [personFilter, setPersonFilter] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.entries
      .filter((e) => {
        if (groupFilter !== "all" && e.groupId !== groupFilter) return false;
        if (personFilter !== "all") {
          const has = (e.passengers || []).some((p) => whoKey(p.who) === personFilter);
          if (!has) return false;
        }
        if (from && new Date(e.date) < new Date(from)) return false;
        if (to && new Date(e.date) > new Date(to)) return false;
        return true;
      })
      .sort((a, b) => {
        const d = new Date(b.date) - new Date(a.date);
        return d !== 0 ? d : new Date(b.createdAt) - new Date(a.createdAt);
      });
  }, [data, groupFilter, personFilter, from, to]);

  if (!data) return <div className="app-shell" />;

  const { entries, payments, peopleMap, activeGroups, people, nonOwnedGroups } = data;

  // Passenger filter options: "me" (if any non-owned group exists) + all people.
  const personOptions = [];
  if (nonOwnedGroups.length > 0) personOptions.push({ key: whoKey(ME), label: "Me" });
  for (const p of people) personOptions.push({ key: whoKey({ type: "person", personId: p.id }), label: p.name });

  const hasFilters =
    groupFilter !== "all" || personFilter !== "all" || from || to;

  return (
    <div className="app-shell stagger">
      <header className="screen-head">
        <div>
          <p className="screen-head__kicker">Every fill-up</p>
          <h1 className="screen-head__title">History</h1>
        </div>
      </header>

      {/* Filters */}
      <div className="detail-panel section-block">
        <div className="filter-grid">
          <label className="filter-field">
            <span>Group</span>
            <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
              <option value="all">All groups</option>
              {activeGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-field">
            <span>Passenger</span>
            <select value={personFilter} onChange={(e) => setPersonFilter(e.target.value)}>
              <option value="all">Anyone</option>
              {personOptions.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-field">
            <span>From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="filter-field">
            <span>To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
        {hasFilters && (
          <button
            className="link-btn"
            type="button"
            style={{ marginTop: "0.6rem" }}
            onClick={() => {
              setGroupFilter("all");
              setPersonFilter("all");
              setFrom("");
              setTo("");
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Results */}
      {entries.length === 0 ? (
        <EmptyState emoji="⛽" title="No fill-ups yet">
          Tap the + button to log your first fuel entry.
        </EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState emoji="🔍" title="Nothing matches">
          No fill-ups match these filters. Try widening the date range or clearing
          filters.
        </EmptyState>
      ) : (
        <section className="section-block">
          <p className="muted" style={{ fontSize: "0.76rem", marginBottom: "0.6rem" }}>
            {filtered.length} fill-up{filtered.length === 1 ? "" : "s"}
          </p>
          {filtered.map((e) => (
            <EntryCard
              key={e.id}
              entry={e}
              payments={payments}
              peopleMap={peopleMap}
              onRecordPayment={entryActions.onRecordPayment}
              onEditPayment={entryActions.onEditPayment}
              onDeletePayment={entryActions.onDeletePayment}
              onEdit={entryActions.onEditEntry}
              onDelete={entryActions.onDeleteEntry}
            />
          ))}
        </section>
      )}
    </div>
  );
}

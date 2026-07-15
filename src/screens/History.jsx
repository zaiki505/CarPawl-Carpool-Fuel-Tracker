import React, { useMemo, useState } from "react";
import { useAllData } from "../db/hooks.js";
import { useEntryActions } from "../app/useEntryActions.js";
import { EntryCard } from "../components/EntryCard.jsx";
import { UpcomingReveal } from "../components/UpcomingReveal.jsx";
import { EmptyState, Segment } from "../components/ui/Primitives.jsx";
import { ScreenLoading } from "../components/ui/ScreenLoading.jsx";
import { Select } from "../components/ui/Select.jsx";
import { DatePicker } from "../components/ui/DatePicker.jsx";
import { entryShares, paymentsFor } from "../lib/calc.js";
import { formatMoney, parseISODate, isFutureDate } from "../lib/format.js";
import { whoKey, ME, person as mkPerson } from "../lib/identity.js";
import { personName } from "../lib/names.js";
import { ChevronDown } from "../components/ui/Icons.jsx";

/* History (7.5) - every fill-up, filterable by ownership (All / My Vehicles /
   Carpools), specific vehicle, passenger (multi-select), and
   date. Selecting passengers hides everyone else inside each fill-up and shows
   their combined totals. */
export function History() {
  const data = useAllData();
  const entryActions = useEntryActions();

  const [ownership, setOwnership] = useState("all"); // all | owned | carpool
  const [groupFilter, setGroupFilter] = useState("all");
  const [whoFilter, setWhoFilter] = useState([]); // array of whoKeys
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const whoSet = useMemo(() => new Set(whoFilter), [whoFilter]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const ownedMap = data.groupOwnedMap;
    return data.entries
      .filter((e) => {
        const owned = ownedMap.get(e.groupId);
        if (ownership === "owned" && !owned) return false;
        if (ownership === "carpool" && owned) return false;
        if (groupFilter !== "all" && e.groupId !== groupFilter) return false;
        if (whoSet.size > 0) {
          const has = (e.passengers || []).some((p) => whoSet.has(whoKey(p.who)));
          if (!has) return false;
        }
        if (from && (parseISODate(e.date) || 0) < (parseISODate(from) || 0)) return false;
        if (to && (parseISODate(e.date) || 0) > (parseISODate(to) || 0)) return false;
        return true;
      })
      .sort((a, b) => {
        const d = (parseISODate(b.date) || 0) - (parseISODate(a.date) || 0);
        return d !== 0 ? d : new Date(b.createdAt) - new Date(a.createdAt);
      });
  }, [data, ownership, groupFilter, whoSet, from, to]);

  // Combined totals for the selected passengers across the filtered fill-ups.
  const summary = useMemo(() => {
    if (!data || whoFilter.length === 0) return null;
    let shareTot = 0;
    let paidTot = 0;
    for (const e of filtered) {
      if (isFutureDate(e.date)) continue; // upcoming refuels aren't counted in totals
      const shares = entryShares(e); // once per entry, parallel to passengers
      (e.passengers || []).forEach((p, i) => {
        if (!whoSet.has(whoKey(p.who))) return;
        shareTot += shares[i] || 0;
        paidTot += paymentsFor(e, p.who, data.payments);
      });
    }
    return { shareTot, paidTot, outstanding: shareTot - paidTot };
  }, [data, filtered, whoSet, whoFilter]);

  if (!data) return <ScreenLoading />;

  const { payments, peopleMap, people, nonOwnedGroups, groupMap } = data;

  // Vehicle dropdown: any vehicle that appears in history and isn't cleared -
  // including archived ones (their fill-ups still show, so let them be filtered).
  const groupsWithHistory = new Set(data.entries.map((e) => e.groupId));
  const groupOptions = [
    { value: "all", label: "All vehicles" },
    ...data.groups
      .filter((g) => !g.cleared && groupsWithHistory.has(g.id))
      .filter((g) =>
        ownership === "owned"
          ? g.ownerType === "me"
          : ownership === "carpool"
          ? g.ownerType === "person"
          : true
      )
      .map((g) => ({
        value: g.id,
        label: g.isArchived ? `${g.name} (archived)` : g.name,
      })),
  ];

  const whoOptions = [];
  // Offer "Me" when you're on any fill-up: as a carpool passenger, or tagged in
  // your own vehicle (#2).
  const meOnAnyEntry =
    nonOwnedGroups.length > 0 ||
    data.entries.some((e) => (e.passengers || []).some((p) => p.who?.type === "me"));
  if (meOnAnyEntry) whoOptions.push({ value: whoKey(ME), label: "Me" });
  for (const p of people)
    whoOptions.push({
      value: whoKey({ type: "person", personId: p.id }),
      label: p.isArchived ? `${p.name} (archived)` : p.name,
    });

  const activeFilterCount = [
    groupFilter !== "all",
    whoFilter.length > 0,
    Boolean(from),
    Boolean(to),
  ].filter(Boolean).length;
  const hasFilters = ownership !== "all" || activeFilterCount > 0;
  // "Carpools" filter -> "trip"; "All"/"My Vehicles" default to "refuel" (a
  // mixed "All" list can't be exactly right either way, so it keeps the
  // owned-side default per the established convention).
  const entryNoun = ownership === "carpool" ? "trip" : "refuel";

  return (
    <div className="app-shell stagger">
      <header className="screen-head">
        <div>
          <p className="screen-head__kicker">Every refuel</p>
          <h1 className="screen-head__title">History</h1>
        </div>
      </header>

      {/* Ownership tag */}
      <div className="section-block">
        <Segment
          value={ownership}
          onChange={(v) => {
            setOwnership(v);
            setGroupFilter("all");
          }}
          options={[
            { value: "all", label: "All" },
            { value: "owned", label: "My Vehicles" },
            { value: "carpool", label: "Carpools" },
          ]}
        />
      </div>

      {/* Filters - collapsed by default so the list isn't buried under chrome
          when there's only a handful of fill-ups to search through. */}
      <div className="section-block">
        <button
          type="button"
          className="filters-toggle"
          onClick={() => setShowFilters((s) => !s)}
          aria-expanded={showFilters}
        >
          <span>
            Filters
            {activeFilterCount > 0 ? (
              <span className="filters-toggle__count">{activeFilterCount}</span>
            ) : null}
          </span>
          <ChevronDown
            size={16}
            className={"filters-toggle__chev" + (showFilters ? " is-open" : "")}
          />
        </button>
        {showFilters && (
          <div className="detail-panel" style={{ marginTop: "0.6rem" }}>
            <div className="filter-grid">
              <label className="filter-field">
                <span>Vehicle</span>
                <Select value={groupFilter} onChange={setGroupFilter} options={groupOptions} />
              </label>
              <label className="filter-field">
                <span>Passengers</span>
                <Select
                  multi
                  value={whoFilter}
                  onChange={setWhoFilter}
                  options={whoOptions}
                  allLabel="Anyone"
                />
              </label>
              <label className="filter-field">
                <span>From</span>
                <DatePicker value={from} onChange={setFrom} placeholder="Any" clearable />
              </label>
              <label className="filter-field">
                <span>To</span>
                <DatePicker value={to} onChange={setTo} placeholder="Any" clearable />
              </label>
            </div>
            {hasFilters && (
              <button
                className="link-btn"
                type="button"
                style={{ marginTop: "0.6rem" }}
                onClick={() => {
                  setOwnership("all");
                  setGroupFilter("all");
                  setWhoFilter([]);
                  setFrom("");
                  setTo("");
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Passenger totals summary */}
      {summary && (
        <div className="detail-panel section-block filter-summary">
          <div className="filter-summary__who">
            {whoFilter
              .map((k) => {
                const opt = whoOptions.find((o) => o.value === k);
                return opt?.label;
              })
              .filter(Boolean)
              .join(", ")}
          </div>
          <div className="filter-summary__nums">
            <span>
              share <strong>{formatMoney(summary.shareTot)}</strong>
            </span>
            <span className="pos">
              paid <strong>{formatMoney(summary.paidTot)}</strong>
            </span>
            <span className={summary.outstanding > 0.005 ? "neg" : "faint"}>
              outstanding <strong>{formatMoney(Math.max(0, summary.outstanding))}</strong>
            </span>
          </div>
        </div>
      )}

      {/* Results */}
      {data.entries.length === 0 ? (
        <EmptyState emoji="⛽" title="No refuels yet">
          Tap the + button to log your first fuel entry.
        </EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState emoji="🔍" title="Nothing matches">
          No {entryNoun}s match these filters. Try widening the date range or clearing
          filters.
        </EmptyState>
      ) : (
        <section className="section-block">
          <p className="muted" style={{ fontSize: "0.76rem", marginBottom: "0.6rem" }}>
            {filtered.length} {entryNoun}{filtered.length === 1 ? "" : "s"}
          </p>
          <UpcomingReveal
            entries={filtered}
            windowValue={data.settings?.upcomingWindow}
            renderEntry={(e) => (
              <EntryCard
                key={e.id}
                entry={e}
                payments={payments}
                peopleMap={peopleMap}
                applications={data.creditApplications}
                ownedByMe={data.groupOwnedMap.get(e.groupId)}
                ownerName={personName(groupMap.get(e.groupId)?.ownerPersonId, peopleMap)}
                ownerWho={
                  data.groupOwnedMap.get(e.groupId)
                    ? ME
                    : mkPerson(groupMap.get(e.groupId)?.ownerPersonId)
                }
                vehicleName={groupMap.get(e.groupId)?.name}
                fallbackTitle={groupMap.get(e.groupId)?.name}
                onlyWho={whoFilter.length > 0 ? whoSet : null}
                onRecordPayment={entryActions.onRecordPayment}
                onEditPayment={entryActions.onEditPayment}
                onDeletePayment={entryActions.onDeletePayment}
                onQuickSettle={entryActions.onQuickSettle}
                onClearPayments={entryActions.onClearPayments}
                onEdit={entryActions.onEditEntry}
                onDuplicate={entryActions.onDuplicateEntry}
                onDelete={entryActions.onDeleteEntry}
                onReverseCredit={entryActions.onReverseCredit}
              />
            )}
          />
        </section>
      )}
    </div>
  );
}

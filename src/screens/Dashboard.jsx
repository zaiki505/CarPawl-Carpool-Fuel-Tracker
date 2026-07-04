import React from "react";
import { useAllData } from "../db/hooks.js";
import { useApp } from "../app/AppContext.jsx";
import { useEntryActions } from "../app/useEntryActions.js";
import {
  totalOwedToYou,
  totalYouOwe,
  thisMonthConsumption,
} from "../lib/calc.js";
import { formatMoney, formatLiters, monthLabel } from "../lib/format.js";
import { StatCard, SectionHead, EmptyState } from "../components/ui/Primitives.jsx";
import { GroupCard } from "../components/GroupCard.jsx";
import { EntryCard } from "../components/EntryCard.jsx";
import { FuelSpendCard } from "../components/FuelSpendCard.jsx";
import { EfficiencyChart } from "../components/LazyChart.jsx";
import { Wallet, CircleDollarSign, Fuel, Gauge, TrendingUp } from "../components/ui/Icons.jsx";

export function Dashboard() {
  const data = useAllData();
  const { openGroup, goTab } = useApp();
  const entryActions = useEntryActions();

  if (!data) return <div className="app-shell" />;

  const {
    ownedGroups,
    nonOwnedGroups,
    entriesByGroup,
    payments,
    peopleMap,
    entries,
  } = data;

  const owedToYou = totalOwedToYou(ownedGroups, entriesByGroup, payments);
  const youOwe = totalYouOwe(nonOwnedGroups, entriesByGroup, payments);
  const consumption = thisMonthConsumption({ ownedGroups, entriesByGroup });

  const recent = entries.slice(0, 4);
  const ownedWithEntries = ownedGroups.filter(
    (g) => (entriesByGroup[g.id] || []).length > 0
  );

  return (
    <div className="app-shell stagger">
      <header className="screen-head">
        <div>
          <p className="screen-head__kicker">{monthLabel()}</p>
          <h1 className="screen-head__title">Hey there 👋</h1>
        </div>
      </header>

      {/* Headline totals */}
      <div className="stat-grid section-block">
        <StatCard
          accent
          icon={<Wallet size={13} />}
          label="To collect"
          value={formatMoney(owedToYou)}
          valueClass={owedToYou > 0 ? "stat-card__value--pos" : ""}
          hint="across your cars"
        />
        <StatCard
          icon={<CircleDollarSign size={13} />}
          label="To pay"
          value={formatMoney(youOwe)}
          valueClass={youOwe > 0 ? "stat-card__value--neg" : ""}
          hint="in carpools"
        />
        <FuelSpendCard entries={entries} groupOwnedMap={data.groupOwnedMap} />
        <StatCard
          wide
          icon={<Gauge size={13} />}
          label="Fuel this month"
          value={formatLiters(consumption.liters)}
          hint={formatMoney(consumption.cost)}
        />
      </div>

      {/* Per-group: My Vehicles */}
      <section className="section-block">
        <SectionHead title="My Vehicle(s)" action="All vehicles" onAction={() => goTab("groups")} />
        {ownedGroups.length === 0 ? (
          <EmptyState emoji="🚗" title="No cars yet">
            Add your car from the Vehicles tab to start tracking fuel.
          </EmptyState>
        ) : (
          ownedGroups.map((g) => (
            <GroupCard
              key={g.id}
              group={g}
              entries={entriesByGroup[g.id]}
              payments={payments}
              peopleMap={peopleMap}
              onOpen={openGroup}
            />
          ))
        )}
      </section>

      {/* Per-group: Carpools */}
      {nonOwnedGroups.length > 0 && (
        <section className="section-block">
          <SectionHead title="Carpools" />
          {nonOwnedGroups.map((g) => (
            <GroupCard
              key={g.id}
              group={g}
              entries={entriesByGroup[g.id]}
              payments={payments}
              peopleMap={peopleMap}
              onOpen={openGroup}
            />
          ))}
        </section>
      )}

      {/* Efficiency trend per owned group */}
      {ownedWithEntries.length > 0 && (
        <section className="section-block">
          <SectionHead title="Fuel efficiency" />
          {ownedWithEntries.map((g) => (
            <div key={g.id} className="chart-block">
              <div className="chart-block__title">
                <TrendingUp size={14} /> {g.name}
              </div>
              <EfficiencyChart entries={entriesByGroup[g.id]} />
            </div>
          ))}
        </section>
      )}

      {/* Recent entries */}
      {recent.length > 0 && (
        <section className="section-block">
          <SectionHead title="Recent fill-ups" action="See all" onAction={() => goTab("history")} />
          {recent.map((e) => (
            <EntryCard
              key={e.id}
              entry={e}
              payments={payments}
              peopleMap={peopleMap}
              ownedByMe={data.groupOwnedMap.get(e.groupId)}
              fallbackTitle={data.groupMap.get(e.groupId)?.name}
              onRecordPayment={entryActions.onRecordPayment}
              onEditPayment={entryActions.onEditPayment}
              onDeletePayment={entryActions.onDeletePayment}
              onQuickSettle={entryActions.onQuickSettle}
              onClearPayments={entryActions.onClearPayments}
              onEdit={entryActions.onEditEntry}
              onDelete={entryActions.onDeleteEntry}
            />
          ))}
        </section>
      )}
    </div>
  );
}

import React from "react";
import { useAllData } from "../db/hooks.js";
import { useApp } from "../app/AppContext.jsx";
import { useEntryActions } from "../app/useEntryActions.js";
import {
  totalOwedToYou,
  totalYouOwe,
  thisMonthConsumption,
} from "../lib/calc.js";
import { formatMoney, formatMoneyShort, formatLiters, monthLabel } from "../lib/format.js";
import { personName } from "../lib/names.js";
import { StatCard, SectionHead, EmptyState } from "../components/ui/Primitives.jsx";
import { GroupCard } from "../components/GroupCard.jsx";
import { EntryCard } from "../components/EntryCard.jsx";
import { FuelSpendCard } from "../components/FuelSpendCard.jsx";
import { ChartCarousel } from "../components/LazyChartCarousel.jsx";
import { Wallet, CircleDollarSign, Fuel, Gauge } from "../components/ui/Icons.jsx";

export function Dashboard() {
  const data = useAllData();
  const { openGroup, goTab, openSheet } = useApp();
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
          tone="collect"
          icon={<Wallet size={13} />}
          label="To collect"
          value={formatMoney(owedToYou)}
          valueClass={owedToYou > 0 ? "stat-card__value--pos" : ""}
          hint="across your cars"
        />
        <StatCard
          tone="pay"
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
          hint={
            consumption.liters > 0
              ? `${formatMoneyShort(consumption.cost / consumption.liters)}/L avg`
              : "no refuels yet"
          }
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
      <section className="section-block">
        <SectionHead title="Carpools" />
        {nonOwnedGroups.length === 0 ? (
          <EmptyState
            emoji="🧑‍🤝‍🧑"
            title="No carpools yet"
            actionLabel="+ Add a carpool"
            onAction={() => openSheet({ type: "createGroup", ownerType: "person" })}
          >
            Ride in someone else's car? Track your share of their fuel here.
          </EmptyState>
        ) : (
          nonOwnedGroups.map((g) => (
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

      {/* Chart carousel: cost trend, month vs month, cost by person, refuel frequency */}
      <section className="section-block">
        <ChartCarousel
          ownedGroups={ownedGroups}
          entriesByGroup={entriesByGroup}
          peopleMap={peopleMap}
        />
      </section>

      {/* Recent entries */}
      <section className="section-block">
        <SectionHead
          title="Recent trips"
          action={recent.length > 0 ? "See all" : undefined}
          onAction={recent.length > 0 ? () => goTab("history") : undefined}
        />
        {recent.length === 0 ? (
          <EmptyState
            emoji="⛽"
            title="No trips yet"
            actionLabel="+ Log a trip"
            onAction={() => openSheet({ type: "addEntry" })}
          >
            Your latest fuel stops show up here once you log one.
          </EmptyState>
        ) : (
          recent.map((e) => (
            <EntryCard
              key={e.id}
              entry={e}
              payments={payments}
              peopleMap={peopleMap}
              ownedByMe={data.groupOwnedMap.get(e.groupId)}
              ownerName={personName(data.groupMap.get(e.groupId)?.ownerPersonId, peopleMap)}
              fallbackTitle={data.groupMap.get(e.groupId)?.name}
              onRecordPayment={entryActions.onRecordPayment}
              onEditPayment={entryActions.onEditPayment}
              onDeletePayment={entryActions.onDeletePayment}
              onQuickSettle={entryActions.onQuickSettle}
              onClearPayments={entryActions.onClearPayments}
              onEdit={entryActions.onEditEntry}
              onDuplicate={entryActions.onDuplicateEntry}
              onDelete={entryActions.onDeleteEntry}
            />
          ))
        )}
      </section>
    </div>
  );
}

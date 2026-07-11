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
import { partitionUpcoming, upcomingWindowDays } from "../lib/upcoming.js";
import { personName } from "../lib/names.js";
import { StatCard, SectionHead, EmptyState } from "../components/ui/Primitives.jsx";
import { ScreenLoading } from "../components/ui/ScreenLoading.jsx";
import { GroupCard } from "../components/GroupCard.jsx";
import { EntryCard } from "../components/EntryCard.jsx";
import { FuelSpendCard } from "../components/FuelSpendCard.jsx";
import { ChartCarousel } from "../components/LazyChartCarousel.jsx";
import { DriveReauthBanner } from "../components/DriveReauthBanner.jsx";
import { Wallet, CircleDollarSign, Fuel, Gauge } from "../components/ui/Icons.jsx";

export function Dashboard() {
  const data = useAllData();
  const { openGroup, goTab, openSheet } = useApp();
  const entryActions = useEntryActions();

  if (!data) return <ScreenLoading />;

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

  // Fuel-spend card counts only entries in active (non-archived) groups, matching
  // the "to collect" / "to pay" totals above.
  const activeGroupIds = new Set(data.activeGroups.map((g) => g.id));
  const spendEntries = entries.filter((e) => activeGroupIds.has(e.groupId));

  // Hide far-future upcoming trips from the preview per the Appearance window
  // (they still live in History, which has the staged "show more").
  const recent = partitionUpcoming(entries, upcomingWindowDays(data.settings?.upcomingWindow))
    .visible.slice(0, 4);

  return (
    <div className="app-shell stagger">
      <DriveReauthBanner />
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
        <FuelSpendCard entries={spendEntries} groupOwnedMap={data.groupOwnedMap} />
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

      {/* Latest activity: most recent entries, including any upcoming (scheduled) ones */}
      <section className="section-block">
        <SectionHead
          title="Latest activity"
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
              applications={data.creditApplications}
              onReverseCredit={entryActions.onReverseCredit}
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

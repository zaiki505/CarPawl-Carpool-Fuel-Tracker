import React, { useState } from "react";
import { useAllData } from "../db/hooks.js";
import { useApp } from "../app/AppContext.jsx";
import { useEntryActions } from "../app/useEntryActions.js";
import {
  totalOwedToYou,
  totalYouOwe,
  thisMonthConsumption,
  groupBalances,
  balanceForWho,
  share,
  isSameMonth,
  outstanding,
} from "../lib/calc.js";
import { computeFuelSpend, FUEL_PERIODS } from "../lib/fuelSpend.js";
import {
  formatMoney,
  formatMoneyShort,
  formatLiters,
  formatDate,
  monthLabel,
  isFutureDate,
} from "../lib/format.js";
import { partitionUpcoming, upcomingWindowDays } from "../lib/upcoming.js";
import { personName, whoName } from "../lib/names.js";
import { whoKey, whoEquals, ME } from "../lib/identity.js";
import { PickTripSheet } from "../components/PickTripSheet.jsx";
import { StatCard, SectionHead, EmptyState } from "../components/ui/Primitives.jsx";
import { ScreenLoading } from "../components/ui/ScreenLoading.jsx";
import { GroupCard } from "../components/GroupCard.jsx";
import { EntryCard } from "../components/EntryCard.jsx";
import { FuelSpendCard } from "../components/FuelSpendCard.jsx";
import { BreakdownSheet } from "../components/BreakdownSheet.jsx";
import { ChartCarousel } from "../components/LazyChartCarousel.jsx";
import { DriveReauthBanner } from "../components/DriveReauthBanner.jsx";
import { UpdateBanner } from "../components/UpdateBanner.jsx";
import { Wallet, CircleDollarSign, Fuel, Gauge } from "../components/ui/Icons.jsx";

export function Dashboard() {
  const data = useAllData();
  const { openGroup, goTab, openSheet } = useApp();
  const entryActions = useEntryActions();
  // Which summary card's breakdown sheet is open: { kind, period? } | null.
  const [detail, setDetail] = useState(null);
  // Trip picker when a tapped breakdown row owes on more than one trip.
  const [payPicker, setPayPicker] = useState(null);

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

  // ---- Breakdown rows behind each summary card (match the headline numbers) ----
  // collect/pay rows carry { group, who } so tapping records a payment there.
  function collectRows() {
    const rows = [];
    for (const g of ownedGroups) {
      for (const row of groupBalances(entriesByGroup[g.id] || [], payments, { excludeMe: true })) {
        if (row.owed <= 0.005) continue;
        rows.push({
          label: whoName(row.who, peopleMap),
          sublabel: g.name,
          amount: formatMoney(row.owed),
          _owed: row.owed,
          tone: "pos",
          group: g,
          who: row.who,
        });
      }
    }
    return rows.sort((a, b) => b._owed - a._owed);
  }
  function payRows() {
    return nonOwnedGroups
      .map((g) => ({ g, owed: balanceForWho(entriesByGroup[g.id] || [], ME, payments).owed }))
      .filter((r) => r.owed > 0.005)
      .sort((a, b) => b.owed - a.owed)
      .map((r) => ({
        label: r.g.name,
        sublabel: "to " + (personName(r.g.ownerPersonId, peopleMap) || "the owner"),
        amount: formatMoney(r.owed),
        tone: "neg",
        group: r.g,
        who: ME,
      }));
  }

  // Tapping a To collect / To pay row jumps straight to recording that payment.
  function recordPaymentFromRow(row) {
    const g = row.group;
    const gEntries = entriesByGroup[g.id] || [];
    const owing = gEntries.filter(
      (e) => outstanding(e, row.who, payments, data.creditApplications) > 0.005
    );
    const payable = owing.length
      ? owing
      : gEntries.filter((e) => (e.passengers || []).some((p) => whoEquals(p.who, row.who)));
    if (!payable.length) return;
    const ownedByMe = g.ownerType === "me";
    setDetail(null);
    if (payable.length === 1) {
      openSheet({ type: "payment", entry: payable[0], who: row.who, ownedByMe });
    } else {
      setPayPicker({
        group: g,
        who: row.who,
        ownedByMe,
        trips: payable.map((e) => ({
          entry: e,
          amount: outstanding(e, row.who, payments, data.creditApplications),
        })),
      });
    }
  }
  function spendRows(period) {
    return data.activeGroups
      .map((g) => ({
        g,
        spend: computeFuelSpend({
          trips: entriesByGroup[g.id] || [],
          isDriver: (e) => data.groupOwnedMap.get(e.groupId) === true,
          riderSplit: (e) => share(e, ME),
          fuelCost: (e) => e.totalCost,
          period,
        }).yourSpend,
      }))
      .filter((r) => r.spend > 0.005)
      .sort((a, b) => b.spend - a.spend)
      .map((r) => ({ label: r.g.name, amount: formatMoney(r.spend) }));
  }
  function fuelMonthRows() {
    const rows = [];
    for (const g of ownedGroups) {
      for (const e of entriesByGroup[g.id] || []) {
        if (isSameMonth(e.date) && !isFutureDate(e.date)) {
          rows.push({ date: e.date, label: e.title || g.name, sublabel: formatDate(e.date), amount: formatLiters(e.totalLiters) });
        }
      }
    }
    return rows.sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  let detailSheet = null;
  if (detail?.kind === "collect")
    detailSheet = { title: "To collect", subtitle: "Who owes you - tap to record their payment", rows: collectRows(), emptyText: "Nobody owes you right now.", onRowClick: recordPaymentFromRow };
  else if (detail?.kind === "pay")
    detailSheet = { title: "To pay", subtitle: "What you owe - tap to record your payment", rows: payRows(), emptyText: "You're all settled up in your carpools.", onRowClick: recordPaymentFromRow };
  else if (detail?.kind === "spend")
    detailSheet = {
      title: "Fuel spend by vehicle",
      subtitle: `Your spend - ${FUEL_PERIODS.find((p) => p.value === detail.period)?.label || ""}`,
      rows: spendRows(detail.period),
      emptyText: "No fuel spend in this period.",
    };
  else if (detail?.kind === "fuelMonth")
    detailSheet = { title: "Fuel this month", subtitle: monthLabel(), rows: fuelMonthRows(), emptyText: "No refuels logged this month yet." };

  return (
    <div className="app-shell stagger">
      <UpdateBanner />
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
          onClick={() => setDetail({ kind: "collect" })}
        />
        <StatCard
          tone="pay"
          icon={<CircleDollarSign size={13} />}
          label="To pay"
          value={formatMoney(youOwe)}
          valueClass={youOwe > 0 ? "stat-card__value--neg" : ""}
          hint="in carpools"
          onClick={() => setDetail({ kind: "pay" })}
        />
        <FuelSpendCard
          entries={spendEntries}
          groupOwnedMap={data.groupOwnedMap}
          onOpenBreakdown={(period) => setDetail({ kind: "spend", period })}
        />
        <StatCard
          wide
          icon={<Gauge size={13} />}
          label="Fuel this month"
          value={formatLiters(consumption.liters)}
          onClick={() => setDetail({ kind: "fuelMonth" })}
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

      {detailSheet && (
        <BreakdownSheet {...detailSheet} onClose={() => setDetail(null)} />
      )}

      {payPicker && (
        <PickTripSheet
          title={`Pay for ${whoName(payPicker.who, peopleMap)}`}
          subtitle="Which trip is this payment for?"
          groupName={payPicker.group.name}
          trips={payPicker.trips}
          onPick={(e) => {
            const { who, ownedByMe } = payPicker;
            setPayPicker(null);
            openSheet({ type: "payment", entry: e, who, ownedByMe });
          }}
          onClose={() => setPayPicker(null)}
        />
      )}
    </div>
  );
}

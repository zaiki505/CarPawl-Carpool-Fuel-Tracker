// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { EntryCard } from "./EntryCard.jsx";
import { person } from "../lib/identity.js";

afterEach(cleanup);

const alex = person("alex");
const sam = person("sam");
const peopleMap = new Map([
  ["alex", { id: "alex", name: "Alex" }],
  ["sam", { id: "sam", name: "Sam" }],
]);

const baseEntry = {
  id: "e1",
  date: "2000-01-01", // safely in the past
  totalCost: 60,
  totalDistance: 300,
  totalLiters: 30,
  fuelPricePerLiter: 2,
  splitMethod: "distance",
  passengers: [{ who: alex, distanceAssigned: 300 }],
};

describe("EntryCard", () => {
  it("renders a passenger and their share when expanded", () => {
    render(
      <EntryCard entry={baseEntry} payments={[]} peopleMap={peopleMap} defaultExpanded />
    );
    expect(screen.getByText("Alex")).toBeInTheDocument();
    // distance split: alex rides the full 300km -> owes the full RM60
    expect(screen.getByText(/share RM60\.00/)).toBeInTheDocument();
  });

  describe("upcoming (future-dated) refuels", () => {
    it("shows an 'Upcoming' badge and dimmed styling for a future date", () => {
      const { container } = render(
        <EntryCard
          entry={{ ...baseEntry, date: "2999-01-01" }}
          payments={[]}
          peopleMap={peopleMap}
        />
      );
      expect(screen.getByText("Upcoming")).toBeInTheDocument();
      expect(container.querySelector(".entry-card--upcoming")).toBeTruthy();
    });

    it("does NOT mark a past-dated refuel as upcoming", () => {
      const { container } = render(
        <EntryCard entry={baseEntry} payments={[]} peopleMap={peopleMap} />
      );
      expect(screen.queryByText("Upcoming")).toBeNull();
    });

    // #4: upcoming refuels accept payments IN ADVANCE - the button is labelled
    // "Prepay". The money is held out of the live balances (calc.balanceForWho
    // skips future entries wholesale) until the refuel date arrives.
    it("shows a Prepay button on an upcoming refuel so you can pay in advance", () => {
      render(
        <EntryCard
          entry={{ ...baseEntry, date: "2999-01-01" }}
          payments={[]}
          peopleMap={peopleMap}
          defaultExpanded
          onRecordPayment={() => {}}
        />
      );
      expect(screen.getByText("Prepay")).toBeInTheDocument();
      expect(screen.queryByText("Pay")).toBeNull(); // labelled "Prepay", not "Pay"
    });

    it("still shows the Pay button on a past-dated refuel with the same passenger owing", () => {
      render(
        <EntryCard
          entry={baseEntry}
          payments={[]}
          peopleMap={peopleMap}
          defaultExpanded
          onRecordPayment={() => {}}
        />
      );
      expect(screen.getByText("Pay")).toBeInTheDocument();
    });
  });

  describe("per-passenger payment history expansion (regression: #7)", () => {
    const equalEntry = {
      id: "e2",
      date: "2000-01-01",
      totalCost: 120,
      totalDistance: 200,
      splitMethod: "equal",
      passengers: [{ who: alex }, { who: sam }],
    };
    const threePays = (who, prefix) =>
      Array.from({ length: 3 }, (_, i) => ({
        id: `${prefix}${i}`,
        entryId: "e2",
        who,
        amount: 5,
        date: "2000-01-02",
        note: `${prefix}${i}`,
      }));

    it("shows only 2 payments then reveals the rest on '+ more'", () => {
      const { container } = render(
        <EntryCard
          entry={{ ...equalEntry, passengers: [{ who: alex }] }}
          payments={threePays(alex, "a")}
          peopleMap={peopleMap}
          defaultExpanded
          onEditPayment={() => {}}
        />
      );
      expect(container.querySelectorAll(".pay-chip")).toHaveLength(2);
      fireEvent.click(screen.getByText(/\+1 more payment/));
      expect(container.querySelectorAll(".pay-chip")).toHaveLength(3);
      expect(screen.getByText("Show less")).toBeInTheDocument();
    });

    it("expands each passenger independently, not all at once", () => {
      render(
        <EntryCard
          entry={equalEntry}
          payments={[...threePays(alex, "a"), ...threePays(sam, "s")]}
          peopleMap={peopleMap}
          defaultExpanded
          onEditPayment={() => {}}
        />
      );
      // one "+ more" control per passenger
      const moreButtons = screen.getAllByText(/\+1 more payment/);
      expect(moreButtons).toHaveLength(2);
      // expanding the first must not expand the second
      fireEvent.click(moreButtons[0]);
      expect(screen.getAllByText("Show less")).toHaveLength(1);
      expect(screen.getAllByText(/\+1 more payment/)).toHaveLength(1);
    });
  });

  it("fires the Pay action for a passenger who owes", () => {
    const onRecordPayment = vi.fn();
    render(
      <EntryCard
        entry={baseEntry}
        payments={[]}
        peopleMap={peopleMap}
        defaultExpanded
        onRecordPayment={onRecordPayment}
      />
    );
    fireEvent.click(screen.getByText(/Pay/));
    expect(onRecordPayment).toHaveBeenCalledOnce();
    expect(onRecordPayment.mock.calls[0][1]).toEqual(alex); // (entry, who, ownedByMe)
  });

  /* A debt settled by credit reads exactly like a paid one everywhere else, so
     the collapsed row's "collected / billed" figure has to count it too. It used
     to count only cash, contradicting the expanded row right beneath it. */
  describe("collapsed row counts applied credit as collected", () => {
    const apps = [
      { id: "a1", targetEntryId: "e1", debtorWho: alex, amount: 20, reversedAt: null },
    ];

    it("credit counts toward the collected figure alongside cash", () => {
      // share 60: RM10 cash + RM20 credit = RM30 collected, RM30 still owed.
      render(
        <EntryCard
          entry={baseEntry}
          payments={[{ id: "p1", entryId: "e1", who: alex, amount: 10, date: "2000-01-02" }]}
          applications={apps}
          peopleMap={peopleMap}
        />
      );
      expect(screen.getByText("RM30")).toBeInTheDocument();
      expect(screen.getByText("/RM60")).toBeInTheDocument();
    });

    it("a reversed application stops counting", () => {
      render(
        <EntryCard
          entry={baseEntry}
          payments={[{ id: "p1", entryId: "e1", who: alex, amount: 10, date: "2000-01-02" }]}
          applications={[{ ...apps[0], reversedAt: "2000-01-03" }]}
          peopleMap={peopleMap}
        />
      );
      expect(screen.getByText("RM10")).toBeInTheDocument();
    });
  });
});

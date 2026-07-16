import { describe, it, expect } from "vitest";
import {
  outstanding,
  statusOf,
  appliedCreditTo,
  creditPoolFor,
  availableCredit,
  outstandingDebtsFor,
  creditRecordFor,
  groupBalances,
  creditRefundedByPayment,
} from "./calc.js";
import { person, whoEquals } from "./identity.js";

// A carpool owned by zai; ben is a passenger. Equal split with one passenger
// makes each entry's share exactly its totalCost, so the numbers are obvious.
const zai = person("zai");
const ben = person("ben");
const far = person("far");

const overpaid = { id: "e1", date: "2026-01-01", splitMethod: "equal", totalCost: 10, passengers: [{ who: ben }] };
const debt = { id: "e2", date: "2026-02-01", splitMethod: "equal", totalCost: 50, passengers: [{ who: ben }] };
const entries = [overpaid, debt];
// ben paid RM30 on the RM10 entry -> RM20 overpayment (credit).
const payments = [{ id: "p1", entryId: "e1", who: ben, amount: 30 }];

const app = (over) => ({ id: "a1", targetEntryId: "e2", debtorWho: ben, amount: 20, reversedAt: null, ...over });

describe("credit pool + availability", () => {
  it("credit pool is the gross overpayment across the pair", () => {
    expect(creditPoolFor(entries, ben, payments)).toBeCloseTo(20);
  });
  it("available credit with no applications equals the pool", () => {
    expect(availableCredit(entries, ben, payments, [])).toBeCloseTo(20);
  });
  it("lists the outstanding debts (not the overpaid entry)", () => {
    const debts = outstandingDebtsFor(entries, ben, payments, []);
    expect(debts.map((d) => d.entry.id)).toEqual(["e2"]);
    expect(debts[0].amount).toBeCloseTo(50);
  });
});

describe("applying credit", () => {
  const apps = [app()];
  it("applied credit reduces the target debt's outstanding", () => {
    expect(appliedCreditTo("e2", ben, apps)).toBeCloseTo(20);
    expect(outstanding(debt, ben, payments, apps)).toBeCloseTo(30);
    expect(statusOf(debt, ben, payments, apps)).toBe("partial");
  });
  it("consumes available credit", () => {
    expect(availableCredit(entries, ben, payments, apps)).toBeCloseTo(0);
  });
  it("fully covering a debt marks it paid", () => {
    const full = [app({ amount: 50 })];
    expect(outstanding(debt, ben, payments, full)).toBeCloseTo(0);
    expect(statusOf(debt, ben, payments, full)).toBe("paid");
  });
});

describe("scoping + reversal", () => {
  it("credit is per person-pair: another debtor's application doesn't count", () => {
    const other = [app({ debtorWho: far })];
    expect(appliedCreditTo("e2", ben, other)).toBeCloseTo(0);
    expect(outstanding(debt, ben, payments, other)).toBeCloseTo(50);
  });
  it("a reversed application is ignored - credit and debt are restored", () => {
    const reversed = [app({ reversedAt: "2026-03-01T00:00:00.000Z" })];
    expect(appliedCreditTo("e2", ben, reversed)).toBeCloseTo(0);
    expect(availableCredit(entries, ben, payments, reversed)).toBeCloseTo(20);
    expect(outstanding(debt, ben, payments, reversed)).toBeCloseTo(50);
  });
});

describe("carpool owner is never owed to themselves", () => {
  // zai owns the carpool but is (wrongly) also listed as a passenger; ben is a
  // real passenger. Excluding the owner keeps zai out of the balances.
  const trip = { id: "t", date: "2026-01-01", splitMethod: "equal", totalCost: 20, passengers: [{ who: zai }, { who: ben }] };
  it("excludeWho drops the owner from the balance rows", () => {
    const rows = groupBalances([trip], [], { excludeWho: zai });
    expect(rows.some((r) => whoEquals(r.who, zai))).toBe(false);
    expect(rows.some((r) => whoEquals(r.who, ben))).toBe(true);
  });
  it("without excludeWho the owner would show (documents the flaw it fixes)", () => {
    const rows = groupBalances([trip], []);
    expect(rows.some((r) => whoEquals(r.who, zai))).toBe(true);
  });
});

describe("creditRecordFor (rule 7 view)", () => {
  it("reports original, remaining and applications", () => {
    const rec = creditRecordFor(entries, ben, zai, payments, [app()]);
    expect(rec.original).toBeCloseTo(20);
    expect(rec.remaining).toBeCloseTo(0);
    expect(rec.applications).toHaveLength(1);
    expect(rec.from).toEqual(zai);
    expect(rec.holder).toEqual(ben);
  });
});

/* Cash beats credit: paying an entry that credit already covers hands that
   credit back rather than settling twice. This predicts exactly how much, so
   the payment sheet can warn before the write instead of surprising the user. */
describe("creditRefundedByPayment", () => {
  // debt (e2) share 50, with 20 of ben's credit applied to it.
  const app20 = { id: "a1", targetEntryId: "e2", debtorWho: ben, amount: 20, reversedAt: null, createdAt: "2026-03-01" };

  it("nothing is handed back while the credit still fits", () => {
    // paying 30 leaves 20 of room - exactly what the credit occupies.
    expect(creditRefundedByPayment(debt, ben, [app20], 30)).toBeCloseTo(0);
  });

  it("hands the credit back once cash covers the whole debt", () => {
    expect(creditRefundedByPayment(debt, ben, [app20], 50)).toBeCloseTo(20);
  });

  it("a partial payment can hand back MORE than it covers (whole rows)", () => {
    // 40 cash leaves only 10 of room, so the whole 20 row reverses - they end up
    // still owing 10, which is exactly what the warning has to say out loud.
    expect(creditRefundedByPayment(debt, ben, [app20], 40)).toBeCloseTo(20);
  });

  it("keeps the older application and reverses the newer one that no longer fits", () => {
    const older = { ...app20, id: "a1", amount: 10, createdAt: "2026-03-01" };
    const newer = { ...app20, id: "a2", amount: 10, createdAt: "2026-03-02" };
    // 35 cash leaves 15 of room: the older 10 fits, the newer 10 doesn't.
    expect(creditRefundedByPayment(debt, ben, [newer, older], 35)).toBeCloseTo(10);
  });

  it("ignores reversed applications and other people's credit", () => {
    const reversed = { ...app20, reversedAt: "2026-03-05" };
    expect(creditRefundedByPayment(debt, ben, [reversed], 50)).toBeCloseTo(0);
    const someoneElse = { ...app20, debtorWho: far };
    expect(creditRefundedByPayment(debt, ben, [someoneElse], 50)).toBeCloseTo(0);
  });
});

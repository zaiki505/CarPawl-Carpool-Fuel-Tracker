import { describe, it, expect } from "vitest";
import { isNewerVersion } from "./updateCheck.js";

/* Version comparison gates the in-app "update available" prompt. Once beta
   builds carry a -beta.N suffix, the old numeric-only compare was actively
   wrong: it parsed "0.4.0-beta.1" as [0,4,0] and called it EQUAL to "0.4.0",
   so a beta tester who installed the finished build would never be told. */

describe("isNewerVersion - plain releases", () => {
  it("compares each numeric part", () => {
    expect(isNewerVersion("0.3.0", "0.2.9")).toBe(true);
    expect(isNewerVersion("0.2.9", "0.3.0")).toBe(false);
    expect(isNewerVersion("1.0.0", "0.99.99")).toBe(true);
  });

  it("is false for the same version (no pointless update prompt)", () => {
    expect(isNewerVersion("0.3.0", "0.3.0")).toBe(false);
  });

  it("tolerates a leading v and missing parts", () => {
    expect(isNewerVersion("v0.3.1", "0.3.0")).toBe(true);
    expect(isNewerVersion("0.4", "0.3.9")).toBe(true);
    expect(isNewerVersion("0.3", "0.3.0")).toBe(false);
  });
});

describe("isNewerVersion - prereleases", () => {
  it("a finished release outranks its own prerelease", () => {
    // The regression that motivated this: these used to compare equal.
    expect(isNewerVersion("0.4.0", "0.4.0-beta.1")).toBe(true);
    expect(isNewerVersion("0.4.0-beta.1", "0.4.0")).toBe(false);
  });

  it("orders prereleases of the same version numerically", () => {
    expect(isNewerVersion("0.4.0-beta.2", "0.4.0-beta.1")).toBe(true);
    expect(isNewerVersion("0.4.0-beta.1", "0.4.0-beta.2")).toBe(false);
    // Numeric, not lexical - "10" must beat "9", which a string compare fails.
    expect(isNewerVersion("0.4.0-beta.10", "0.4.0-beta.9")).toBe(true);
  });

  it("a higher version still wins even as a prerelease", () => {
    expect(isNewerVersion("0.5.0-beta.1", "0.4.0")).toBe(true);
    expect(isNewerVersion("0.4.0", "0.5.0-beta.1")).toBe(false);
  });

  it("more identifiers outrank fewer when the prefix matches", () => {
    expect(isNewerVersion("0.4.0-beta.1", "0.4.0-beta")).toBe(true);
    expect(isNewerVersion("0.4.0-beta", "0.4.0-beta.1")).toBe(false);
  });

  it("alphanumeric identifiers outrank numeric ones", () => {
    // semver 11.4.3: numeric identifiers always have lower precedence.
    expect(isNewerVersion("0.4.0-beta", "0.4.0-1")).toBe(true);
    expect(isNewerVersion("0.4.0-1", "0.4.0-beta")).toBe(false);
  });

  it("orders differing alphanumeric identifiers lexically", () => {
    expect(isNewerVersion("0.4.0-rc.1", "0.4.0-beta.1")).toBe(true);
    expect(isNewerVersion("0.4.0-beta.1", "0.4.0-rc.1")).toBe(false);
  });

  it("is false for identical prereleases", () => {
    expect(isNewerVersion("0.4.0-beta.1", "0.4.0-beta.1")).toBe(false);
  });
});

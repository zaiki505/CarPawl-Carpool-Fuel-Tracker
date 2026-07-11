import { describe, it, expect } from "vitest";
import { bareEtag, quotedEtag } from "./drive.js";

/* Regression coverage for the "Drive upload failed: 400" bug: Google returns
   an item's etag WITHOUT quotes from the JSON metadata field (create/patch
   responses) but WITH literal quote characters from the raw HTTP ETag header
   (download's alt=media response). Mixing formats produces a malformed
   If-Match/If-None-Match header that Google can reject with 400. */
describe("bareEtag", () => {
  it("strips surrounding quotes from a header-style etag", () => {
    expect(bareEtag('"abc123"')).toBe("abc123");
  });
  it("leaves an already-bare JSON-field-style etag unchanged", () => {
    expect(bareEtag("abc123")).toBe("abc123");
  });
  it("passes through null/undefined", () => {
    expect(bareEtag(null)).toBe(null);
    expect(bareEtag(undefined)).toBe(undefined);
  });
});

describe("quotedEtag", () => {
  it("wraps a bare etag in quotes for use as a header value", () => {
    expect(quotedEtag("abc123")).toBe('"abc123"');
  });
  it("does not double-quote an already-quoted value", () => {
    expect(quotedEtag('"abc123"')).toBe('"abc123"');
  });
  it("passes through null/undefined", () => {
    expect(quotedEtag(null)).toBe(null);
    expect(quotedEtag(undefined)).toBe(undefined);
  });
});

describe("bareEtag + quotedEtag round-trip", () => {
  it("is idempotent regardless of which format Google returned first", () => {
    const fromHeader = '"MTYzNDcyOTQ0OTQ3OA=="'; // download()'s raw ETag header
    const fromJsonField = "MTYzNDcyOTQ0OTQ3OA=="; // create()/patch()'s JSON field
    expect(bareEtag(fromHeader)).toBe(bareEtag(fromJsonField));
    expect(quotedEtag(bareEtag(fromHeader))).toBe(quotedEtag(bareEtag(fromJsonField)));
  });
});

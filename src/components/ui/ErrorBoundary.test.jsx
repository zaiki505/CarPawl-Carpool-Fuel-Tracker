// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary.jsx";

afterEach(cleanup);

function Boom() {
  throw new Error("kaboom");
}

describe("ErrorBoundary", () => {
  it("renders children normally when nothing throws", () => {
    render(
      <ErrorBoundary fallback={<p>fallback</p>}>
        <p>all good</p>
      </ErrorBoundary>
    );
    expect(screen.getByText("all good")).toBeInTheDocument();
    expect(screen.queryByText("fallback")).toBeNull();
  });

  it("renders the fallback instead of crashing when a child throws", () => {
    // React logs the caught error to console.error even when handled - silence
    // it for this test so the expected crash doesn't look like a test failure.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary fallback={<p>fallback shown</p>}>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByText("fallback shown")).toBeInTheDocument();
    spy.mockRestore();
  });

  it("isolates the crash - a sibling boundary's content stays mounted", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <div>
        <ErrorBoundary fallback={<p>broken card</p>}>
          <Boom />
        </ErrorBoundary>
        <ErrorBoundary fallback={<p>should not show</p>}>
          <p>healthy sibling</p>
        </ErrorBoundary>
      </div>
    );
    expect(screen.getByText("broken card")).toBeInTheDocument();
    expect(screen.getByText("healthy sibling")).toBeInTheDocument();
    spy.mockRestore();
  });
});

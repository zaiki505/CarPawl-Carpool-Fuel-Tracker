import React, { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../app/AppContext.jsx";
import { haptic } from "../lib/haptics.js";

/* First-run guided spotlight tour (part of onboarding #5). Runs over the real
   dashboard after setup: dims the screen, cuts a hole around one live UI element
   at a time, and explains it with a tooltip + Next/Back. It only points things
   out - it never forces a tap - so it can't get stuck on a mis-tap. Targets are
   the fixed FAB / nav plus the top dashboard cards, all visible on a fresh home
   screen. A missing target just falls back to a centered card. */

const STEPS = [
  {
    selector: ".fab-add",
    title: "Add a refuel or trip",
    body: "Tap here to log fuel in your own car, or a carpool trip you rode in. It's the main thing you'll do.",
    radius: 999,
    pad: 10,
  },
  {
    selector: ".stat-card",
    title: "Your balances at a glance",
    body: "These cards show what you're owed and what you owe. Tap any card for a full breakdown.",
    radius: 18,
    pad: 6,
  },
  {
    selector: ".bottom-nav__pill",
    title: "Getting around",
    body: "Switch between Home, your Vehicles, History and Settings from here.",
    radius: 999,
    pad: 8,
  },
  {
    selector: null,
    title: "You're all set",
    body: "You can revisit these concepts anytime in Settings → How it works. Happy tracking!",
  },
];

export function WalkthroughTour() {
  const { tourActive, endTour } = useApp();
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);

  const step = STEPS[i];
  const isLast = i === STEPS.length - 1;

  // Restart from the top each time a tour begins.
  useEffect(() => {
    if (tourActive) setI(0);
  }, [tourActive]);

  // Measure the current step's target after layout settles (two frames so the
  // dashboard has painted). Re-measures on step change and on resize.
  useLayoutEffect(() => {
    if (!tourActive) return;
    let raf1;
    let raf2;
    const measure = () => {
      const sel = STEPS[i]?.selector;
      if (!sel) {
        setRect(null);
        return;
      }
      const el = document.querySelector(sel);
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      const pad = STEPS[i].pad || 8;
      setRect({
        top: r.top - pad,
        left: r.left - pad,
        width: r.width + pad * 2,
        height: r.height + pad * 2,
      });
    };
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(measure);
    });
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.removeEventListener("resize", measure);
    };
  }, [tourActive, i]);

  if (!tourActive) return null;

  function finish() {
    setI(0);
    endTour();
  }
  function next() {
    haptic("selection");
    if (isLast) finish();
    else setI((n) => n + 1);
  }
  function back() {
    haptic("selection");
    setI((n) => Math.max(0, n - 1));
  }

  // Card sits below a top-half target, above a bottom-half one, centered if the
  // target is missing. Horizontal centering is handled in CSS (left/right +
  // margin auto) so it never fights the transform.
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  let cardStyle;
  if (!rect) {
    cardStyle = { top: "50%", transform: "translateY(-50%)" };
  } else if (rect.top < vh / 2) {
    cardStyle = { top: rect.top + rect.height + 14 };
  } else {
    cardStyle = { bottom: vh - rect.top + 14 };
  }

  return createPortal(
    <div className="tour" role="dialog" aria-modal="true" aria-label="Getting started tour">
      {rect ? (
        <div
          className="tour__spot"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            borderRadius: step.radius || 14,
          }}
        />
      ) : (
        <div className="tour__dim" />
      )}

      <div className="tour__card" style={cardStyle}>
        <div className="tour__dots" aria-hidden="true">
          {STEPS.map((_, k) => (
            <span key={k} className={"tour__dot" + (k === i ? " is-active" : "")} />
          ))}
        </div>
        <h3 className="tour__title">{step.title}</h3>
        <p className="tour__body">{step.body}</p>
        <div className="tour__actions">
          {!isLast ? (
            <button type="button" className="tour__skip" onClick={finish}>
              Skip
            </button>
          ) : (
            <span />
          )}
          <div className="tour__nav">
            {i > 0 && (
              <button type="button" className="cta-secondary" onClick={back}>
                Back
              </button>
            )}
            <button type="button" className="cta-primary" onClick={next}>
              {isLast ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

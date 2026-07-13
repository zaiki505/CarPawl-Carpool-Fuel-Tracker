import React, { useRef, useState } from "react";
import { GLOSSARY } from "../lib/glossary.js";
import {
  Car,
  MapPin,
  Users,
  SlidersHorizontal,
  Gauge,
  Wallet,
  RefreshCw,
  CalendarClock,
  Receipt,
  Repeat,
  Cloud,
  Info,
} from "./ui/Icons.jsx";
import { CONCEPT_ART } from "./ConceptArt.jsx";

/* A swipeable deck of the app's concepts (#8), replacing the old wall-of-text
   glossary. One card per concept: an icon, the term, a one-line summary, and a
   fuller explanation. Swipe horizontally (scroll-snap) or tap a dot to jump. */

// Each concept gets a matching icon. Falls back to Info if a key is unmapped.
const ICONS = {
  ownVsCarpool: Car,
  distanceSplit: MapPin,
  equalSplit: Users,
  customSplit: SlidersHorizontal,
  maintenanceMarkup: Gauge,
  credit: Wallet,
  creditOffset: RefreshCw,
  upcoming: CalendarClock,
  prepay: Receipt,
  recurring: Repeat,
  driveSync: Cloud,
};

export function ConceptCards({ keys }) {
  // `keys` optionally narrows the deck to a curated subset (used by onboarding);
  // otherwise show the whole glossary (the Settings "How it works" page).
  const entries = keys
    ? keys.map((k) => [k, GLOSSARY[k]]).filter(([, c]) => c)
    : Object.entries(GLOSSARY);
  const trackRef = useRef(null);
  const [active, setActive] = useState(0);

  // Track which card is centered so the dots stay in sync with a swipe.
  function onScroll() {
    const el = trackRef.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== active) setActive(i);
  }

  function goTo(i) {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  }

  return (
    <div className="concept-cards">
      <div className="concept-cards__track" ref={trackRef} onScroll={onScroll}>
        {entries.map(([key, c], i) => {
          const Icon = ICONS[key] || Info;
          const Art = CONCEPT_ART[key];
          return (
            <article className="concept-card" key={key}>
              <div className="concept-card__art">
                {Art ? (
                  <Art />
                ) : (
                  <span className="concept-card__icon">
                    <Icon size={22} />
                  </span>
                )}
              </div>
              <h3 className="concept-card__term">{c.term}</h3>
              <p className="concept-card__short">{c.short}</p>
              <span className="concept-card__count">
                {i + 1} / {entries.length}
              </span>
            </article>
          );
        })}
      </div>
      <div className="concept-cards__dots">
        {entries.map(([key], i) => (
          <button
            key={key}
            type="button"
            className={"concept-dot" + (i === active ? " is-active" : "")}
            onClick={() => goTo(i)}
            aria-label={`Go to concept ${i + 1}`}
            aria-current={i === active}
          />
        ))}
      </div>
    </div>
  );
}

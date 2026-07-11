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

export function ConceptCards() {
  const entries = Object.entries(GLOSSARY);
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
          return (
            <article className="concept-card" key={key}>
              <div className="concept-card__icon">
                <Icon size={22} />
              </div>
              <h3 className="concept-card__term">{c.term}</h3>
              <p className="concept-card__short">{c.short}</p>
              <p className="concept-card__long">{c.long}</p>
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

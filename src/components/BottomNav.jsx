import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useApp } from "../app/AppContext.jsx";
import { LayoutDashboard, Car, History, Settings, Plus } from "./ui/Icons.jsx";

const ITEMS = [
  { key: "dashboard", label: "Home", Icon: LayoutDashboard },
  { key: "groups", label: "Vehicles", Icon: Car },
  { key: "history", label: "History", Icon: History },
  { key: "settings", label: "Settings", Icon: Settings },
];

/* Bottom-fixed floating nav pill (6) - adapts the source's top nav pill: glass,
   pill radius, and a gliding squish-stretch active indicator that travels
   between items. A separate circular Add-Entry FAB floats above it. */
export function BottomNav({ onAdd }) {
  const { tab, goTab } = useApp();
  const itemRefs = useRef({});
  const [indStyle, setIndStyle] = useState(null);
  const [moving, setMoving] = useState(false);
  const firstRender = useRef(true);
  const [scrolling, setScrolling] = useState(false);
  const lastY = useRef(0);

  // Shrink the FAB on scroll-down (out of the way of whatever's underneath),
  // restore on scroll-up. Tapping it (see onClick below) also restores it.
  useEffect(() => {
    lastY.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y > lastY.current + 2) setScrolling(true);
      else if (y < lastY.current - 2) setScrolling(false);
      lastY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useLayoutEffect(() => {
    const el = itemRefs.current[tab];
    if (!el) return;
    const parent = el.parentElement;
    const p = parent.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    setIndStyle({ left: r.left - p.left, width: r.width });
    if (!firstRender.current) {
      setMoving(true);
      const t = setTimeout(() => setMoving(false), 520);
      return () => clearTimeout(t);
    }
    firstRender.current = false;
  }, [tab]);

  // Recalculate on resize so the indicator stays aligned.
  useEffect(() => {
    const onResize = () => {
      const el = itemRefs.current[tab];
      if (!el) return;
      const p = el.parentElement.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      setIndStyle({ left: r.left - p.left, width: r.width });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [tab]);

  return (
    <>
      <button
        className={"fab-add" + (scrolling ? " fab-add--scrolling" : "")}
        onClick={() => {
          setScrolling(false);
          onAdd();
        }}
        aria-label="Add refuel"
        type="button"
      >
        <Plus size={26} />
      </button>
      <nav className="bottom-nav" aria-label="Primary">
        <div className="bottom-nav__pill">
          {indStyle && (
            <span
              className={"bottom-nav__indicator" + (moving ? " is-moving" : "")}
              style={{ left: indStyle.left, width: indStyle.width }}
              aria-hidden="true"
            />
          )}
          {ITEMS.map(({ key, label, Icon }) => (
            <button
              key={key}
              ref={(el) => (itemRefs.current[key] = el)}
              className="bottom-nav__item"
              aria-current={tab === key ? "page" : undefined}
              onClick={() => goTab(key)}
              type="button"
            >
              <Icon size={22} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}

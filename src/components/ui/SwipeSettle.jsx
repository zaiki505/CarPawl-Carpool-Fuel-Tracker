import React, { useRef, useState } from "react";
import { Check, X } from "./Icons.jsx";
import { haptic } from "../../lib/haptics.js";

/* Swipe a passenger row to act on it. Left reveals a green "Settle" backing that
   fires onSettle on release (#8). Right reveals a red backing with an X that
   latches open, so clearing their payments takes a deliberate second tap and
   never fires by accident. Both sides are optional. */
export function SwipeSettle({ onSettle, onDelete, children }) {
  const [dx, setDx] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const dxRef = useRef(0); // synchronous, so pointerup reads the latest offset
  const startX = useRef(null);
  const dragging = useRef(false);
  const THRESH = 72;
  const MAX = 118;

  const setOffset = (v) => {
    dxRef.current = v;
    setDx(v);
  };
  const reset = () => {
    setConfirming(false);
    setOffset(0);
  };

  const down = (e) => {
    if (confirming) return; // latched open - only the X or a tap-cancel act now
    startX.current = e.clientX;
    dragging.current = true;
  };
  const move = (e) => {
    if (!dragging.current || startX.current == null) return;
    const d = e.clientX - startX.current;
    const lo = onSettle ? -MAX : 0;
    const hi = onDelete ? MAX : 0;
    setOffset(Math.max(lo, Math.min(hi, d)));
  };
  const end = () => {
    if (!dragging.current) return;
    dragging.current = false;
    startX.current = null;
    const d = dxRef.current;
    if (d <= -THRESH && onSettle) {
      haptic("medium");
      setOffset(-MAX);
      window.setTimeout(() => {
        onSettle();
        setOffset(0);
      }, 140);
    } else if (d >= THRESH && onDelete) {
      haptic("light");
      setConfirming(true);
      setOffset(MAX);
    } else {
      setOffset(0);
    }
  };

  const settleArmed = dx <= -THRESH;

  return (
    <div className="swipe-settle">
      {onSettle && (
        <div
          className={"swipe-settle__bg" + (settleArmed ? " is-armed" : "")}
          style={{ opacity: dx < 0 ? 1 : 0 }}
        >
          <Check size={16} /> Settle
        </div>
      )}
      {onDelete && (
        <div
          className="swipe-settle__bg swipe-settle__bg--delete"
          style={{ opacity: dx > 0 ? 1 : 0 }}
        >
          <button
            type="button"
            className="swipe-settle__x"
            onClick={() => {
              onDelete();
              reset();
            }}
          >
            <X size={15} /> Clear
          </button>
        </div>
      )}
      <div
        className="swipe-settle__fg"
        style={{
          transform: `translateX(${dx}px)`,
          transition: dragging.current ? "none" : "transform 0.28s var(--ease-bounce)",
        }}
        onClick={(e) => {
          if (confirming) {
            e.stopPropagation();
            reset();
          }
        }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={end}
      >
        {children}
      </div>
    </div>
  );
}

import React, { useState } from "react";
import { Sheet } from "./ui/Sheet.jsx";
import { ConceptCards } from "./ConceptCards.jsx";
import { Info, ChevronRight } from "./ui/Icons.jsx";

/* "How it works" - opens the concept-card deck in its own bottom sheet
   (BATCH_3 #1), instead of showing the cards inline on the About page. */
export function HowItWorksButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="about-row" type="button" onClick={() => setOpen(true)}>
        <span className="about-row__lead">
          <Info size={16} />
          How it works
        </span>
        <ChevronRight size={16} className="about-row__chev" />
      </button>

      {open && (
        <Sheet title="How it works" onClose={() => setOpen(false)} manageBack>
          <p className="field-hint" style={{ marginTop: 0, marginBottom: "0.6rem" }}>
            Swipe through the terms CarPawl uses.
          </p>
          <ConceptCards />
        </Sheet>
      )}
    </>
  );
}

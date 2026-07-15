import React, { useState } from "react";
import { Sheet } from "./ui/Sheet.jsx";
import { fetchLatestRelease, RELEASES_URL } from "../lib/updateCheck.js";
import { History as HistoryIcon, ChevronRight } from "./ui/Icons.jsx";

/* "What's new" - fetches the latest GitHub release notes and shows them in a
   sheet (#7). Notes are Markdown from the release body; we render them as
   pre-wrapped text (no heavy Markdown lib), which keeps the bullet/heading
   layout readable. Falls back to a GitHub link if the fetch fails. */
export function WhatsNewButton() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | loading | loaded | error
  const [rel, setRel] = useState(null);

  async function show() {
    setOpen(true);
    if (status === "loaded") return;
    setStatus("loading");
    const r = await fetchLatestRelease();
    if (r) {
      setRel(r);
      setStatus("loaded");
    } else {
      setStatus("error");
    }
  }

  return (
    <>
      <button className="about-row" type="button" onClick={show}>
        <span className="about-row__lead">
          <HistoryIcon size={16} />
          What's new
        </span>
        <ChevronRight size={16} className="about-row__chev" />
      </button>

      {open && (
        <Sheet title="What's new" onClose={() => setOpen(false)} manageBack>
          {status === "loading" && (
            <p className="field-hint" style={{ marginTop: 0 }}>
              Loading release notes…
            </p>
          )}
          {status === "error" && (
            <p className="field-hint" style={{ marginTop: 0 }}>
              Couldn't load the release notes right now.{" "}
              <a href={RELEASES_URL} target="_blank" rel="noreferrer">
                Open on GitHub
              </a>
              .
            </p>
          )}
          {status === "loaded" && rel && (
            <div className="whats-new">
              <h3 className="whats-new__title">
                {rel.version ? `v${rel.version}` : rel.name}
              </h3>
              <pre className="whats-new__notes">
                {rel.notes.trim() || "No notes for this release."}
              </pre>
              <a
                className="cta-secondary btn-block"
                href={rel.url}
                target="_blank"
                rel="noreferrer"
              >
                View full release on GitHub
              </a>
            </div>
          )}
        </Sheet>
      )}
    </>
  );
}

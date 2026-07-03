import React from "react";
import { useAllData } from "../db/hooks.js";
import { useApp } from "../app/AppContext.jsx";
import { GroupCard } from "../components/GroupCard.jsx";
import { EmptyState } from "../components/ui/Primitives.jsx";
import { Plus } from "../components/ui/Icons.jsx";

/* Groups screen (§7.2) - My Vehicle(s) and Carpools in two separate sections,
   never one flat list. "+ Add group" opens the ownership-aware create sheet. */
export function Groups() {
  const data = useAllData();
  const { openGroup, openSheet } = useApp();
  if (!data) return <div className="app-shell" />;

  const { ownedGroups, nonOwnedGroups, entriesByGroup, payments, peopleMap } = data;

  return (
    <div className="app-shell stagger">
      <header className="screen-head">
        <div>
          <p className="screen-head__kicker">Your vehicles & carpools</p>
          <h1 className="screen-head__title">Groups</h1>
        </div>
        <button
          className="cta-primary"
          type="button"
          onClick={() => openSheet({ type: "createGroup" })}
          style={{ padding: "0.6rem 1rem" }}
        >
          <Plus size={16} /> Add
        </button>
      </header>

      <section className="section-block">
        <h2 className="section-block__title" style={{ marginBottom: "0.75rem" }}>
          My Vehicle(s)
        </h2>
        {ownedGroups.length === 0 ? (
          <EmptyState emoji="🚗" title="No cars yet">
            Tap “Add” and choose “Mine” to register your first car.
          </EmptyState>
        ) : (
          ownedGroups.map((g) => (
            <GroupCard
              key={g.id}
              group={g}
              entries={entriesByGroup[g.id]}
              payments={payments}
              peopleMap={peopleMap}
              onOpen={openGroup}
            />
          ))
        )}
      </section>

      <section className="section-block">
        <h2 className="section-block__title" style={{ marginBottom: "0.75rem" }}>
          Carpools
        </h2>
        {nonOwnedGroups.length === 0 ? (
          <EmptyState emoji="🧑‍🤝‍🧑" title="No carpools yet">
            Riding in someone else's car? Add a group and choose “Someone
            else's” to track your share.
          </EmptyState>
        ) : (
          nonOwnedGroups.map((g) => (
            <GroupCard
              key={g.id}
              group={g}
              entries={entriesByGroup[g.id]}
              payments={payments}
              peopleMap={peopleMap}
              onOpen={openGroup}
            />
          ))
        )}
      </section>
    </div>
  );
}

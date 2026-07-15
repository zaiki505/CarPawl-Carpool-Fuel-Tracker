import React from "react";
import { useAllData } from "../db/hooks.js";
import { useApp } from "../app/AppContext.jsx";
import { GroupCard } from "../components/GroupCard.jsx";
import { EmptyState } from "../components/ui/Primitives.jsx";
import { ScreenLoading } from "../components/ui/ScreenLoading.jsx";

/* Groups screen (7.2) - My Vehicle(s) and Carpools in two separate sections.
"+ Add group" opens the ownership aware create sheet. */
export function Groups() {
  const data = useAllData();
  const { openGroup, openSheet } = useApp();
  if (!data) return <ScreenLoading />;

  const { ownedGroups, nonOwnedGroups, entriesByGroup, payments, peopleMap } = data;

  return (
    <div className="app-shell stagger">
      <header className="screen-head">
        <div className="head-morph">
          <p className="screen-head__kicker">Your vehicles & carpools</p>
          <h1 className="screen-head__title">Vehicles</h1>
        </div>
      </header>

      <section className="section-block">
        <h2 className="section-block__title" style={{ marginBottom: "0.75rem" }}>
          My Vehicle(s)
        </h2>
        {ownedGroups.length === 0 ? (
          <EmptyState
            emoji="🚗"
            title="No cars yet"
            actionLabel="+ Add your car"
            onAction={() => openSheet({ type: "createGroup" })}
          >
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
          <EmptyState
            emoji="🧑‍🤝‍🧑"
            title="No carpools yet"
            actionLabel="+ Add a carpool"
            onAction={() => openSheet({ type: "createGroup", ownerType: "person" })}
          >
            Riding in someone else's car? Add a vehicle and choose “Someone
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

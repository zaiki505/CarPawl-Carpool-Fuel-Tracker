import React from "react";
import { Background } from "./Background.jsx";
import { BottomNav } from "./BottomNav.jsx";
import { Toasts } from "./ui/Toasts.jsx";
import { ConfirmModal } from "./ui/ConfirmModal.jsx";
import { Sheet } from "./ui/Sheet.jsx";
import { PaymentSheet } from "./PaymentSheet.jsx";
import { AddEntrySheet } from "./AddEntrySheet.jsx";
import { GroupForm } from "./GroupForm.jsx";
import { SelectionBar } from "./SelectionBar.jsx";
import { ApplyCreditSheet } from "./ApplyCreditSheet.jsx";
import { WalkthroughTour } from "./WalkthroughTour.jsx";
import { SyncStatusCard } from "./SyncStatusCard.jsx";
import { useApp } from "../app/AppContext.jsx";
import { useSettings, usePeopleMap } from "../db/hooks.js";
import { setFormatConfig } from "../lib/format.js";
import { Dashboard } from "../screens/Dashboard.jsx";
import { Groups } from "../screens/Groups.jsx";
import { GroupDetail } from "../screens/GroupDetail.jsx";
import { Onboarding } from "../screens/Onboarding.jsx";
import { History } from "../screens/History.jsx";
import { Settings } from "../screens/Settings.jsx";

/* The persistent app frame: background, the active screen (or detail overlay),
   bottom nav + FAB, and all overlays (sheets, confirm modal, toasts). Gates on
   onboarding - first run drops straight into "add your car". */
export function AppFrame() {
  const { tab, detail, sheet, openSheet, closeSheet, goTab } = useApp();
  const settings = useSettings();
  const peopleMap = usePeopleMap();

  // Apply currency/date-format config synchronously before children render, so
  // every formatted value reflects the user's Settings choices immediately.
  if (settings) setFormatConfig(settings);

  // While settings load, render just the background to avoid a flash.
  if (settings === undefined) return <Background />;

  if (!settings?.onboardedAt) {
    return (
      <>
        <Background />
        <Onboarding onDone={() => goTab("dashboard")} />
        <Toasts />
      </>
    );
  }

  let screen;
  if (detail?.type === "group") {
    screen = <GroupDetail groupId={detail.id} />;
  } else if (tab === "dashboard") {
    screen = <Dashboard />;
  } else if (tab === "groups") {
    screen = <Groups />;
  } else if (tab === "history") {
    screen = <History />;
  } else {
    screen = <Settings />;
  }

  return (
    <>
      <Background />
      {screen}
      <BottomNav
        // The add-refuel FAB only belongs on Home, Vehicles and History (and a
        // vehicle's own page, which lives under Vehicles) - not on Settings.
        showAdd={tab !== "settings"}
        // On the Vehicles LIST the FAB adds a vehicle (car icon, #2/#10); on a
        // vehicle's own page it stays the round refuel "+".
        addKind={tab === "groups" && !detail ? "vehicle" : "entry"}
        onAdd={() =>
          tab === "groups" && !detail
            ? openSheet({ type: "createGroup" })
            : openSheet({
                type: "addEntry",
                // On a vehicle's page, pre-select that vehicle (§16).
                groupId: detail?.type === "group" ? detail.id : undefined,
              })
        }
      />

      {sheet?.type === "createGroup" && (
        <Sheet title="Add a vehicle" onClose={closeSheet}>
          <GroupForm mode="create" defaultOwnerType={sheet.ownerType} onDone={closeSheet} />
        </Sheet>
      )}

      {sheet?.type === "payment" && (
        <PaymentSheet
          entry={sheet.entry}
          who={sheet.who}
          payment={sheet.payment}
          peopleMap={peopleMap}
          ownedByMe={sheet.ownedByMe}
          onClose={closeSheet}
        />
      )}

      {sheet?.type === "addEntry" && (
        <AddEntrySheet
          entryId={sheet.entryId}
          preselectGroupId={sheet.groupId}
          duplicateOf={sheet.duplicateOf}
          focusField={sheet.focusField}
          multiEntries={sheet.multiEntries}
          onClose={closeSheet}
        />
      )}

      {sheet?.type === "applyCredit" && (
        <ApplyCreditSheet
          groupId={sheet.groupId}
          debtorWho={sheet.debtorWho}
          creditorWho={sheet.creditorWho}
          onClose={closeSheet}
        />
      )}

      {/* App-wide floating Drive-sync status card (BATCH_3 #3) - shows on every
          tab, toggleable from the Drive-sync settings. */}
      <SyncStatusCard />
      <SelectionBar />
      <ConfirmModal />
      <WalkthroughTour />
      <Toasts />
    </>
  );
}

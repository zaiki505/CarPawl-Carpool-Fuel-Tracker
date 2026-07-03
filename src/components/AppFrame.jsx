import React from "react";
import { Background } from "./Background.jsx";
import { BottomNav } from "./BottomNav.jsx";
import { Toasts } from "./ui/Toasts.jsx";
import { ConfirmModal } from "./ui/ConfirmModal.jsx";
import { Sheet } from "./ui/Sheet.jsx";
import { PaymentSheet } from "./PaymentSheet.jsx";
import { AddEntrySheet } from "./AddEntrySheet.jsx";
import { GroupForm } from "./GroupForm.jsx";
import { useApp } from "../app/AppContext.jsx";
import { useSettings, usePeopleMap } from "../db/hooks.js";
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
      <BottomNav onAdd={() => openSheet({ type: "addEntry" })} />

      {sheet?.type === "createGroup" && (
        <Sheet title="Add a group" onClose={closeSheet}>
          <GroupForm mode="create" onDone={closeSheet} />
        </Sheet>
      )}

      {sheet?.type === "payment" && (
        <PaymentSheet
          entry={sheet.entry}
          who={sheet.who}
          payment={sheet.payment}
          peopleMap={peopleMap}
          onClose={closeSheet}
        />
      )}

      {sheet?.type === "addEntry" && (
        <AddEntrySheet entryId={sheet.entryId} onClose={closeSheet} />
      )}

      <ConfirmModal />
      <Toasts />
    </>
  );
}

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { haptic } from "../lib/haptics.js";

/* App-wide UI state: which tab is active, the current detail screen (Group
   Detail), the active bottom sheet, a confirmation modal, and transient toasts.
   Kept deliberately small - one place for all overlay/navigation state so the
   Android hardware-back button can close overlays consistently. */

const AppCtx = createContext(null);

let toastSeq = 0;
// Cap the visible stack of toasts
const MAX_TOASTS = 3;

export function AppProvider({ children }) {
  const [tab, setTab] = useState("dashboard");
  const [detail, setDetail] = useState(null); // { type: 'group', id }
  const [sheet, setSheet] = useState(null); // { type, props }
  const [confirm, setConfirm] = useState(null); // { ...opts, resolve }
  const [toasts, setToasts] = useState([]);
  // Multi-select of entry cards (id -> entry). Non-empty = selection mode.
  const [selectedEntries, setSelectedEntries] = useState(() => new Map());
  // First-run guided tour (spotlight walkthrough) running over the dashboard.
  const [tourActive, setTourActive] = useState(false);
  const startTour = useCallback(() => setTourActive(true), []);
  const endTour = useCallback(() => setTourActive(false), []);

  const confirmResolver = useRef(null);

  // ---- Entry multi-select ----
  const selectionMode = selectedEntries.size > 0;
  const selectEntry = useCallback((entry) => {
    setSelectedEntries((prev) => {
      if (prev.has(entry.id)) return prev;
      const m = new Map(prev);
      m.set(entry.id, entry);
      return m;
    });
    haptic("selection");
  }, []);
  const toggleSelectEntry = useCallback((entry) => {
    setSelectedEntries((prev) => {
      const m = new Map(prev);
      if (m.has(entry.id)) m.delete(entry.id);
      else m.set(entry.id, entry);
      return m;
    });
  }, []);
  const clearSelection = useCallback(() => setSelectedEntries(new Map()), []);

  // ---- Toasts ----
  const dismissToast = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);
  const toast = useCallback(
    (message, state = "success", ms = 2600) => {
      const id = ++toastSeq;
      setToasts((t) => [...t, { id, message, state }].slice(-MAX_TOASTS));
      if (ms > 0) window.setTimeout(() => dismissToast(id), ms);
      // Every toast in the app routes through here.
      haptic(state === "error" ? "error" : state === "warning" ? "warning" : "success");
      return id;
    },
    [dismissToast]
  );

  // ---- Navigation ----
  const goTab = useCallback((t) => {
    setDetail(null);
    setSheet(null);
    setSelectedEntries(new Map()); // leaving the screen exits selection mode
    setTab(t);
  }, []);

  const openGroup = useCallback((id) => setDetail({ type: "group", id }), []);
  const openSheet = useCallback((s) => setSheet(s), []);
  const closeSheet = useCallback(() => setSheet(null), []);

  // ---- Confirmation modal (promise-based) ----
  const askConfirm = useCallback((opts) => {
    return new Promise((resolve) => {
      confirmResolver.current = resolve;
      setConfirm({
        title: opts.title || "Are you sure?",
        body: opts.body || "",
        confirmLabel: opts.confirmLabel || "Confirm",
        cancelLabel: opts.cancelLabel || "Cancel",
        danger: Boolean(opts.danger),
      });
    });
  }, []);
  const resolveConfirm = useCallback((value) => {
    setConfirm(null);
    const r = confirmResolver.current;
    confirmResolver.current = null;
    if (r) r(value);
  }, []);

  // ---- Generic overlay stack ----
  // Sheets rendered from a screen's own state (breakdown, trip-picker) aren't
  // the app-level `sheet`, so they register here to take part in hardware-back.
  // Each entry's onClose is called (topmost first) when back is pressed.
  const [overlays, setOverlays] = useState([]); // [{ id, onClose }]
  const overlaySeq = useRef(0);
  const openOverlay = useCallback((onClose) => {
    const id = ++overlaySeq.current;
    setOverlays((o) => [...o, { id, onClose }]);
    return id;
  }, []);
  const closeOverlay = useCallback((id) => {
    setOverlays((o) => o.filter((x) => x.id !== id));
  }, []);

  // ---- Hardware/gesture back closes the topmost overlay ----
  // One history entry is pushed per open overlay layer, so each hardware-back
  // press closes exactly one layer and entries never leak: closing a layer via
  // the UI consumes its entry with history.back(). closing via the back button
  // lets the browser consume it. selfPopRef counts the synthetic back()
  // calls so the popstate handler skips them instead of double-closing.
  const overlayDepth =
    (detail ? 1 : 0) + (sheet ? 1 : 0) + (confirm ? 1 : 0) + overlays.length;
  const historyDepthRef = useRef(0);
  const selfPopRef = useRef(0);

  useEffect(() => {
    const cur = overlayDepth;
    const hist = historyDepthRef.current;
    if (cur > hist) {
      for (let i = 0; i < cur - hist; i++) {
        window.history.pushState({ carpawlOverlay: true }, "");
      }
      historyDepthRef.current = cur;
    } else if (cur < hist) {
      // Overlays were closed via the UI.
      const toPop = hist - cur;
      historyDepthRef.current = cur;
      for (let i = 0; i < toPop; i++) {
        selfPopRef.current += 1;
        window.history.back();
      }
    }
  }, [overlayDepth]);

  useEffect(() => {
    const onPop = () => {
      if (selfPopRef.current > 0) {
        // history.back() cleanup; state already reflects the close.
        selfPopRef.current -= 1;
        return;
      }
      // A real hardware/gesture back consumed one entry - close the topmost
      // overlay to match (priority: registered overlays > confirm > sheet > detail).
      historyDepthRef.current = Math.max(0, historyDepthRef.current - 1);
      if (overlays.length) {
        overlays[overlays.length - 1].onClose();
      } else if (confirm) {
        resolveConfirm(false);
      } else if (sheet) {
        setSheet(null);
      } else if (detail) {
        setDetail(null);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [confirm, sheet, detail, overlays, resolveConfirm]);

  // Android hardware back / gesture. Without this, Capacitor's default is to
  // exit straight to the homescreen even with a sheet open. We route it through
  // the SAME history/popstate flow the web back gesture uses: if any overlay is
  // open, go back one entry (closes the topmost layer); only exit the app when
  // there's nothing left to close. Registered once; reads live state via a ref.
  const navStateRef = useRef({ confirm, sheet, detail, selectionMode, overlaysOpen: false });
  navStateRef.current = { confirm, sheet, detail, selectionMode, overlaysOpen: overlays.length > 0 };
  // A screen can register a handler to intercept hardware-back when no overlay
  // is open (e.g. Settings uses it to step back from a category to the list
  // instead of exiting the app). It returns true if it handled the press.
  const backHandlerRef = useRef(null);
  const setBackHandler = useCallback((fn) => {
    backHandlerRef.current = fn;
  }, []);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let handle;
    CapApp.addListener("backButton", () => {
      const { confirm, sheet, detail, selectionMode, overlaysOpen } = navStateRef.current;
      if (selectionMode) {
        clearSelection();
      } else if (overlaysOpen || confirm || sheet || detail) {
        window.history.back();
      } else if (backHandlerRef.current && backHandlerRef.current()) {
        // a screen consumed the back press
      } else {
        CapApp.exitApp();
      }
    }).then((h) => {
      handle = h;
    });
    return () => handle?.remove();
  }, []);

  const back = useCallback(() => {
    if (overlays.length) overlays[overlays.length - 1].onClose();
    else if (confirm) resolveConfirm(false);
    else if (sheet) setSheet(null);
    else if (detail) setDetail(null);
  }, [overlays, confirm, sheet, detail, resolveConfirm]);

  const value = useMemo(
    () => ({
      tab,
      detail,
      sheet,
      confirm,
      toasts,
      goTab,
      openGroup,
      openSheet,
      closeSheet,
      back,
      setBackHandler,
      askConfirm,
      resolveConfirm,
      toast,
      dismissToast,
      selectedEntries,
      selectionMode,
      selectEntry,
      toggleSelectEntry,
      clearSelection,
      openOverlay,
      closeOverlay,
      tourActive,
      startTour,
      endTour,
    }),
    [
      tab,
      detail,
      sheet,
      confirm,
      toasts,
      goTab,
      openGroup,
      openSheet,
      closeSheet,
      back,
      setBackHandler,
      askConfirm,
      resolveConfirm,
      toast,
      dismissToast,
      selectedEntries,
      selectionMode,
      selectEntry,
      toggleSelectEntry,
      clearSelection,
      openOverlay,
      closeOverlay,
      tourActive,
      startTour,
      endTour,
    ]
  );

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}

/** Like useApp but returns null instead of throwing when no provider is present
 *  (e.g. an EntryCard rendered in isolation in a unit test). */
export function useAppOptional() {
  return useContext(AppCtx);
}

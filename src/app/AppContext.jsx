import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/* App-wide UI state: which tab is active, the current detail screen (Group
   Detail), the active bottom sheet, a confirmation modal, and transient toasts.
   Kept deliberately small - one place for all overlay/navigation state so the
   Android hardware-back button can close overlays consistently. */

const AppCtx = createContext(null);

export const TABS = ["dashboard", "groups", "history", "settings"];

let toastSeq = 0;

export function AppProvider({ children }) {
  const [tab, setTab] = useState("dashboard");
  const [detail, setDetail] = useState(null); // { type: 'group', id }
  const [sheet, setSheet] = useState(null); // { type, props }
  const [confirm, setConfirm] = useState(null); // { ...opts, resolve }
  const [toasts, setToasts] = useState([]);

  const confirmResolver = useRef(null);

  // ---- Toasts ----
  const dismissToast = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);
  const toast = useCallback(
    (message, state = "success", ms = 2600) => {
      const id = ++toastSeq;
      setToasts((t) => [...t, { id, message, state }]);
      if (ms > 0) window.setTimeout(() => dismissToast(id), ms);
      return id;
    },
    [dismissToast]
  );

  // ---- Navigation ----
  const goTab = useCallback((t) => {
    setDetail(null);
    setSheet(null);
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

  // ---- Hardware/gesture back closes the topmost overlay ----
  const anyOverlay = Boolean(sheet || confirm || detail);
  const prevOverlay = useRef(false);
  useEffect(() => {
    if (anyOverlay && !prevOverlay.current) {
      window.history.pushState({ carpawlOverlay: true }, "");
    }
    prevOverlay.current = anyOverlay;
  }, [anyOverlay]);

  useEffect(() => {
    const onPop = () => {
      // Close in priority order; only one typically open at a time.
      if (confirm) {
        resolveConfirm(false);
      } else if (sheet) {
        setSheet(null);
      } else if (detail) {
        setDetail(null);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [confirm, sheet, detail, resolveConfirm]);

  const back = useCallback(() => {
    if (confirm) resolveConfirm(false);
    else if (sheet) setSheet(null);
    else if (detail) setDetail(null);
  }, [confirm, sheet, detail, resolveConfirm]);

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
      askConfirm,
      resolveConfirm,
      toast,
      dismissToast,
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
      askConfirm,
      resolveConfirm,
      toast,
      dismissToast,
    ]
  );

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}

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

let toastSeq = 0;
// Cap the visible stack of toasts
const MAX_TOASTS = 3;

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
      setToasts((t) => [...t, { id, message, state }].slice(-MAX_TOASTS));
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
  // One history entry is pushed per open overlay layer, so each hardware-back
  // press closes exactly one layer and entries never leak: closing a layer via
  // the UI consumes its entry with history.back(). closing via the back button
  // lets the browser consume it. selfPopRef counts the synthetic back()
  // calls so the popstate handler skips them instead of double-closing.
  const overlayDepth = (detail ? 1 : 0) + (sheet ? 1 : 0) + (confirm ? 1 : 0);
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
      // overlay to match (priority order: confirm > sheet > detail).
      historyDepthRef.current = Math.max(0, historyDepthRef.current - 1);
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

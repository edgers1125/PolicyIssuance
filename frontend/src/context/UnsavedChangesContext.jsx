import { createContext, useCallback, useContext, useEffect, useRef } from "react";

const UnsavedChangesContext = createContext(null);

// Tracks which forms/dialogs currently hold unsaved input, app-wide, so
// in-app navigation (the sidebar) and the browser itself (refresh/close tab)
// can warn before it's discarded. More than one form can be dirty at once
// (e.g. a wizard open behind a nested edit dialog), so this is a set of
// dirty ids rather than a single flag — the warning fires whenever the set
// is non-empty. Kept in a ref (not state) since nothing needs to re-render
// when dirtiness changes; it's only ever read at the moment of a navigation
// attempt or an unload.
export function UnsavedChangesProvider({ children }) {
  const dirtyIdsRef = useRef(new Set());

  const setDirty = useCallback((id, isDirty) => {
    if (isDirty) dirtyIdsRef.current.add(id);
    else dirtyIdsRef.current.delete(id);
  }, []);

  const isAnyDirty = useCallback(() => dirtyIdsRef.current.size > 0, []);

  // Confirms an in-app navigation (sidebar link, a programmatic navigate())
  // — returns true when it's safe to proceed. window.confirm is the
  // simplest cross-browser way to get a synchronous yes/no without building
  // a custom modal that would itself have to interrupt the navigation.
  const confirmNavigation = useCallback(() => {
    if (!isAnyDirty()) return true;
    return window.confirm("You have unsaved changes that will be lost if you leave this page. Continue?");
  }, [isAnyDirty]);

  useEffect(() => {
    function handleBeforeUnload(e) {
      if (!isAnyDirty()) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isAnyDirty]);

  return (
    <UnsavedChangesContext.Provider value={{ setDirty, isAnyDirty, confirmNavigation }}>
      {children}
    </UnsavedChangesContext.Provider>
  );
}

function useUnsavedChangesGuard() {
  const ctx = useContext(UnsavedChangesContext);
  if (!ctx) throw new Error("useUnsavedChangesGuard must be used within UnsavedChangesProvider");
  return ctx;
}

// Registers `isDirty` under a stable `id` for as long as the calling
// component is mounted and unregisters it automatically on unmount, so a
// closed (and possibly since-unmounted) form never leaves a stale dirty flag
// behind. Callers should fold their own "is this dialog even open" state
// into `isDirty` themselves (e.g. `open && hasUnsavedInput`) — closing a
// dialog (even though its draft is kept in memory, see the dialogs
// themselves) means the user isn't actively filling it out any more, so it
// shouldn't keep blocking navigation.
export function useUnsavedChanges(id, isDirty) {
  const { setDirty } = useUnsavedChangesGuard();
  useEffect(() => {
    setDirty(id, isDirty);
    return () => setDirty(id, false);
  }, [id, isDirty, setDirty]);
}

// Returns confirmNavigation() — call it before any in-app navigation that
// might discard a dirty form (sidebar links, a manual navigate()); it shows
// a confirm prompt and returns whether it's safe to proceed.
export function useNavigationGuard() {
  const { confirmNavigation } = useUnsavedChangesGuard();
  return confirmNavigation;
}

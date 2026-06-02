import React, { createContext, useContext, useState, useCallback } from 'react';

// ── LoaderActiveContext ───────────────────────────────────────────────────────
//
// Allows any child page (DepthInterview, Questionnaire, PopulationBuilder) to
// signal upward to ResearchObjectiveLayout that a blocking loader overlay is
// currently visible, so the layout can hide the Back button in StepSidebar
// and prevent the user from navigating away mid-process.
//
// Usage in a child page:
//
//   const { setLoaderActive } = useLoaderActive();
//
//   // When showing the loader:
//   useEffect(() => { setLoaderActive(showLoader); }, [showLoader]);
//
//   // Or on unmount, always clear:
//   useEffect(() => () => setLoaderActive(false), []);
//
// ─────────────────────────────────────────────────────────────────────────────

interface LoaderActiveContextValue {
  loaderActive: boolean;
  setLoaderActive: (active: boolean) => void;
}

const LoaderActiveContext = createContext<LoaderActiveContextValue>({
  loaderActive: false,
  setLoaderActive: () => {},
});

export const LoaderActiveProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loaderActive, setLoaderActiveState] = useState(false);

  const setLoaderActive = useCallback((active: boolean) => {
    setLoaderActiveState(active);
  }, []);

  return (
    <LoaderActiveContext.Provider value={{ loaderActive, setLoaderActive }}>
      {children}
    </LoaderActiveContext.Provider>
  );
};

export const useLoaderActive = () => useContext(LoaderActiveContext);
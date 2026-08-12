import { createContext, useContext } from 'react';

const LayoutContext = createContext({ openMobileNav: () => {} });

export function LayoutProvider({ openMobileNav, children }: { openMobileNav: () => void; children: React.ReactNode }) {
  return <LayoutContext.Provider value={{ openMobileNav }}>{children}</LayoutContext.Provider>;
}

export function useLayout() {
  return useContext(LayoutContext);
}

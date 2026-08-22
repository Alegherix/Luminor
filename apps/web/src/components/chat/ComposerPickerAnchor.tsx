// FILE: ComposerPickerAnchor.tsx
// Purpose: Shared anchor for composer-attached picker popovers so menus open above the
//          composer dialog instead of each individual footer trigger.
// Layer: Chat composer layout
// Exports: ComposerPickerAnchorProvider, useComposerPickerAnchor

import { createContext, useContext, type ReactNode, type RefObject } from "react";

const ComposerPickerAnchorContext = createContext<RefObject<HTMLElement | null> | null>(null);

interface ComposerPickerAnchorProviderProps {
  anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
}

export function ComposerPickerAnchorProvider({
  anchorRef,
  children,
}: ComposerPickerAnchorProviderProps) {
  return (
    <ComposerPickerAnchorContext.Provider value={anchorRef}>
      {children}
    </ComposerPickerAnchorContext.Provider>
  );
}

export function useComposerPickerAnchor(): RefObject<HTMLElement | null> | null {
  return useContext(ComposerPickerAnchorContext);
}

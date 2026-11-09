import { create } from 'zustand';

/**
 * UI-local state (not part of the app store contract): which selection the user has closed the
 * info card for. Closing the card keeps the selection (and the camera) where it is; selecting any
 * row again — including the same one — reopens it.
 */
interface CardState {
  dismissedId: string | null;
  dismiss(id: string): void;
  reopen(): void;
}

export const useCardState = create<CardState>()((set) => ({
  dismissedId: null,
  dismiss: (dismissedId) => set({ dismissedId }),
  reopen: () => set({ dismissedId: null }),
}));

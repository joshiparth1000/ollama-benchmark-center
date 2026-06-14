import { create } from "zustand";

type UiState = {
  activeRunId: string | null;
  setActiveRunId: (runId: string | null) => void;
};

export const useUiStore = create<UiState>((set) => ({
  activeRunId: null,
  setActiveRunId: (activeRunId) => set({ activeRunId })
}));

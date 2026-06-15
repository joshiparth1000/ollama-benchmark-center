import { create } from "zustand";

type UiState = {
  selectedHostId: string | null;
  selectedRunId: string | null;
  expandedHostIds: string[];
  runningPopoverOpen: boolean;
  selectHost: (hostId: string | null) => void;
  selectRun: (runId: string | null) => void;
  toggleHostExpanded: (hostId: string) => void;
  setRunningPopoverOpen: (open: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  selectedHostId: null,
  selectedRunId: null,
  expandedHostIds: [],
  runningPopoverOpen: false,
  selectHost: (selectedHostId) => set({ selectedHostId, selectedRunId: null }),
  selectRun: (selectedRunId) => set({ selectedRunId }),
  toggleHostExpanded: (hostId) =>
    set((state) => ({
      expandedHostIds: state.expandedHostIds.includes(hostId)
        ? state.expandedHostIds.filter((id) => id !== hostId)
        : [...state.expandedHostIds, hostId]
    })),
  setRunningPopoverOpen: (runningPopoverOpen) => set({ runningPopoverOpen })
}));

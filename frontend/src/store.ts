import { create } from "zustand";

type UiState = {
  selectedHostId: string | null;
  selectedRunId: string | null;
  expandedHostIds: string[];
  runningPopoverOpen: boolean;
  compareOpen: boolean;
  compareViewOpen: boolean;
  compareRunIds: string[];
  selectHost: (hostId: string | null) => void;
  selectRun: (runId: string | null) => void;
  toggleHostExpanded: (hostId: string) => void;
  setRunningPopoverOpen: (open: boolean) => void;
  setCompareOpen: (open: boolean) => void;
  setCompareRunAt: (slot: number, runId: string) => void;
  removeCompareRun: (runId: string) => void;
  clearCompareRuns: () => void;
  showCompareView: () => void;
  forgetRun: (runId: string) => void;
};

export const useUiStore = create<UiState>((set) => ({
  selectedHostId: null,
  selectedRunId: null,
  expandedHostIds: [],
  runningPopoverOpen: false,
  compareOpen: false,
  compareViewOpen: false,
  compareRunIds: [],
  selectHost: (selectedHostId) => set({ selectedHostId, selectedRunId: null, compareViewOpen: false }),
  selectRun: (selectedRunId) => set({ selectedRunId, compareViewOpen: false }),
  toggleHostExpanded: (hostId) =>
    set((state) => ({
      expandedHostIds: state.expandedHostIds.includes(hostId)
        ? state.expandedHostIds.filter((id) => id !== hostId)
        : [...state.expandedHostIds, hostId]
    })),
  setRunningPopoverOpen: (runningPopoverOpen) => set({ runningPopoverOpen }),
  setCompareOpen: (compareOpen) => set({ compareOpen }),
  setCompareRunAt: (slot, runId) =>
    set((state) => {
      const compareRunIds = [...state.compareRunIds];
      for (let index = 0; index < compareRunIds.length; index += 1) {
        if (compareRunIds[index] === runId) {
          compareRunIds[index] = "";
        }
      }
      compareRunIds[slot] = runId;
      return { compareRunIds: compareRunIds.slice(0, 4) };
    }),
  removeCompareRun: (runId) =>
    set((state) => {
      const compareRunIds = state.compareRunIds.map((id) => (id === runId ? "" : id));
      return {
        compareRunIds,
        compareViewOpen: compareRunIds.filter(Boolean).length > 1 ? state.compareViewOpen : false
      };
    }),
  clearCompareRuns: () => set({ compareRunIds: [], compareViewOpen: false }),
  showCompareView: () => set({ compareViewOpen: true, selectedHostId: null, selectedRunId: null }),
  forgetRun: (runId) =>
    set((state) => {
      const compareRunIds = state.compareRunIds.map((id) => (id === runId ? "" : id));
      return {
        selectedRunId: state.selectedRunId === runId ? null : state.selectedRunId,
        compareRunIds,
        compareViewOpen: compareRunIds.filter(Boolean).length > 1 ? state.compareViewOpen : false
      };
    })
}));

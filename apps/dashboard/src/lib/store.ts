import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { LiveMetrics } from "@observaai/shared-types";

interface MetricsState {
  metrics: LiveMetrics | null;
  isConnected: boolean;
  lastUpdated: number | null;
  selectedTeamId: string | null;
  setMetrics: (metrics: LiveMetrics) => void;
  setConnected: (connected: boolean) => void;
  clearMetrics: () => void;
  setSelectedTeamId: (teamId: string | null) => void;
}

export const useMetricsStore = create<MetricsState>()(
  persist(
    (set) => ({
      metrics: null,
      isConnected: false,
      lastUpdated: null,
      selectedTeamId: null,
      setMetrics: (metrics) => set({ metrics, lastUpdated: Date.now() }),
      setConnected: (isConnected) => set({ isConnected }),
      clearMetrics: () => set({ metrics: null, lastUpdated: null }),
      setSelectedTeamId: (selectedTeamId) => set({ selectedTeamId }),
    }),
    {
      name: "observaai-store",
      partialize: (state) => ({ selectedTeamId: state.selectedTeamId }),
    }
  )
);

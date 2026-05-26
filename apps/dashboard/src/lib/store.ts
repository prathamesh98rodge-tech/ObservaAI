import { create } from "zustand";
import type { LiveMetrics } from "@observaai/shared-types";

interface MetricsState {
  metrics: LiveMetrics | null;
  isConnected: boolean;
  lastUpdated: number | null;
  setMetrics: (metrics: LiveMetrics) => void;
  setConnected: (connected: boolean) => void;
  clearMetrics: () => void;
}

export const useMetricsStore = create<MetricsState>((set) => ({
  metrics: null,
  isConnected: false,
  lastUpdated: null,
  setMetrics: (metrics) => set({ metrics, lastUpdated: Date.now() }),
  setConnected: (isConnected) => set({ isConnected }),
  clearMetrics: () => set({ metrics: null, lastUpdated: null }),
}));

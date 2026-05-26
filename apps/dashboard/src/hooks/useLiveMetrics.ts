"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchLiveMetrics } from "@/lib/api";

export function useLiveMetrics() {
  return useQuery({
    queryKey: ["live-metrics"],
    queryFn: fetchLiveMetrics,
    refetchInterval: 5_000,
  });
}

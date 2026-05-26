"use client";

import { useEffect, useRef } from "react";
import { GATEWAY_WS_URL } from "@/lib/api";
import { useMetricsStore } from "@/lib/store";

const RECONNECT_DELAY_MS = 3_000;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setMetrics = useMetricsStore((s) => s.setMetrics);
  const setConnected = useMetricsStore((s) => s.setConnected);

  useEffect(() => {
    let isMounted = true;

    function connect() {
      if (!isMounted) return;

      try {
        const ws = new WebSocket(GATEWAY_WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
          if (isMounted) setConnected(true);
        };

        ws.onmessage = (event: MessageEvent) => {
          if (!isMounted) return;
          try {
            const data = JSON.parse(event.data as string);
            // Skip heartbeat pings
            if (data?.type === "ping") return;
            setMetrics(data);
          } catch {
            // Ignore malformed messages
          }
        };

        ws.onclose = () => {
          if (!isMounted) return;
          setConnected(false);
          wsRef.current = null;
          // Schedule reconnect
          reconnectTimerRef.current = setTimeout(() => {
            if (isMounted) connect();
          }, RECONNECT_DELAY_MS);
        };

        ws.onerror = () => {
          // Let onclose handle reconnect
          ws.close();
        };
      } catch {
        // WebSocket constructor failed (e.g. bad URL during SSR guard)
        reconnectTimerRef.current = setTimeout(() => {
          if (isMounted) connect();
        }, RECONNECT_DELAY_MS);
      }
    }

    connect();

    return () => {
      isMounted = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onclose = null; // Prevent reconnect on intentional close
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnected(false);
    };
  }, [setMetrics, setConnected]);
}

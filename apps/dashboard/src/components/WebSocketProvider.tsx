"use client";

import { useWebSocket } from "@/hooks/useWebSocket";

export function WebSocketProvider() {
  useWebSocket();
  return null;
}

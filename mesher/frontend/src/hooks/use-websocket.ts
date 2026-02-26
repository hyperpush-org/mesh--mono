import { useEffect, useRef, useCallback } from "react";
import { useWsStore } from "@/stores/ws-store";
import type { WsMessage } from "@/types/api";

export function useProjectWebSocket(projectId: string | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setStatus = useWsStore((s) => s.setStatus);
  const setSendMessage = useWsStore((s) => s.setSendMessage);
  const onMessage = useWsStore((s) => s.onMessage);

  const connect = useCallback(() => {
    if (!projectId) return;

    // Clean up any existing connection
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
    }

    setStatus("connecting");

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(
      `${protocol}//${window.location.host}/ws/stream/projects/${projectId}`
    );
    wsRef.current = ws;

    ws.onopen = () => {
      retriesRef.current = 0;
      setStatus("connected");
      // Expose send function via store
      setSendMessage((msg: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(msg);
        }
      });
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as WsMessage;
        onMessage(msg);
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onerror = () => {
      // onclose will fire after onerror
    };

    ws.onclose = () => {
      setStatus("disconnected");
      setSendMessage(null);
      wsRef.current = null;

      // Exponential backoff with jitter
      const delay = Math.min(
        1000 * Math.pow(2, retriesRef.current),
        30000
      );
      const jitter = delay * 0.1 * Math.random();
      retriesRef.current++;

      reconnectTimerRef.current = setTimeout(connect, delay + jitter);
    };
  }, [projectId, setStatus, setSendMessage, onMessage]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      setSendMessage(null);
      setStatus("disconnected");
    };
  }, [connect, setStatus, setSendMessage]);
}

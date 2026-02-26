import { create } from "zustand";
import type { WsMessage } from "@/types/api";

type WsStatus = "connecting" | "connected" | "disconnected";

interface WsEventData {
  id?: string;
  issue_id?: string;
  level?: string;
  message?: string;
  received_at?: string;
  data?: unknown;
}

interface WsState {
  status: WsStatus;
  lastEvent: WsMessage | null;
  eventCount: number;
  latestEventData: WsEventData | null;
  unresolvedCount: number | null;
  sendMessage: ((msg: string) => void) | null;
  setStatus: (status: WsStatus) => void;
  setSendMessage: (fn: ((msg: string) => void) | null) => void;
  onMessage: (msg: WsMessage) => void;
}

export type { WsEventData };

export const useWsStore = create<WsState>((set) => ({
  status: "disconnected",
  lastEvent: null,
  eventCount: 0,
  latestEventData: null,
  unresolvedCount: null,
  sendMessage: null,
  setStatus: (status) => set({ status }),
  setSendMessage: (fn) => set({ sendMessage: fn }),
  onMessage: (msg) => {
    set({ lastEvent: msg });
    switch (msg.type) {
      case "event":
        set((state) => ({
          eventCount: state.eventCount + 1,
          latestEventData: msg.data as WsEventData,
        }));
        break;
      case "issue_count":
        set({ unresolvedCount: msg.count });
        break;
      // other types stored in lastEvent for consumers
    }
  },
}));

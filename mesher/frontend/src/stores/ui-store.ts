import { create } from "zustand";

interface DetailPanel {
  type: "event" | "issue";
  id: string;
}

interface UiState {
  sidebarOpen: boolean;
  detailPanel: DetailPanel | null;
  toggleSidebar: () => void;
  openDetail: (panel: DetailPanel) => void;
  closeDetail: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: true,
  detailPanel: null,
  toggleSidebar: () =>
    set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  openDetail: (panel) => set({ detailPanel: panel }),
  closeDetail: () => set({ detailPanel: null }),
}));

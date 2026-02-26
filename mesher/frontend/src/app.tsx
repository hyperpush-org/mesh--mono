import { Outlet } from "react-router";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Header } from "@/components/layout/header";
import { useProjectWebSocket } from "@/hooks/use-websocket";
import { useProjectStore } from "@/stores/project-store";

export default function App() {
  const activeProjectId = useProjectStore((s) => s.activeProjectId);

  // Single WebSocket connection per active project
  useProjectWebSocket(activeProjectId);

  return (
    <TooltipProvider>
      <SidebarProvider>
        <div className="flex h-screen w-full">
          <AppSidebar />
          <div className="flex flex-1 flex-col min-w-0">
            <Header />
            <main className="flex-1 overflow-auto">
              <Outlet />
            </main>
          </div>
        </div>
        <Toaster />
      </SidebarProvider>
    </TooltipProvider>
  );
}

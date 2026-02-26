import { Moon, Sun } from "lucide-react";
import { useLocation } from "react-router";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";
import { useWsStore } from "@/stores/ws-store";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

const routeTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/issues": "Issues",
  "/events": "Events",
  "/live": "Live Stream",
  "/alerts": "Alerts",
  "/settings": "Settings",
};

export function Header() {
  const { theme, toggleTheme } = useTheme();
  const wsStatus = useWsStore((s) => s.status);
  const location = useLocation();

  const title = routeTitles[location.pathname] ?? "Mesher";

  const statusColor =
    wsStatus === "connected"
      ? "bg-green-500"
      : wsStatus === "connecting"
        ? "bg-yellow-500"
        : "bg-red-500";

  const statusLabel =
    wsStatus === "connected"
      ? "Connected"
      : wsStatus === "connecting"
        ? "Connecting"
        : "Disconnected";

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 !h-4" />
      <h1 className="text-sm font-medium">{title}</h1>

      <div className="ml-auto flex items-center gap-3">
        <div className="flex items-center gap-1.5" title={statusLabel}>
          <div
            className={`h-2 w-2 rounded-full ${statusColor}`}
          />
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {statusLabel}
          </span>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={toggleTheme}
          aria-label="Toggle theme"
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </Button>
      </div>
    </header>
  );
}

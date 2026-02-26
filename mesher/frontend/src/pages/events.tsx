import { type ColumnDef } from "@tanstack/react-table";
import { Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { DataTable } from "@/components/shared/data-table";
import { FilterBar, type FilterState } from "@/components/shared/filter-bar";
import { StatusBadge } from "@/components/shared/status-badge";
import { PushPanelLayout } from "@/components/layout/push-panel";
import { EventDetail } from "@/components/detail/event-detail";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/format";
import { useProjectStore } from "@/stores/project-store";
import { useUiStore } from "@/stores/ui-store";
import type { EventSummary } from "@/types/api";

const eventColumns: ColumnDef<EventSummary, unknown>[] = [
  {
    accessorKey: "message",
    header: "Message",
    cell: ({ row }) => (
      <span className="block max-w-[500px] truncate">
        {row.getValue("message") as string}
      </span>
    ),
  },
  {
    accessorKey: "level",
    header: "Level",
    cell: ({ row }) => {
      const level = row.getValue("level") as string;
      const valid = ["error", "warning", "info", "debug"].includes(level);
      return (
        <StatusBadge variant={valid ? (level as "error" | "warning" | "info" | "debug") : "info"} />
      );
    },
  },
  {
    accessorKey: "issue_id",
    header: "Issue",
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">
        {(row.getValue("issue_id") as string).slice(0, 8)}
      </span>
    ),
  },
  {
    accessorKey: "received_at",
    header: "Received",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {formatRelativeTime(row.getValue("received_at") as string)}
      </span>
    ),
  },
];

export default function EventsPage() {
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const { detailPanel, openDetail } = useUiStore();

  const [events, setEvents] = useState<EventSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const filtersRef = useRef<FilterState>({});

  const fetchEvents = useCallback(
    async (filters: FilterState) => {
      if (!activeProjectId) return;

      // Only fetch when there's a search query
      if (!filters.search) {
        setEvents([]);
        setHasSearched(false);
        setLoading(false);
        return;
      }

      setLoading(true);
      setHasSearched(true);
      try {
        const results = await api.events.search(
          activeProjectId,
          filters.search,
          25
        );
        // Apply client-side level filter if specified
        const filtered = filters.level
          ? results.filter(
              (e) => e.level.toLowerCase() === filters.level!.toLowerCase()
            )
          : results;
        setEvents(filtered);
      } catch (err) {
        console.error("Failed to search events:", err);
        setEvents([]);
      } finally {
        setLoading(false);
      }
    },
    [activeProjectId]
  );

  const handleFilterChange = useCallback(
    (filters: FilterState) => {
      filtersRef.current = filters;
      fetchEvents(filters);
    },
    [fetchEvents]
  );

  const handleRowClick = (event: EventSummary) => {
    openDetail({ type: "event", id: event.id });
  };

  // Re-fetch when project changes
  useEffect(() => {
    if (activeProjectId && filtersRef.current.search) {
      fetchEvents(filtersRef.current);
    }
  }, [activeProjectId, fetchEvents]);

  const { closeDetail } = useUiStore();

  const panel = detailPanel ? (
    detailPanel.type === "event" ? (
      <EventDetail eventId={detailPanel.id} onClose={closeDetail} />
    ) : null
  ) : null;

  return (
    <PushPanelLayout panel={panel}>
      <div className="flex flex-col h-full">
        <div className="p-6 pb-0">
          <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
          <FilterBar
            onFilterChange={handleFilterChange}
            showSearch={true}
            showLevel={true}
            showEnvironment={true}
          />
        </div>
        <div className="flex-1 p-6 pt-4 overflow-auto">
          {!hasSearched && !loading ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Search className="size-10 text-muted-foreground/40 mb-4" />
              <p className="text-sm text-muted-foreground">
                Search events by message, tags, or other criteria
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Enter a search query above to get started
              </p>
            </div>
          ) : (
            <DataTable
              columns={eventColumns}
              data={events}
              onRowClick={handleRowClick}
              isLoading={loading}
            />
          )}
        </div>
      </div>
    </PushPanelLayout>
  );
}

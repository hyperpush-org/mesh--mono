import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, Trash2 } from "lucide-react";

import { EventCard } from "@/components/shared/event-card";
import { FilterBar, type FilterState } from "@/components/shared/filter-bar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useWsStore, type WsEventData } from "@/stores/ws-store";
import { useUiStore } from "@/stores/ui-store";

const MAX_EVENTS = 200;

export default function LiveStreamPage() {
  const lastEvent = useWsStore((s) => s.lastEvent);
  const sendMessage = useWsStore((s) => s.sendMessage);
  const openDetail = useUiStore((s) => s.openDetail);

  const [events, setEvents] = useState<WsEventData[]>([]);
  const [paused, setPaused] = useState(false);
  const [filters, setFilters] = useState<FilterState>({});

  // Refs to avoid stale closures in the WS effect
  const pausedRef = useRef(paused);
  const filtersRef = useRef(filters);
  pausedRef.current = paused;
  filtersRef.current = filters;

  // Track last processed event to avoid double-processing
  const lastProcessedRef = useRef<unknown>(null);

  // Accumulate events from WebSocket
  useEffect(() => {
    if (!lastEvent || lastEvent === lastProcessedRef.current) return;
    lastProcessedRef.current = lastEvent;

    if (lastEvent.type !== "event") return;
    if (pausedRef.current) return;

    const eventData: WsEventData = {
      id:
        (lastEvent.data as Record<string, unknown>)?.id as string | undefined ??
        `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      issue_id: lastEvent.issue_id,
      level: (lastEvent.data as Record<string, unknown>)?.level as
        | string
        | undefined,
      message: (lastEvent.data as Record<string, unknown>)?.message as
        | string
        | undefined,
      received_at:
        ((lastEvent.data as Record<string, unknown>)?.received_at as
          | string
          | undefined) ?? new Date().toISOString(),
      data: lastEvent.data,
    };

    setEvents((prev) => [eventData, ...prev].slice(0, MAX_EVENTS));
  }, [lastEvent]);

  // Send subscribe message when filters change
  const handleFilterChange = useCallback(
    (newFilters: FilterState) => {
      setFilters(newFilters);

      if (sendMessage) {
        sendMessage(
          JSON.stringify({
            type: "subscribe",
            filters: {
              level: newFilters.level ?? "",
              environment: newFilters.environment ?? "",
            },
          })
        );
      }
    },
    [sendMessage]
  );

  const togglePause = () => setPaused((p) => !p);
  const clearEvents = () => setEvents([]);

  // Apply client-side search filter for display
  const displayedEvents = filters.search
    ? events.filter((e) => {
        const search = filters.search!.toLowerCase();
        const message = (e.message ?? "").toLowerCase();
        const dataStr =
          typeof e.data === "string"
            ? e.data.toLowerCase()
            : e.data
              ? JSON.stringify(e.data).toLowerCase()
              : "";
        return message.includes(search) || dataStr.includes(search);
      })
    : events;

  const handleEventClick = (event: WsEventData) => {
    if (event.id && !event.id.startsWith("ws-")) {
      openDetail({ type: "event", id: event.id });
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-4 border-b p-6 pb-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">
            Live Stream
          </h1>
          <div className="flex items-center gap-2">
            <span className="text-sm tabular-nums text-muted-foreground">
              {displayedEvents.length} event
              {displayedEvents.length !== 1 ? "s" : ""}
            </span>
            <Button variant="outline" size="sm" onClick={togglePause}>
              {paused ? (
                <Play className="size-3.5" />
              ) : (
                <Pause className="size-3.5" />
              )}
              {paused ? "Resume" : "Pause"}
            </Button>
            <Button variant="outline" size="sm" onClick={clearEvents}>
              <Trash2 className="size-3.5" />
              Clear
            </Button>
          </div>
        </div>
        <FilterBar
          showSearch
          showLevel
          showEnvironment
          onFilterChange={handleFilterChange}
        />
      </div>
      <ScrollArea className="flex-1 p-6">
        {displayedEvents.length > 0 ? (
          <div className="space-y-2">
            {displayedEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                onClick={() => handleEventClick(event)}
              />
            ))}
          </div>
        ) : (
          <div className="flex h-full min-h-[200px] items-center justify-center">
            <p className="text-sm text-muted-foreground">
              {paused
                ? "Stream paused. Click Resume to continue receiving events."
                : "Waiting for events..."}
            </p>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

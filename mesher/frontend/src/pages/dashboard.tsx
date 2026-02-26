import { useCallback, useEffect, useRef, useState } from "react";
import { useProjectStore } from "@/stores/project-store";
import { useWsStore } from "@/stores/ws-store";
import { useUiStore } from "@/stores/ui-store";
import { api } from "@/lib/api";
import type {
  HealthSummary,
  LevelBreakdown,
  TopIssue,
  VolumePoint,
} from "@/types/api";
import { VolumeChart } from "@/components/charts/volume-chart";
import { LevelChart } from "@/components/charts/level-chart";
import { HealthStats } from "@/components/charts/health-chart";
import { IssueRow } from "@/components/shared/issue-row";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";

const REFRESH_INTERVAL_MS = 60_000;

type TimeRange = "24h" | "7d";

interface DashboardData {
  volume: VolumePoint[];
  levels: LevelBreakdown[];
  topIssues: TopIssue[];
  health: HealthSummary;
}

export default function DashboardPage() {
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const lastEvent = useWsStore((s) => s.lastEvent);
  const wsUnresolvedCount = useWsStore((s) => s.unresolvedCount);
  const wsEventCount = useWsStore((s) => s.eventCount);
  const openDetail = useUiStore((s) => s.openDetail);

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>("24h");

  // Track last WS event to avoid re-processing
  const lastProcessedRef = useRef<unknown>(null);
  const timeRangeRef = useRef<TimeRange>(timeRange);
  timeRangeRef.current = timeRange;

  const fetchDashboard = useCallback(
    async (range: TimeRange, showLoading = true) => {
      if (!activeProjectId) return;
      if (showLoading) setLoading(true);
      setError(null);
      try {
        const bucket = range === "24h" ? "hour" : "day";
        const [volume, levels, topIssues, health] = await Promise.all([
          api.dashboard.volume(activeProjectId, bucket),
          api.dashboard.levels(activeProjectId),
          api.dashboard.topIssues(activeProjectId),
          api.dashboard.health(activeProjectId),
        ]);
        setData({ volume, levels, topIssues, health });
      } catch (err) {
        if (showLoading) {
          setError(
            err instanceof Error ? err.message : "Failed to load dashboard"
          );
        }
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [activeProjectId]
  );

  // Fetch on mount and when project or time range changes
  useEffect(() => {
    fetchDashboard(timeRange);
  }, [fetchDashboard, timeRange]);

  // Periodic 60-second refresh for data accuracy
  useEffect(() => {
    const interval = setInterval(() => {
      // Skip refresh if page is not visible
      if (document.hidden) return;
      fetchDashboard(timeRangeRef.current, false);
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [fetchDashboard]);

  // WebSocket live updates -- optimistic state mutations
  useEffect(() => {
    if (!lastEvent || lastEvent === lastProcessedRef.current) return;
    lastProcessedRef.current = lastEvent;

    setData((prev) => {
      if (!prev) return prev;

      // When a new event arrives, bump the latest volume bucket count
      if (lastEvent.type === "event") {
        const updatedVolume = [...prev.volume];
        if (updatedVolume.length > 0) {
          const last = { ...updatedVolume[updatedVolume.length - 1] };
          last.count = last.count + 1;
          updatedVolume[updatedVolume.length - 1] = last;
        }
        return {
          ...prev,
          volume: updatedVolume,
          health: {
            ...prev.health,
            events_24h: prev.health.events_24h + 1,
          },
        };
      }

      // When issue_count message arrives, update unresolved_count
      if (lastEvent.type === "issue_count") {
        return {
          ...prev,
          health: {
            ...prev.health,
            unresolved_count: lastEvent.count,
          },
        };
      }

      // When an issue action happens, update the top issues list visually
      if (lastEvent.type === "issue") {
        if (
          lastEvent.action === "resolved" ||
          lastEvent.action === "archived"
        ) {
          const updatedIssues = prev.topIssues.map((issue) =>
            issue.id === lastEvent.issue_id
              ? { ...issue, status: lastEvent.action }
              : issue
          );
          return { ...prev, topIssues: updatedIssues };
        }
      }

      return prev;
    });
  }, [lastEvent]);

  // Sync ws-store unresolvedCount into dashboard health immediately
  useEffect(() => {
    if (wsUnresolvedCount === null) return;
    setData((prev) => {
      if (!prev) return prev;
      if (prev.health.unresolved_count === wsUnresolvedCount) return prev;
      return {
        ...prev,
        health: { ...prev.health, unresolved_count: wsUnresolvedCount },
      };
    });
  }, [wsUnresolvedCount]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-center">
          <p className="text-sm text-destructive">{error}</p>
          <button
            type="button"
            onClick={() => fetchDashboard(timeRange)}
            className="mt-2 text-sm text-muted-foreground underline hover:text-foreground"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full gap-6 p-6">
      {/* Left panel: Charts */}
      <div className="flex-1 space-y-6 overflow-auto">
        {/* Time range selector */}
        <div className="flex items-center gap-2">
          <TimeRangeButton
            active={timeRange === "24h"}
            onClick={() => setTimeRange("24h")}
          >
            Last 24 hours
          </TimeRangeButton>
          <TimeRangeButton
            active={timeRange === "7d"}
            onClick={() => setTimeRange("7d")}
          >
            Last 7 days
          </TimeRangeButton>
          {wsEventCount > 0 && (
            <span className="ml-auto text-xs tabular-nums text-muted-foreground">
              {wsEventCount} event{wsEventCount !== 1 ? "s" : ""} this session
            </span>
          )}
        </div>

        {/* Health stat cards */}
        {loading ? (
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[88px] rounded-xl" />
            ))}
          </div>
        ) : data ? (
          <HealthStats data={data.health} />
        ) : null}

        {/* Volume chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Event Volume
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[240px] w-full" />
            ) : data ? (
              <VolumeChart
                data={data.volume}
                bucket={timeRange === "24h" ? "hour" : "day"}
              />
            ) : null}
          </CardContent>
        </Card>

        {/* Level breakdown chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Error Levels
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : data ? (
              <LevelChart data={data.levels} />
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Right panel: Issue list */}
      <div className="flex flex-1 flex-col">
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-sm font-semibold">Issues</h2>
          {data && (
            <Badge variant="secondary" className="text-xs tabular-nums">
              {data.health.unresolved_count}
            </Badge>
          )}
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : data && data.topIssues.length > 0 ? (
          <ScrollArea className="flex-1">
            <div className="space-y-0.5">
              {data.topIssues.map((issue) => (
                <IssueRow
                  key={issue.id}
                  issue={issue}
                  onClick={() =>
                    openDetail({ type: "issue", id: issue.id })
                  }
                />
              ))}
            </div>
          </ScrollArea>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-muted-foreground">No issues found</p>
          </div>
        )}
      </div>
    </div>
  );
}

function TimeRangeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "bg-secondary text-secondary-foreground hover:bg-accent"
      }`}
    >
      {children}
    </button>
  );
}

import { type ColumnDef } from "@tanstack/react-table";
import { useCallback, useEffect, useRef, useState } from "react";

import { DataTable } from "@/components/shared/data-table";
import { FilterBar, type FilterState } from "@/components/shared/filter-bar";
import { Pagination } from "@/components/shared/pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import { PushPanelLayout } from "@/components/layout/push-panel";
import { EventDetail } from "@/components/detail/event-detail";
import { IssueDetail } from "@/components/detail/issue-detail";
import { api } from "@/lib/api";
import { formatRelativeTime, formatNumber } from "@/lib/format";
import { useProjectStore } from "@/stores/project-store";
import { useUiStore } from "@/stores/ui-store";
import type { Issue } from "@/types/api";

const issueColumns: ColumnDef<Issue, unknown>[] = [
  {
    accessorKey: "title",
    header: "Title",
    cell: ({ row }) => (
      <span className="block max-w-[400px] truncate font-medium">
        {row.getValue("title") as string}
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
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.getValue("status") as string;
      const valid = ["unresolved", "resolved", "archived"].includes(status);
      return (
        <StatusBadge
          variant={valid ? (status as "unresolved" | "resolved" | "archived") : "unresolved"}
        />
      );
    },
  },
  {
    accessorKey: "event_count",
    header: "Events",
    cell: ({ row }) => (
      <span className="tabular-nums text-muted-foreground">
        {formatNumber(row.getValue("event_count") as number)}
      </span>
    ),
  },
  {
    accessorKey: "last_seen",
    header: "Last Seen",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {formatRelativeTime(row.getValue("last_seen") as string)}
      </span>
    ),
  },
];

interface CursorEntry {
  cursor: string;
  cursorId: string;
}

export default function IssuesPage() {
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const { detailPanel, openDetail } = useUiStore();

  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorId, setCursorId] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<CursorEntry[]>([]);
  const filtersRef = useRef<FilterState>({});

  const fetchIssues = useCallback(
    async (
      filters: FilterState,
      cursorVal?: string | null,
      cursorIdVal?: string | null
    ) => {
      if (!activeProjectId) return;
      setLoading(true);
      try {
        const params: Record<string, unknown> = { limit: 25 };
        if (filters.status) params.status = filters.status;
        if (filters.level) params.level = filters.level;
        if (cursorVal) params.cursor = cursorVal;
        if (cursorIdVal) params.cursor_id = cursorIdVal;

        const result = await api.issues.list(
          activeProjectId,
          params as Parameters<typeof api.issues.list>[1]
        );
        setIssues(result.data);
        setHasMore(result.has_more);
        setCursor(result.next_cursor ?? null);
        setCursorId(result.next_cursor_id ?? null);
      } catch (err) {
        console.error("Failed to fetch issues:", err);
        setIssues([]);
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    },
    [activeProjectId]
  );

  // Fetch on mount handled by FilterBar emitting default filters
  const handleFilterChange = useCallback(
    (filters: FilterState) => {
      filtersRef.current = filters;
      setCursorStack([]);
      fetchIssues(filters);
    },
    [fetchIssues]
  );

  const handleNext = () => {
    if (!cursor || !cursorId) return;
    // Push current position onto stack for "Previous"
    setCursorStack((prev) => [
      ...prev,
      { cursor: cursor, cursorId: cursorId },
    ]);
    fetchIssues(filtersRef.current, cursor, cursorId);
  };

  const handlePrevious = () => {
    const stack = [...cursorStack];
    stack.pop(); // Remove current
    const prev = stack.length > 0 ? stack[stack.length - 1] : null;
    setCursorStack(stack);
    if (prev) {
      fetchIssues(filtersRef.current, prev.cursor, prev.cursorId);
    } else {
      fetchIssues(filtersRef.current);
    }
  };

  const handleRowClick = (issue: Issue) => {
    openDetail({ type: "issue", id: issue.id });
  };

  // Re-fetch when project changes
  useEffect(() => {
    if (activeProjectId) {
      setCursorStack([]);
      fetchIssues(filtersRef.current);
    }
  }, [activeProjectId, fetchIssues]);

  const { closeDetail } = useUiStore();

  const refetchIssues = useCallback(() => {
    fetchIssues(filtersRef.current);
  }, [fetchIssues]);

  const panel = detailPanel ? (
    detailPanel.type === "issue" ? (
      <IssueDetail
        issueId={detailPanel.id}
        onClose={closeDetail}
        onUpdate={refetchIssues}
      />
    ) : detailPanel.type === "event" ? (
      <EventDetail eventId={detailPanel.id} onClose={closeDetail} />
    ) : null
  ) : null;

  return (
    <PushPanelLayout panel={panel}>
      <div className="flex flex-col h-full">
        <div className="p-6 pb-0">
          <h1 className="text-2xl font-semibold tracking-tight">Issues</h1>
          <FilterBar
            onFilterChange={handleFilterChange}
            showSearch={true}
            showStatus={true}
            showLevel={true}
            defaultStatus="unresolved"
          />
        </div>
        <div className="flex-1 p-6 pt-4 overflow-auto">
          <DataTable
            columns={issueColumns}
            data={issues}
            onRowClick={handleRowClick}
            isLoading={loading}
          />
        </div>
        <div className="p-6 pt-0">
          <Pagination
            hasMore={hasMore}
            hasPrevious={cursorStack.length > 0}
            onNext={handleNext}
            onPrevious={handlePrevious}
          />
        </div>
      </div>
    </PushPanelLayout>
  );
}

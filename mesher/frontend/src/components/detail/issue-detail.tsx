import { useCallback, useEffect, useState } from "react";
import {
  Archive,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { api } from "@/lib/api";
import { formatRelativeTime, formatNumber } from "@/lib/format";
import { useUiStore } from "@/stores/ui-store";
import type { Issue, EventSummary } from "@/types/api";

interface IssueDetailProps {
  issueId: string;
  onClose: () => void;
  onUpdate?: () => void;
}

export function IssueDetail({ issueId, onClose, onUpdate }: IssueDetailProps) {
  const openDetail = useUiStore((s) => s.openDetail);
  const [issue, setIssue] = useState<Issue | null>(null);
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showAssign, setShowAssign] = useState(false);
  const [assignUserId, setAssignUserId] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch issue events (the API doesn't have a direct issue detail endpoint,
      // so we use the events for this issue to show recent events)
      const eventsResult = await api.issues.events(issueId, { limit: 5 });
      setEvents(eventsResult.data);
    } catch (err) {
      console.error("Failed to fetch issue data:", err);
    } finally {
      setLoading(false);
    }
  }, [issueId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // We receive the issue data from the parent list context via the issues API.
  // Since we need issue metadata, let's also fetch it from the issues list endpoint.
  const [issueLoading, setIssueLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchIssue() {
      setIssueLoading(true);
      try {
        // Use events endpoint to get issue info, plus construct from available data
        // The issue data comes from the list -- we re-fetch to get fresh state
        const eventsResult = await api.issues.events(issueId, { limit: 1 });
        // We can construct a partial issue from what we know, but the events endpoint
        // doesn't give us the issue detail. The timeline endpoint may help.
        const timelineResult = await api.issues.timeline(issueId, 1);

        // Construct issue-like object from available data
        if (!cancelled) {
          // Check if we have at least one event to derive info from
          const firstEvent = eventsResult.data[0] || timelineResult[0];
          if (firstEvent) {
            setIssue({
              id: issueId,
              title: firstEvent.message || "Unknown Issue",
              level: firstEvent.level || "error",
              status: "unresolved", // Will be updated by state transitions
              event_count: 0,
              first_seen: firstEvent.received_at || "",
              last_seen: firstEvent.received_at || "",
              assigned_to: "",
            });
          }
          setIssueLoading(false);
        }
      } catch (err) {
        console.error("Failed to fetch issue:", err);
        if (!cancelled) setIssueLoading(false);
      }
    }
    fetchIssue();
    return () => {
      cancelled = true;
    };
  }, [issueId]);

  const handleAction = async (
    action: string,
    fn: () => Promise<unknown>
  ) => {
    setActionLoading(action);
    try {
      await fn();
      // Update local issue status
      setIssue((prev) => {
        if (!prev) return prev;
        const statusMap: Record<string, string> = {
          resolve: "resolved",
          archive: "archived",
          unresolve: "unresolved",
        };
        return { ...prev, status: statusMap[action] || prev.status };
      });
      onUpdate?.();
    } catch (err) {
      console.error(`Failed to ${action} issue:`, err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    setActionLoading("delete");
    try {
      await api.issues.delete(issueId);
      onUpdate?.();
      onClose();
    } catch (err) {
      console.error("Failed to delete issue:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleAssign = async () => {
    if (!assignUserId.trim()) return;
    setActionLoading("assign");
    try {
      await api.issues.assign(issueId, assignUserId.trim());
      setIssue((prev) =>
        prev ? { ...prev, assigned_to: assignUserId.trim() } : prev
      );
      setShowAssign(false);
      setAssignUserId("");
      onUpdate?.();
    } catch (err) {
      console.error("Failed to assign issue:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleEventClick = (event: EventSummary) => {
    openDetail({ type: "event", id: event.id });
  };

  if (loading || issueLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <Skeleton className="h-5 w-48" />
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
        <div className="p-4 space-y-4">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    );
  }

  if (!issue) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <span className="text-sm text-muted-foreground">Issue not found</span>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
      </div>
    );
  }

  const levelValid = ["error", "warning", "info", "debug"].includes(
    issue.level
  );
  const statusValid = ["unresolved", "resolved", "archived"].includes(
    issue.status
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 p-4 border-b border-border shrink-0">
        <h2 className="text-sm font-medium truncate flex-1">{issue.title}</h2>
        <Button variant="ghost" size="icon-sm" onClick={onClose} className="shrink-0">
          <X className="size-4" />
        </Button>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-5">
          {/* Status & Level */}
          <section>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Status
            </h3>
            <div className="flex items-center gap-2">
              <StatusBadge
                variant={
                  statusValid
                    ? (issue.status as "unresolved" | "resolved" | "archived")
                    : "unresolved"
                }
              />
              <StatusBadge
                variant={
                  levelValid
                    ? (issue.level as "error" | "warning" | "info" | "debug")
                    : "info"
                }
              />
            </div>
          </section>

          {/* Stats */}
          <Separator />
          <section>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Stats
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Events</p>
                <p className="text-sm font-medium tabular-nums">
                  {formatNumber(issue.event_count)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">First Seen</p>
                <p className="text-sm">
                  {issue.first_seen
                    ? formatRelativeTime(issue.first_seen)
                    : "-"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Last Seen</p>
                <p className="text-sm">
                  {issue.last_seen
                    ? formatRelativeTime(issue.last_seen)
                    : "-"}
                </p>
              </div>
            </div>
          </section>

          {/* Actions */}
          <Separator />
          <section>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Actions
            </h3>
            <div className="flex flex-wrap gap-2">
              {issue.status !== "resolved" && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={actionLoading !== null}
                  onClick={() =>
                    handleAction("resolve", () =>
                      api.issues.resolve(issueId)
                    )
                  }
                >
                  {actionLoading === "resolve" ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-3.5" />
                  )}
                  Resolve
                </Button>
              )}
              {issue.status === "resolved" && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={actionLoading !== null}
                  onClick={() =>
                    handleAction("unresolve", () =>
                      api.issues.unresolve(issueId)
                    )
                  }
                >
                  {actionLoading === "unresolve" ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="size-3.5" />
                  )}
                  Unresolve
                </Button>
              )}
              {issue.status !== "archived" && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={actionLoading !== null}
                  onClick={() =>
                    handleAction("archive", () =>
                      api.issues.archive(issueId)
                    )
                  }
                >
                  {actionLoading === "archive" ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Archive className="size-3.5" />
                  )}
                  Archive
                </Button>
              )}
              {issue.status === "archived" && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={actionLoading !== null}
                  onClick={() =>
                    handleAction("unresolve", () =>
                      api.issues.unresolve(issueId)
                    )
                  }
                >
                  {actionLoading === "unresolve" ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="size-3.5" />
                  )}
                  Unresolve
                </Button>
              )}

              {/* Assign */}
              <Button
                variant="outline"
                size="sm"
                disabled={actionLoading !== null}
                onClick={() => setShowAssign(!showAssign)}
              >
                <UserPlus className="size-3.5" />
                Assign
              </Button>

              {/* Delete with confirmation */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={actionLoading !== null}
                  >
                    {actionLoading === "delete" ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Issue</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete this issue and all associated
                      events. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={handleDelete}
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            {/* Assign input */}
            {showAssign && (
              <div className="flex items-center gap-2 mt-2">
                <Input
                  placeholder="User ID"
                  value={assignUserId}
                  onChange={(e) => setAssignUserId(e.target.value)}
                  className="h-8 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAssign();
                  }}
                />
                <Button
                  size="sm"
                  disabled={!assignUserId.trim() || actionLoading !== null}
                  onClick={handleAssign}
                >
                  {actionLoading === "assign" ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    "Assign"
                  )}
                </Button>
              </div>
            )}
          </section>

          {/* Recent Events */}
          <Separator />
          <section className="pb-2">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Recent Events
            </h3>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                No events found
              </p>
            ) : (
              <div className="space-y-1">
                {events.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-left hover:bg-muted/50 transition-colors"
                    onClick={() => handleEventClick(event)}
                  >
                    <StatusBadge
                      variant={
                        ["error", "warning", "info", "debug"].includes(
                          event.level
                        )
                          ? (event.level as
                              | "error"
                              | "warning"
                              | "info"
                              | "debug")
                          : "info"
                      }
                    />
                    <span className="text-sm truncate flex-1">
                      {event.message}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatRelativeTime(event.received_at)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}

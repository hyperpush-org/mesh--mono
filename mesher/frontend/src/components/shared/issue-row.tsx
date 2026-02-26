import type { TopIssue } from "@/types/api";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatRelativeTime } from "@/lib/format";

interface IssueRowProps {
  issue: TopIssue;
  onClick?: () => void;
}

export function IssueRow({ issue, onClick }: IssueRowProps) {
  const variant = (
    ["error", "warning", "info", "debug"].includes(issue.level)
      ? issue.level
      : "info"
  ) as "error" | "warning" | "info" | "debug";

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{ cursor: onClick ? "pointer" : "default" }}
    >
      <StatusBadge variant={variant} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
        {issue.title}
      </span>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {issue.event_count.toLocaleString()}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {formatRelativeTime(issue.last_seen)}
      </span>
    </button>
  );
}

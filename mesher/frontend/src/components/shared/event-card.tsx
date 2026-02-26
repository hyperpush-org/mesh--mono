import { StatusBadge } from "@/components/shared/status-badge";
import { formatRelativeTime } from "@/lib/format";

interface EventCardProps {
  event: {
    id?: string;
    issue_id?: string;
    level?: string;
    message?: string;
    received_at?: string;
    data?: unknown;
  };
  onClick?: () => void;
}

export function EventCard({ event, onClick }: EventCardProps) {
  const level = event.level ?? "info";
  const issueId = event.issue_id ?? "";
  const message =
    event.message ??
    (typeof event.data === "string"
      ? event.data
      : event.data
        ? JSON.stringify(event.data)
        : "");
  const timestamp = event.received_at ?? new Date().toISOString();

  const validLevel = ["error", "warning", "info", "debug"].includes(level)
    ? (level as "error" | "warning" | "info" | "debug")
    : "info";

  return (
    <button
      type="button"
      onClick={onClick}
      className="animate-in fade-in slide-in-from-top-2 duration-200 flex w-full flex-col gap-1 rounded-md border px-3 py-2 text-left transition-colors hover:bg-accent"
    >
      <div className="flex items-center gap-2">
        <StatusBadge variant={validLevel} />
        {issueId && (
          <span className="max-w-[120px] truncate font-mono text-xs text-muted-foreground">
            {issueId.slice(0, 8)}
          </span>
        )}
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
          {formatRelativeTime(timestamp)}
        </span>
      </div>
      <p className="line-clamp-2 text-sm text-foreground/90">{message}</p>
    </button>
  );
}

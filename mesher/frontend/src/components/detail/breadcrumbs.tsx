import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatRelativeTime } from "@/lib/format";

interface Breadcrumb {
  type?: string;
  category?: string;
  message?: string;
  timestamp?: string;
  data?: unknown;
  level?: string;
}

interface BreadcrumbsProps {
  breadcrumbs: unknown;
}

function parseBreadcrumbs(raw: unknown): Breadcrumb[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as Breadcrumb[];
  if (typeof raw === "object" && raw !== null) {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.values)) return obj.values as Breadcrumb[];
    if (Array.isArray(obj.breadcrumbs))
      return obj.breadcrumbs as Breadcrumb[];
  }
  return [];
}

export function Breadcrumbs({ breadcrumbs }: BreadcrumbsProps) {
  const items = parseBreadcrumbs(breadcrumbs);

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No breadcrumbs recorded
      </p>
    );
  }

  // Chronological order: oldest first
  const sorted = [...items].sort((a, b) => {
    if (!a.timestamp || !b.timestamp) return 0;
    return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
  });

  return (
    <div className="relative pl-5">
      {/* Vertical connector line */}
      <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
      {sorted.map((crumb, i) => (
        <BreadcrumbEntry key={i} crumb={crumb} isLast={i === sorted.length - 1} />
      ))}
    </div>
  );
}

function BreadcrumbEntry({
  crumb,
  isLast,
}: {
  crumb: Breadcrumb;
  isLast: boolean;
}) {
  const [dataExpanded, setDataExpanded] = useState(false);
  const hasData =
    crumb.data != null &&
    typeof crumb.data === "object" &&
    Object.keys(crumb.data as Record<string, unknown>).length > 0;

  const levelVariant =
    crumb.level &&
    ["error", "warning", "info", "debug"].includes(crumb.level)
      ? (crumb.level as "error" | "warning" | "info" | "debug")
      : null;

  return (
    <div className={cn("relative pb-3", isLast && "pb-0")}>
      {/* Dot indicator */}
      <div className="absolute -left-5 top-1.5 size-2.5 rounded-full bg-border ring-2 ring-background" />

      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm">
          {crumb.category && (
            <span className="font-medium truncate">{crumb.category}</span>
          )}
          {levelVariant && <StatusBadge variant={levelVariant} />}
          {crumb.timestamp && (
            <span className="text-xs text-muted-foreground ml-auto shrink-0">
              {formatRelativeTime(crumb.timestamp)}
            </span>
          )}
        </div>
        {crumb.message && (
          <p className="text-sm text-muted-foreground mt-0.5 break-words">
            {crumb.message}
          </p>
        )}
        {hasData && (
          <div className="mt-1">
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setDataExpanded(!dataExpanded)}
            >
              <ChevronRight
                className={cn(
                  "size-3 transition-transform",
                  dataExpanded && "rotate-90"
                )}
              />
              data
            </button>
            {dataExpanded && (
              <pre className="mt-1 rounded bg-muted p-2 font-mono text-xs overflow-x-auto">
                {JSON.stringify(crumb.data, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

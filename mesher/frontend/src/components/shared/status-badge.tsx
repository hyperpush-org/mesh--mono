import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatusVariant =
  | "error"
  | "warning"
  | "info"
  | "debug"
  | "resolved"
  | "archived"
  | "unresolved";

interface StatusBadgeProps {
  variant: StatusVariant;
  className?: string;
  children?: React.ReactNode;
}

const variantStyles: Record<StatusVariant, string> = {
  error:
    "border-transparent bg-[oklch(0.577_0.245_27.325)] text-white dark:bg-[oklch(0.577_0.245_27.325)]/80",
  warning:
    "border-transparent bg-[oklch(0.75_0.18_85)] text-[oklch(0.25_0.05_85)] dark:text-[oklch(0.15_0.05_85)]",
  info: "border-border bg-secondary text-secondary-foreground",
  debug: "border-border bg-muted text-muted-foreground",
  resolved: "border-border bg-secondary text-muted-foreground",
  archived: "border-border bg-muted text-muted-foreground",
  unresolved: "border-border bg-secondary text-secondary-foreground",
};

const variantLabels: Record<StatusVariant, string> = {
  error: "Error",
  warning: "Warning",
  info: "Info",
  debug: "Debug",
  resolved: "Resolved",
  archived: "Archived",
  unresolved: "Unresolved",
};

export function StatusBadge({ variant, className, children }: StatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-sm px-1.5 py-0 text-[10px] font-medium leading-5",
        variantStyles[variant],
        className
      )}
    >
      {children ?? variantLabels[variant]}
    </Badge>
  );
}

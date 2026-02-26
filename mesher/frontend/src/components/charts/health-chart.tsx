import type { HealthSummary } from "@/types/api";
import { Card, CardContent } from "@/components/ui/card";

interface HealthStatsProps {
  data: HealthSummary;
}

export function HealthStats({ data }: HealthStatsProps) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <Card className="py-4">
        <CardContent className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-2">
            {data.unresolved_count > 0 && (
              <span className="inline-block h-2 w-2 rounded-full bg-[oklch(0.577_0.245_27.325)]" />
            )}
            <span className="text-2xl font-semibold tabular-nums text-foreground">
              {data.unresolved_count.toLocaleString()}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            Unresolved Issues
          </span>
        </CardContent>
      </Card>

      <Card className="py-4">
        <CardContent className="flex flex-col items-center gap-1">
          <span className="text-2xl font-semibold tabular-nums text-foreground">
            {data.events_24h.toLocaleString()}
          </span>
          <span className="text-xs text-muted-foreground">Events (24h)</span>
        </CardContent>
      </Card>

      <Card className="py-4">
        <CardContent className="flex flex-col items-center gap-1">
          <span className="text-2xl font-semibold tabular-nums text-foreground">
            {data.new_today.toLocaleString()}
          </span>
          <span className="text-xs text-muted-foreground">New Today</span>
        </CardContent>
      </Card>
    </div>
  );
}

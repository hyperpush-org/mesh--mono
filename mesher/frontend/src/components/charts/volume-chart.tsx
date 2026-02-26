import type { VolumePoint } from "@/types/api";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface VolumeChartProps {
  data: VolumePoint[];
  bucket: "hour" | "day";
}

function formatBucketLabel(bucket: string, mode: "hour" | "day"): string {
  const date = new Date(bucket);
  if (isNaN(date.getTime())) return bucket;
  if (mode === "hour") {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function CustomTooltip({
  active,
  payload,
  label,
  bucket,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  bucket: "hour" | "day";
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-card px-3 py-2 text-card-foreground shadow-sm">
      <p className="text-xs text-muted-foreground">
        {formatBucketLabel(label ?? "", bucket)}
      </p>
      <p className="text-sm font-medium tabular-nums">
        {payload[0].value.toLocaleString()} events
      </p>
    </div>
  );
}

export function VolumeChart({ data, bucket }: VolumeChartProps) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="volumeFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="oklch(var(--muted))" stopOpacity={0.6} />
            <stop offset="100%" stopColor="oklch(var(--muted))" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid
          stroke="var(--color-border)"
          strokeDasharray="3 3"
          vertical={false}
        />
        <XAxis
          dataKey="bucket"
          axisLine={false}
          tickLine={false}
          tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
          tickFormatter={(v: string) => formatBucketLabel(v, bucket)}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
          width={40}
        />
        <Tooltip
          content={<CustomTooltip bucket={bucket} />}
          cursor={{ stroke: "var(--color-border)" }}
        />
        <Area
          type="monotone"
          dataKey="count"
          stroke="var(--color-foreground)"
          strokeWidth={1.5}
          fill="url(#volumeFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

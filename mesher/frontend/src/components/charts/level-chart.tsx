import type { LevelBreakdown } from "@/types/api";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface LevelChartProps {
  data: LevelBreakdown[];
}

function getLevelColor(level: string): string {
  switch (level.toLowerCase()) {
    case "error":
    case "fatal":
      return "oklch(0.577 0.245 27.325)";
    case "warning":
      return "oklch(0.75 0.18 85)";
    case "info":
      return "var(--color-muted-foreground)";
    case "debug":
      return "var(--color-muted)";
    default:
      return "var(--color-muted-foreground)";
  }
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: LevelBreakdown }>;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="rounded-md border bg-card px-3 py-2 text-card-foreground shadow-sm">
      <p className="text-xs capitalize text-muted-foreground">{item.level}</p>
      <p className="text-sm font-medium tabular-nums">
        {item.count.toLocaleString()} events
      </p>
    </div>
  );
}

export function LevelChart({ data }: LevelChartProps) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <XAxis
          dataKey="level"
          axisLine={false}
          tickLine={false}
          tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
          width={40}
        />
        <Tooltip
          content={<CustomTooltip />}
          cursor={{ fill: "var(--color-accent)", opacity: 0.5 }}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {data.map((entry) => (
            <Cell key={entry.level} fill={getLevelColor(entry.level)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

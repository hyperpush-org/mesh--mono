"use client"

import { useDashboardIssuesState } from "@/components/dashboard/dashboard-issues-state"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts"

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div
      className="rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5 text-[11px] font-mono"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <p className="mb-1.5 text-[10px] text-[var(--text-tertiary)]">{label}</p>
      {payload.map((point: any) => (
        <div key={point.dataKey} className="flex items-center gap-2 py-0.5">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: point.color }} />
          <span className="capitalize text-[var(--text-secondary)]">{point.dataKey}</span>
          <span className="ml-auto font-semibold" style={{ color: point.color }}>
            {point.value}
          </span>
        </div>
      ))}
    </div>
  )
}

export function EventsChart() {
  const { eventSeries, chartSource } = useDashboardIssuesState()

  return (
    <div
      className="border-b border-[var(--line)] bg-[var(--surface)] px-6 pt-4 pb-4"
      data-source={chartSource}
      data-testid="issues-events-chart"
    >
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
            Event Volume
          </span>
          <div className="flex items-center gap-4">
            {[
              { key: "critical", color: "var(--red)" },
              { key: "high", color: "var(--yellow)" },
              { key: "medium", color: "var(--blue)" },
              { key: "low", color: "var(--text-faint)" },
            ].map(({ key, color }) => (
              <span
                key={key}
                className="flex items-center gap-1.5 text-[10px] capitalize text-[var(--text-secondary)]"
              >
                <span className="h-[6px] w-[6px] rounded-full" style={{ backgroundColor: color }} />
                {key}
              </span>
            ))}
          </div>
        </div>

        <span className="text-[10px] text-[var(--text-faint)]">Live buckets · severity split derived from live level totals</span>
      </div>
      {eventSeries.length === 0 ? <div className="flex h-[88px] items-center justify-center text-[11px] text-[var(--text-tertiary)]">No events in the current 24-hour window.</div> : (
      <div style={{ height: 88 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={eventSeries} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="gradCrit" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--red)" stopOpacity={0.2} />
                <stop offset="100%" stopColor="var(--red)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradHigh" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--yellow)" stopOpacity={0.12} />
                <stop offset="100%" stopColor="var(--yellow)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradMed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--blue)" stopOpacity={0.08} />
                <stop offset="100%" stopColor="var(--blue)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--line)"
              strokeOpacity={0.4}
              horizontal
              vertical={false}
            />
            <XAxis dataKey="time" tick={false} axisLine={false} tickLine={false} height={0} />
            <YAxis
              width={32}
              tick={{ fontSize: 9, fill: "var(--text-faint)" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: "var(--line)", strokeWidth: 1 }} />
            <Area
              type="monotone"
              dataKey="medium"
              stroke="var(--blue)"
              strokeWidth={1}
              fill="url(#gradMed)"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="high"
              stroke="var(--yellow)"
              strokeWidth={1.5}
              fill="url(#gradHigh)"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="critical"
              stroke="var(--red)"
              strokeWidth={1.5}
              fill="url(#gradCrit)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      )}
    </div>
  )
}

'use client'

import { Activity, AlertTriangle, TrendingUp, Zap } from 'lucide-react'
import { useDashboardIssuesState } from '@/components/dashboard/dashboard-issues-state'
import type { IssueSummaryFieldSource } from '@/lib/issues-live-adapter'

function Stat({ label, value, source, icon: Icon }: { label: string; value: string | number; source: IssueSummaryFieldSource; icon: React.ElementType }) {
  return (
    <div className="px-4 py-3" data-source={source}>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.08em] text-[var(--text-tertiary)]"><span>{label}</span><Icon size={12} /></div>
      <p className="mt-2 text-xl font-bold tabular-nums text-[var(--text-primary)]">{value}</p>
      <p className="mt-1 text-[9px] uppercase text-[var(--text-faint)]">{source === 'derived-live' ? 'derived from live data' : 'live'}</p>
    </div>
  )
}

export function StatsBar({ compact: _compact = false }: { compact?: boolean }) {
  const { stats, statsFieldSources, bootstrapState, bootstrapError } = useDashboardIssuesState()
  return (
    <div className="grid grid-cols-2 border-b border-[var(--line)] bg-[var(--surface)] md:grid-cols-4" data-bootstrap-state={bootstrapState} data-source="live" data-testid="issues-stats-bar">
      <div className="col-span-full border-b border-[var(--line)] px-4 py-2 text-[10px] uppercase tracking-[0.08em] text-[var(--text-secondary)]">
        {bootstrapState === 'loading' ? 'Loading live issue overview…' : bootstrapState === 'failed' ? `Live overview unavailable (${bootstrapError?.code ?? 'unknown'})` : 'Live issue overview · 24-hour event window'}
      </div>
      <Stat icon={Activity} label="Total Events" source={statsFieldSources.totalEvents} value={stats.totalEvents.toLocaleString()} />
      <Stat icon={AlertTriangle} label="Critical Issues" source={statsFieldSources.criticalIssues} value={stats.criticalIssues} />
      <Stat icon={TrendingUp} label="Open Issues" source={statsFieldSources.openIssues} value={stats.openIssues} />
      <Stat icon={Zap} label="Events/min" source={statsFieldSources.eventsPerMin} value={stats.eventsPerMin} />
    </div>
  )
}

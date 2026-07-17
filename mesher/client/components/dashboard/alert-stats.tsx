import type { AlertsBootstrapError, AlertsBootstrapState } from '@/components/dashboard/alerts-live-state'
import type { AlertsOverviewStats } from '@/lib/alerts-live-adapter'

export function AlertStatsBar({ stats, bootstrapState, bootstrapError }: { stats: AlertsOverviewStats; bootstrapState: AlertsBootstrapState; bootstrapError: AlertsBootstrapError | null }) {
  return (
    <div className="grid grid-cols-2 border-b border-[var(--line)] bg-[var(--surface)] md:grid-cols-4" data-source="live" data-testid="alerts-stats-bar">
      <div className="col-span-full border-b border-[var(--line)] px-4 py-2 text-[10px] uppercase tracking-[0.08em] text-[var(--text-secondary)]">{bootstrapState === 'loading' ? 'Loading live alerts…' : bootstrapState === 'failed' ? `Live alerts unavailable (${bootstrapError?.code ?? 'unknown'})` : 'Live alert lifecycle totals'}</div>
      {([['Total alerts', stats.totalAlerts], ['Firing', stats.firing], ['Acknowledged', stats.acknowledged], ['Resolved', stats.resolved]] as const).map(([label, value]) => <div key={label} className="px-4 py-3"><p className="text-[10px] uppercase text-[var(--text-tertiary)]">{label}</p><p className="mt-2 text-xl font-bold tabular-nums">{value}</p><p className="mt-1 text-[9px] uppercase text-[var(--text-faint)]">derived from live records</p></div>)}
    </div>
  )
}

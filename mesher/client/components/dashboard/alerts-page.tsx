'use client'

import { useMemo, useState } from 'react'
import { AlertDetail } from '@/components/dashboard/alert-detail'
import { AlertList } from '@/components/dashboard/alert-list'
import { AlertStatsBar } from '@/components/dashboard/alert-stats'
import { useAlertsLiveState } from '@/components/dashboard/alerts-live-state'

export function AlertsPage() {
  const state = useAlertsLiveState()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const filteredAlerts = useMemo(() => state.alerts.filter((alert) => {
    const matchesSearch = !search.trim() || `${alert.name} ${alert.description} ${alert.id}`.toLowerCase().includes(search.trim().toLowerCase())
    return matchesSearch && (statusFilter === 'all' || alert.status === statusFilter)
  }), [search, state.alerts, statusFilter])

  return (
    <>
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto" data-bootstrap-state={state.bootstrapState} data-live-alert-count={state.liveAlertCount} data-overview-source="live" data-testid="alerts-shell">
        <AlertStatsBar bootstrapError={state.bootstrapError} bootstrapState={state.bootstrapState} stats={state.stats} />
        <div className="flex gap-2 border-b border-[var(--line)] bg-[var(--surface)] px-4 py-2.5">
          <input aria-label="Search alerts" className="min-w-48 flex-1 rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-3 py-1.5 text-xs" onChange={(event) => setSearch(event.target.value)} placeholder="Search live alerts…" value={search} />
          <select aria-label="Alert status" className="rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-2 text-xs" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}><option value="all">All statuses</option><option value="firing">Firing</option><option value="acknowledged">Acknowledged</option><option value="resolved">Resolved</option></select>
        </div>
        {state.bootstrapState === 'failed' ? <div className="m-4 rounded border border-[var(--red)]/30 bg-[var(--red)]/5 p-4 text-sm text-[var(--red)]" role="alert">Alerts are unavailable ({state.bootstrapError?.code ?? 'unknown error'}). No fallback records were loaded.</div> : <AlertList alerts={filteredAlerts} onSelect={state.selectAlert} selectedId={state.selectedAlertId} />}
      </div>
      {state.selectedAlert ? (
        <aside className="relative z-10 w-[420px] shrink-0 border-l border-[var(--line)]" data-source="live" data-testid="alert-detail-panel">
          <AlertDetail
            actionErrorCode={state.actionError?.code ?? null}
            actionPhase={state.actionPhase}
            alert={state.selectedAlert}
            isActionPending={state.isActionPending}
            lastAction={state.lastAction}
            lastActionAlertId={state.lastActionAlertId}
            onClose={state.clearSelectedAlert}
            onRunLiveAction={(action) => void state.runAlertAction(state.selectedAlert!.id, action)}
          />
        </aside>
      ) : null}
    </>
  )
}

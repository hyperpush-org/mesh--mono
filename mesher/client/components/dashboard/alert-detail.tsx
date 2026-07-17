'use client'

import { CheckCircle2, LoaderCircle, ShieldAlert, X } from 'lucide-react'
import type { Alert, AlertLiveAction } from '@/lib/dashboard-types'
import type { AlertsActionPhase } from '@/components/dashboard/alerts-live-state'

export function AlertDetail({ alert, actionPhase, actionErrorCode, lastAction, lastActionAlertId, isActionPending, onRunLiveAction, onClose }: {
  alert: Alert
  actionPhase: AlertsActionPhase
  actionErrorCode: string | null
  lastAction: string | null
  lastActionAlertId: string | null
  isActionPending: boolean
  onRunLiveAction: (action: AlertLiveAction) => void
  onClose: () => void
}) {
  return (
    <div className="flex h-full flex-col bg-[var(--surface)]">
      <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3"><span className="font-mono text-xs text-[var(--text-faint)]">{alert.id}</span><button aria-label="Close alert details" data-testid="alert-detail-close" onClick={onClose} type="button"><X size={16} /></button></div>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="flex gap-2 text-[10px] uppercase"><span>{alert.severity}</span><span data-testid="alert-detail-status-label">{alert.status}</span><span data-testid="alert-detail-source-badge">live</span></div>
        <h2 className="mt-3 text-base font-semibold">{alert.name}</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">{alert.description}</p>
        <dl className="mt-4 divide-y divide-[var(--line)] rounded border border-[var(--line)] px-3">
          {[
            ['Current value', alert.currentValue], ['Threshold', alert.threshold], ['Condition', alert.condition], ['Window', alert.evaluationWindow], ['Project', alert.project], ['Environment', alert.environment], ['Triggered', alert.triggeredAt], ['Last fired', alert.lastFired], ['Fired count', String(alert.firedCount)],
          ].filter((row): row is [string, string] => Boolean(row[1])).map(([label, value]) => <div key={label} className="flex justify-between gap-3 py-2 text-[11px]"><dt className="text-[var(--text-faint)]">{label}</dt><dd className="text-right text-[var(--text-secondary)]">{value}</dd></div>)}
        </dl>
        {alert.history.length > 0 ? <div className="mt-4" data-testid="alert-detail-history"><h3 className="text-[10px] font-semibold uppercase text-[var(--text-faint)]">History</h3>{alert.history.map((entry, index) => <p key={`${entry.timestamp}-${index}`} className="mt-2 text-[11px]"><span className="mr-2 text-[var(--text-faint)]">{entry.timestamp}</span>{entry.status} · {entry.value}</p>)}</div> : null}
        {lastActionAlertId === alert.id && actionPhase === 'failed' ? <p className="mt-4 text-[11px] text-[var(--red)]" role="alert">Action failed ({actionErrorCode ?? 'unknown'}).</p> : null}
      </div>
      <div className="flex gap-2 border-t border-[var(--line)] px-4 py-3" data-testid="alert-detail-actions">
        {alert.supportedActions.map((action) => {
          const pending = lastActionAlertId === alert.id && lastAction === action && isActionPending
          return <button key={action} aria-busy={pending} className="flex items-center gap-1 rounded-md bg-[var(--surface-3)] px-3 py-2 text-[11px]" data-source="live" data-testid={`alert-detail-action-${action}`} disabled={isActionPending} onClick={() => onRunLiveAction(action)} type="button">{pending ? <LoaderCircle size={12} className="animate-spin" /> : action === 'acknowledge' ? <ShieldAlert size={12} /> : <CheckCircle2 size={12} />}{pending ? `${action}…` : action}</button>
        })}
      </div>
    </div>
  )
}

'use client'

import { Bell } from 'lucide-react'
import type { Alert } from '@/lib/dashboard-types'
import { cn } from '@/lib/utils'

export function AlertList({ alerts, selectedId, onSelect }: { alerts: Alert[]; selectedId: string | null; onSelect: (id: string) => void }) {
  if (alerts.length === 0) return <div className="flex flex-col items-center justify-center py-24 text-center" data-testid="alerts-list-empty"><Bell size={20} className="mb-3 text-[var(--text-tertiary)]" /><p className="text-sm font-medium">No alerts found</p><p className="mt-1 text-[11px] text-[var(--text-secondary)]">The live project has no matching alerts.</p></div>
  return (
    <div data-source="live" data-testid="alerts-list">
      {alerts.map((alert) => (
        <button key={alert.id} className={cn('w-full border-b border-[var(--line)] px-5 py-3.5 text-left hover:bg-[var(--surface-2)]/60', selectedId === alert.id && 'bg-[var(--surface-2)]')} data-source="live" data-testid={`alert-row-${alert.id}`} onClick={() => onSelect(alert.id)} type="button">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0"><p className="truncate text-sm font-semibold text-[var(--text-primary)]">{alert.name}</p><p className="mt-1 truncate text-xs text-[var(--text-secondary)]">{alert.description}</p><div className="mt-1.5 flex gap-2 text-[10px] text-[var(--text-tertiary)]"><span>{alert.severity}</span><span>{alert.status}</span><span>{alert.project}</span>{alert.environment ? <span>{alert.environment}</span> : null}</div></div>
            <div className="shrink-0 text-right"><p className="font-mono text-xs">{alert.currentValue ?? 'Not recorded'}</p><p className="mt-1 text-[10px] text-[var(--text-tertiary)]">{alert.triggeredAt}</p></div>
          </div>
        </button>
      ))}
    </div>
  )
}

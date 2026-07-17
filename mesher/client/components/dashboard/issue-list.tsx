'use client'

import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Issue, IssueStatus, Severity } from '@/lib/dashboard-types'

const severityColor: Record<Severity, string> = {
  critical: 'var(--red)', high: 'var(--yellow)', medium: 'var(--blue)', low: 'var(--text-faint)',
}

const statusClasses: Record<IssueStatus, string> = {
  open: 'bg-[var(--red)]/10 text-[var(--red)]',
  resolved: 'bg-[var(--green)]/10 text-[var(--green)]',
  ignored: 'bg-[var(--surface-3)] text-[var(--text-secondary)]',
}

interface IssueListProps {
  issues: Issue[]
  selectedId: string | null
  onSelect: (id: string) => void
  statusFilter: string
  severityFilter: string
}

export function IssueList({ issues, selectedId, onSelect, statusFilter, severityFilter }: IssueListProps) {
  if (issues.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center" data-testid="issues-list-empty">
        <Sparkles size={20} className="mb-3 text-[var(--text-tertiary)]" />
        <p className="text-sm font-medium text-[var(--text-primary)]">No issues found</p>
        <p className="mt-1 text-[11px] text-[var(--text-secondary)]">The live project has no matching issues.</p>
      </div>
    )
  }

  return (
    <div className="min-h-[16rem]" data-source="live" data-testid="issues-list">
      <div className="border-b border-[var(--line)] bg-[var(--surface)] px-5 py-2 text-[11px] text-[var(--text-secondary)]">
        <strong className="text-[var(--text-primary)]">{issues.length}</strong> live issues
        {statusFilter !== 'all' ? ` · ${statusFilter}` : ''}{severityFilter !== 'all' ? ` · ${severityFilter}` : ''}
      </div>
      {issues.map((issue) => (
        <button
          key={issue.id}
          className={cn('relative w-full border-b border-[var(--line)] px-5 py-3.5 text-left hover:bg-[var(--surface-2)]/60', selectedId === issue.id && 'bg-[var(--surface-2)]')}
          data-source="live"
          data-status={issue.status}
          data-testid={`issue-row-${issue.id}`}
          onClick={() => onSelect(issue.id)}
          type="button"
        >
          <span className="absolute inset-y-0 left-0 w-[3px]" style={{ backgroundColor: severityColor[issue.severity] }} />
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-sm font-semibold text-[var(--text-primary)]">{issue.title}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-tertiary)]">
                <span className="uppercase" style={{ color: severityColor[issue.severity] }}>{issue.severity}</span>
                <span className="font-mono">{issue.id}</span>
                <span className={cn('rounded px-1.5 py-0.5', statusClasses[issue.status])} data-source="live" data-testid={`issue-row-status-${issue.id}`}>{issue.status}</span>
                <span>{issue.project}</span>
                {issue.assignee ? <span>Assigned {issue.assignee}</span> : null}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-bold tabular-nums text-[var(--text-primary)]">{issue.count.toLocaleString()}</p>
              <p className="text-[10px] text-[var(--text-tertiary)]">events · {issue.lastSeen}</p>
            </div>
          </div>
        </button>
      ))}
    </div>
  )
}

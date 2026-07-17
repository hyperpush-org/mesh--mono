'use client'

import { useState } from 'react'
import { Check, Copy, LoaderCircle, X } from 'lucide-react'
import type { Issue } from '@/lib/dashboard-types'
import type { IssueRecentEvent } from '@/lib/issues-live-adapter'
import type { IssueMutationPhase, SelectedIssueState } from '@/components/dashboard/dashboard-issues-state'
import { cn } from '@/lib/utils'

interface IssueDetailProps {
  issue: Issue
  detailState: SelectedIssueState
  latestEventId: string | null
  recentEvents: IssueRecentEvent[]
  errorCode: string | null
  liveActionPhase: IssueMutationPhase
  liveActionErrorCode: string | null
  liveActionIssueId: string | null
  lastLiveAction: string | null
  isLiveActionPending: boolean
  onRunLiveAction: (action: string) => void
  onClose: () => void
}

function supportedActions(issue: Issue) {
  if (issue.status === 'open') return [{ action: 'resolve', label: 'Resolve' }, { action: 'archive', label: 'Ignore' }]
  if (issue.status === 'resolved') return [{ action: 'unresolve', label: 'Reopen' }]
  return [{ action: 'unresolve', label: 'Reopen' }]
}

export function IssueDetail(props: IssueDetailProps) {
  const { issue } = props
  const [tab, setTab] = useState<'stack' | 'breadcrumbs' | 'context'>('stack')
  const [copied, setCopied] = useState(false)
  const currentIssueAction = props.liveActionIssueId === issue.id

  async function copyId() {
    await navigator.clipboard.writeText(issue.id)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <aside className="flex h-full flex-col overflow-hidden border-l border-[var(--line)] bg-[var(--surface)]">
      <div className="flex h-[var(--header-height)] items-center justify-between border-b border-[var(--line)] px-4">
        <button className="flex items-center gap-1 font-mono text-[11px] text-[var(--text-tertiary)]" onClick={() => void copyId()} type="button">{copied ? <Check size={11} /> : <Copy size={11} />}{issue.id}</button>
        <button aria-label="Close issue details" data-testid="issue-detail-close" onClick={props.onClose} type="button"><X size={15} /></button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-4">
          <h2 className="break-words text-sm font-semibold text-[var(--text-primary)]">{issue.title}</h2>
          <p className="mt-1 text-[11px] text-[var(--text-secondary)]">{issue.subtitle}</p>
          {issue.file ? <p className="mt-1 font-mono text-[10px] text-[var(--text-faint)]">{issue.file}</p> : null}
        </div>

        {props.detailState === 'loading' ? <p className="mx-4 mb-3 text-[11px] text-[var(--text-secondary)]"><LoaderCircle className="mr-1 inline animate-spin" size={12} />Loading live event evidence…</p> : null}
        {props.detailState === 'failed' ? <p className="mx-4 mb-3 rounded border border-[var(--red)]/30 bg-[var(--red)]/5 p-3 text-[11px] text-[var(--red)]" role="alert">Event evidence unavailable ({props.errorCode ?? 'unknown'}). No fallback detail was loaded.</p> : null}

        <div className="flex flex-wrap gap-2 px-4 pb-3" data-testid="issue-detail-actions">
          {supportedActions(issue).map(({ action, label }) => {
            const pending = currentIssueAction && props.lastLiveAction === action && props.isLiveActionPending
            return (
              <button key={action} aria-busy={pending} className="rounded-md bg-[var(--surface-3)] px-3 py-2 text-[11px] font-medium" data-source="live" data-testid={`issue-detail-action-${action}`} disabled={props.isLiveActionPending} onClick={() => props.onRunLiveAction(action)} type="button">
                {pending ? `${label}…` : label}
              </button>
            )
          })}
        </div>
        {currentIssueAction && props.liveActionPhase === 'failed' ? <p className="mx-4 mb-3 text-[11px] text-[var(--red)]" role="alert">Action failed ({props.liveActionErrorCode ?? 'unknown'}).</p> : null}

        <dl className="mx-4 mb-3 divide-y divide-[var(--line)] rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3">
          {[
            ['Status', issue.status], ['Severity', issue.severity], ['Events', issue.count.toLocaleString()],
            ['First seen', issue.firstSeen], ['Last seen', issue.lastSeen], ['Project', issue.project],
            ['Environment', issue.environment], ['SDK', issue.sdkName ? `${issue.sdkName}${issue.sdkVersion ? ` ${issue.sdkVersion}` : ''}` : null],
            ['Session', issue.sessionId], ['Latest event', props.latestEventId],
          ].filter((row): row is [string, string] => Boolean(row[1])).map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3 py-2 text-[11px]"><dt className="text-[var(--text-faint)]">{label}</dt><dd className="break-all text-right text-[var(--text-secondary)]">{value}</dd></div>
          ))}
        </dl>

        {props.recentEvents.length > 0 ? (
          <div className="mx-4 mb-3 rounded-lg border border-[var(--line)] p-3" data-testid="issue-detail-recent-events">
            <h3 className="text-[10px] font-semibold uppercase text-[var(--text-faint)]">Recent events</h3>
            {props.recentEvents.map((event) => <div key={event.id} className="mt-2 text-[11px]"><span className="mr-2 text-[var(--text-faint)]">{event.time}</span><span>{event.message}</span></div>)}
          </div>
        ) : null}

        <div className="sticky top-0 flex border-b border-[var(--line)] bg-[var(--surface)] px-4">
          {(['stack', 'breadcrumbs', 'context'] as const).map((nextTab) => <button key={nextTab} className={cn('mr-5 border-b px-0 py-2.5 text-[11px]', tab === nextTab ? 'border-[var(--text-primary)] text-[var(--text-primary)]' : 'border-transparent text-[var(--text-tertiary)]')} onClick={() => setTab(nextTab)} type="button">{nextTab}</button>)}
        </div>

        <div className="px-4 py-3 text-[11px]">
          {tab === 'stack' ? issue.stacktrace.length === 0 ? <p data-testid="issue-detail-stack-empty">No stack trace recorded.</p> : issue.stacktrace.map((frame, index) => <div key={`${frame.file}-${index}`} className="mb-2 rounded border border-[var(--line)] bg-[var(--surface-2)] p-2 font-mono"><p>{frame.fn}</p><p className="text-[var(--text-faint)]">{frame.file}:{frame.line}:{frame.col}</p>{frame.code.map((line) => <p key={line} className="mt-1">{line}</p>)}</div>) : null}
          {tab === 'breadcrumbs' ? issue.breadcrumbs.length === 0 ? <p data-testid="issue-detail-breadcrumbs-empty">No breadcrumbs recorded.</p> : issue.breadcrumbs.map((breadcrumb, index) => <div key={`${breadcrumb.time}-${index}`} className="mb-2"><span className="mr-2 text-[var(--text-faint)]">{breadcrumb.time}</span><span>{breadcrumb.message}</span></div>) : null}
          {tab === 'context' ? <div className="flex flex-wrap gap-1.5">{issue.tags.length === 0 ? <p>No tags recorded.</p> : issue.tags.map((tag) => <span key={tag} className="rounded bg-[var(--surface-2)] px-2 py-1 font-mono">{tag}</span>)}</div> : null}
        </div>
      </div>
    </aside>
  )
}

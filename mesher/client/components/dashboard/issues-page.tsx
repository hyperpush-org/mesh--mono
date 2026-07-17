'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { EventsChart } from '@/components/dashboard/events-chart'
import { FilterBar } from '@/components/dashboard/header'
import { IssueDetail } from '@/components/dashboard/issue-detail'
import { IssueList } from '@/components/dashboard/issue-list'
import { StatsBar } from '@/components/dashboard/stats-bar'
import { useDashboardIssuesState } from '@/components/dashboard/dashboard-issues-state'
import type { Issue } from '@/lib/dashboard-types'

export function IssuesPage() {
  const state = useDashboardIssuesState()
  const [closingIssue, setClosingIssue] = useState<Issue | null>(null)
  const [isClosing, setIsClosing] = useState(false)
  const closeTimeoutRef = useRef<number | null>(null)

  const clearPendingClose = useCallback(() => {
    if (closeTimeoutRef.current !== null) window.clearTimeout(closeTimeoutRef.current)
    closeTimeoutRef.current = null
  }, [])

  useEffect(() => clearPendingClose, [clearPendingClose])
  useEffect(() => {
    if (!state.selectedIssue) return
    clearPendingClose()
    setClosingIssue(null)
    setIsClosing(false)
  }, [clearPendingClose, state.selectedIssue])

  const closeIssuePanel = useCallback(() => {
    if (!state.selectedIssue) {
      state.clearSelectedIssue()
      return
    }
    clearPendingClose()
    setClosingIssue(state.selectedIssue)
    setIsClosing(true)
    closeTimeoutRef.current = window.setTimeout(() => {
      state.clearSelectedIssue()
      setClosingIssue(null)
      setIsClosing(false)
      closeTimeoutRef.current = null
    }, 150)
  }, [clearPendingClose, state])

  const selectIssue = useCallback((id: string) => {
    if (state.selectedIssueId === id) {
      closeIssuePanel()
      return
    }
    clearPendingClose()
    setClosingIssue(null)
    setIsClosing(false)
    state.selectIssue(id)
  }, [clearPendingClose, closeIssuePanel, state])

  const detailIssue = state.selectedIssue ?? closingIssue

  return (
    <>
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto"
        data-bootstrap-error-code={state.bootstrapError?.code ?? ''}
        data-bootstrap-state={state.bootstrapState}
        data-live-issue-count={state.liveIssueCount}
        data-overview-source="live"
        data-testid="issues-shell"
      >
        <StatsBar compact={Boolean(detailIssue)} />
        <EventsChart />
        <FilterBar
          onSearch={state.setSearch}
          onSeverityFilter={state.setSeverityFilter}
          onStatusFilter={state.setStatusFilter}
          search={state.search}
          severityFilter={state.severityFilter}
          statusFilter={state.statusFilter}
        />
        {state.bootstrapState === 'failed' ? (
          <div className="m-4 rounded-md border border-[var(--red)]/30 bg-[var(--red)]/5 p-4 text-sm text-[var(--red)]" role="alert">
            Issues are unavailable ({state.bootstrapError?.code ?? 'unknown error'}). No fallback records were loaded.
          </div>
        ) : (
          <IssueList
            issues={state.filteredIssues}
            onSelect={selectIssue}
            selectedId={state.selectedIssueId}
            severityFilter={state.severityFilter}
            statusFilter={state.statusFilter}
          />
        )}
      </div>

      {detailIssue ? (
        <div
          className={`relative z-10 flex w-[440px] shrink-0 flex-col overflow-hidden sm:w-[320px] md:w-[380px] ${isClosing ? 'panel-exit' : 'panel-enter'}`}
          data-source="live"
          data-state={state.selectedIssueState}
          data-testid="issue-detail-panel"
          style={{ boxShadow: 'var(--shadow-panel)' }}
        >
          <IssueDetail
            detailState={state.selectedIssueState}
            errorCode={state.selectedIssueError?.code ?? null}
            isLiveActionPending={state.isIssueMutationPending}
            issue={detailIssue}
            lastLiveAction={state.lastIssueAction}
            latestEventId={state.selectedIssueLatestEventId}
            liveActionErrorCode={state.lastIssueActionIssueId === detailIssue.id ? state.issueMutationError?.code ?? null : null}
            liveActionIssueId={state.lastIssueActionIssueId}
            liveActionPhase={state.issueMutationPhase}
            onClose={closeIssuePanel}
            onRunLiveAction={(action) => void state.runIssueAction(detailIssue.id, action)}
            recentEvents={state.selectedIssueRecentEvents}
          />
        </div>
      ) : null}
    </>
  )
}

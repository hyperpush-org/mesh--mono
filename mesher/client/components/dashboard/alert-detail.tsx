"use client"

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { Alert, AlertLiveAction } from '@/lib/mock-data'
import { X, CheckCircle2, BellOff, ShieldAlert, Clock, Activity, Zap, TrendingUp, Mail, MessageSquare, Phone, Copy, Sparkles, ChevronDown, ChevronRight, GitBranch, Tag, Database, AlertTriangle, LoaderCircle } from 'lucide-react'

const channelIcon: Record<string, React.ElementType> = {
  slack: MessageSquare,
  email: Mail,
  pagerduty: Phone,
}

const typeIcon: Record<string, React.ElementType> = {
  'error-rate': TrendingUp,
  latency: Clock,
  availability: Activity,
  custom: Zap,
}

type LiveActionDescriptor = {
  action: AlertLiveAction
  label: string
  pendingLabel: string
  variant: 'primary' | 'accent'
}

function getSupportedMaintainerActions(alert: Alert): LiveActionDescriptor[] {
  const supportedActions = alert.supportedActions ?? []

  return supportedActions.map((action) => {
    if (action === 'acknowledge') {
      return {
        action,
        label: 'Acknowledge',
        pendingLabel: 'Acknowledging…',
        variant: 'accent',
      }
    }

    return {
      action,
      label: 'Resolve',
      pendingLabel: 'Resolving…',
      variant: 'primary',
    }
  })
}

function DetailStatusBanner({
  detailSource,
}: {
  detailSource: 'none' | 'fallback' | 'mixed'
}) {
  if (detailSource === 'mixed') {
    return (
      <div
        className="mx-4 mb-3 flex items-start gap-2 rounded-lg border border-[var(--green)]/20 bg-[var(--green)]/[0.05] px-3 py-2 text-[11px] text-[var(--text-secondary)]"
        data-testid="alert-detail-live-banner"
      >
        <Database size={14} className="mt-0.5 shrink-0 text-[var(--green)]" />
        <div>
          <p className="font-medium text-[var(--text-primary)]">Live alerts active</p>
          <p>Status and lifecycle actions come from Mesher; unsupported shell fields stay visibly fallback-backed.</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="mx-4 mb-3 flex items-start gap-2 rounded-lg border border-[var(--red)]/20 bg-[var(--red)]/[0.05] px-3 py-2 text-[11px] text-[var(--text-secondary)]"
      data-testid="alert-detail-live-banner"
    >
      <AlertTriangle size={14} className="mt-0.5 shrink-0 text-[var(--red)]" />
      <div>
        <p className="font-medium text-[var(--text-primary)]">Fallback alert shell active</p>
        <p>Live alerts are unavailable, so lifecycle buttons stay disabled and the shell remains visible with explicit fallback markers.</p>
      </div>
    </div>
  )
}

function ActionButton({
  children,
  variant = 'secondary',
  onClick,
  disabled = false,
  busy = false,
  source,
  testId,
}: {
  children: React.ReactNode
  variant?: 'primary' | 'secondary' | 'accent'
  onClick?: () => void
  disabled?: boolean
  busy?: boolean
  source: string
  testId: string
}) {
  const base = 'inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[11px] font-medium transition-all duration-150 active:scale-[0.97]'
  const styles = {
    primary: 'bg-[var(--green)] text-[var(--background)] hover:bg-[var(--green)]/90',
    secondary: 'bg-[var(--surface-3)] text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]',
    accent: 'bg-[var(--yellow)]/[0.12] text-[var(--yellow)] hover:bg-[var(--yellow)]/[0.2]',
  }

  return (
    <button
      aria-busy={busy}
      className={cn(base, styles[variant], 'disabled:cursor-not-allowed disabled:opacity-60')}
      data-source={source}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}

interface AlertDetailProps {
  alert: Alert
  detailSource: 'none' | 'fallback' | 'mixed'
  actionPhase: 'idle' | 'mutating' | 'refreshing' | 'failed'
  actionErrorCode: string | null
  lastAction: string | null
  lastActionAlertId: string | null
  isActionPending: boolean
  onRunLiveAction: (action: AlertLiveAction) => void
  onClose: () => void
}

export function AlertDetail({
  alert,
  detailSource,
  actionPhase,
  actionErrorCode,
  lastAction,
  lastActionAlertId,
  isActionPending,
  onRunLiveAction,
  onClose,
}: AlertDetailProps) {
  const [showHistory, setShowHistory] = useState(false)
  const [showAI, setShowAI] = useState(true)
  const TypeIcon = typeIcon[alert.type]
  const liveActions = getSupportedMaintainerActions(alert)
  const isCurrentAlertAction = lastActionAlertId === alert.id
  const actionErrorVisible = isCurrentAlertAction && actionPhase === 'failed' && actionErrorCode

  const severityColor = {
    critical: 'text-[var(--red)] bg-[var(--red)]/[0.10] ring-[var(--red)]/20',
    high: 'text-[var(--yellow)] bg-[var(--yellow)]/[0.08] ring-[var(--yellow)]/15',
    medium: 'text-[var(--blue)] bg-[var(--blue)]/[0.08] ring-[var(--blue)]/15',
    low: 'text-[var(--text-tertiary)] bg-[var(--surface-3)] ring-[var(--line)]',
  }[alert.severity]

  const statusColor = {
    firing: 'text-[var(--red)]',
    acknowledged: 'text-[var(--yellow)]',
    resolved: 'text-[var(--green)]',
    silenced: 'text-[var(--yellow)]',
  }[alert.status]

  const shellOnlyAction = alert.status === 'silenced' ? 'Unsnooze' : 'Silence'

  return (
    <div className="flex h-full flex-col bg-[var(--surface-2)]">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--line)] px-4 py-3">
        <div className="min-w-0 flex items-center gap-2">
          <TypeIcon size={14} className="shrink-0 text-[var(--text-tertiary)]" />
          <span className="truncate font-mono text-[13px] text-[var(--text-faint)]">{alert.id}</span>
        </div>
        <button
          className="rounded p-1 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
          data-testid="alert-detail-close"
          onClick={onClose}
          type="button"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="border-b border-[var(--line)] px-4 py-4">
          <div className="mb-3 flex items-start gap-2">
            <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset', severityColor)}>
              {alert.severity}
            </span>
            <span className={cn('text-[10px] font-semibold uppercase', statusColor)} data-testid="alert-detail-status-label">
              {alert.status}
            </span>
            <span
              className="inline-flex items-center gap-1 rounded bg-[var(--surface-3)] px-2 py-1 text-[10px] font-medium text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--line)]"
              data-testid="alert-detail-source-badge"
            >
              {detailSource === 'mixed' ? 'mixed live' : 'fallback'}
            </span>
          </div>
          <h2 className="mb-2 text-[15px] font-semibold text-[var(--text-primary)]">{alert.name}</h2>
          <p className="leading-relaxed text-[13px] text-[var(--text-secondary)]">{alert.description}</p>
        </div>

        <DetailStatusBanner detailSource={detailSource} />

        <div className="border-b border-[var(--line)] px-4 py-4">
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">Current State</h3>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <p className="mb-1 text-[10px] text-[var(--text-faint)]">Current Value</p>
              <p className="text-[24px] font-bold tabular-nums" style={{ color: alert.severity === 'critical' ? 'var(--red)' : 'var(--text-primary)' }}>
                {alert.currentValue}
              </p>
            </div>
            <div className="text-[var(--line)]">
              <TrendingUp size={20} />
            </div>
            <div className="flex-1 text-right">
              <p className="mb-1 text-[10px] text-[var(--text-faint)]">Threshold</p>
              <p className="text-[16px] font-semibold tabular-nums text-[var(--text-secondary)]">{alert.threshold}</p>
            </div>
          </div>
        </div>

        <div className="border-b border-[var(--line)] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="mb-1 text-[10px] text-[var(--text-faint)]">Condition</p>
              <code className="text-[12px] font-mono text-[var(--blue)]">{alert.condition}</code>
            </div>
            <div className="text-right">
              <p className="mb-1 text-[10px] text-[var(--text-faint)]">Evaluation Window</p>
              <p className="text-[12px] text-[var(--text-secondary)]">{alert.evaluationWindow}</p>
            </div>
          </div>
        </div>

        <div className="border-b border-[var(--line)] px-4 py-3" data-testid="alert-detail-action-source-note">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)]">Maintainer actions</p>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-secondary)]">
            Acknowledge and Resolve call the provider-owned same-origin <code>/api/v1/alerts/…</code> seam when Mesher returned a live alert. {shellOnlyAction} stays visible as shell-only chrome and never pretends to be a live backend action.
          </p>
          {actionErrorVisible ? (
            <p
              className="mt-2 rounded-md border border-[var(--red)]/20 bg-[var(--red)]/[0.05] px-2.5 py-2 text-[11px] text-[var(--red)]"
              data-testid="alert-detail-action-error"
            >
              Last live action failed ({actionErrorCode}). The previous visible alert state stayed mounted until a refreshed read succeeds.
            </p>
          ) : null}
        </div>

        {alert.aiInsight && (
          <div className="border-b border-[var(--line)]">
            <button
              className="flex w-full items-center justify-between px-4 py-3 transition-colors hover:bg-[var(--surface-3)]"
              onClick={() => setShowAI(!showAI)}
              type="button"
            >
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-[var(--purple)]" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">AI Insight</span>
              </div>
              {showAI ? <ChevronDown size={14} className="text-[var(--text-tertiary)]" /> : <ChevronRight size={14} className="text-[var(--text-tertiary)]" />}
            </button>
            {showAI && (
              <div className="px-4 pb-3">
                <p className="rounded-md border border-[var(--purple)]/10 bg-[var(--purple)]/[0.05] p-3 text-[12px] leading-relaxed text-[var(--text-secondary)]">
                  {alert.aiInsight}
                </p>
              </div>
            )}
          </div>
        )}

        <div className="border-b border-[var(--line)] px-4 py-4">
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">Notification Channels</h3>
          <div className="flex flex-wrap gap-2">
            {alert.channels.map((channel) => {
              const Icon = channelIcon[channel]
              return Icon ? (
                <span
                  key={channel}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[var(--surface-3)] px-2 py-1 text-[11px] text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--line)]"
                >
                  <Icon size={10} />
                  {channel}
                </span>
              ) : null
            })}
          </div>
        </div>

        <div className="border-b border-[var(--line)] px-4 py-4">
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">Metadata</h3>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[var(--text-faint)]">Project</span>
              <span className="text-[11px] font-medium text-[var(--text-secondary)]">{alert.project}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[var(--text-faint)]">Environment</span>
              <span className="text-[11px] font-medium text-[var(--text-secondary)]">{alert.environment}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[var(--text-faint)]">Rule</span>
              <span className="text-[11px] font-medium text-[var(--text-secondary)]">{alert.ruleName ?? alert.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[var(--text-faint)]">Type</span>
              <span className="capitalize text-[11px] font-medium text-[var(--text-secondary)]">{alert.type.replace('-', ' ')}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[var(--text-faint)]">Triggered</span>
              <span className="text-[11px] text-[var(--text-secondary)]">{alert.triggeredAt}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[var(--text-faint)]">Last Fired</span>
              <span className="text-[11px] text-[var(--text-secondary)]">{alert.lastFired}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[var(--text-faint)]">Fired Count</span>
              <span className="text-[11px] font-medium text-[var(--text-secondary)]">{alert.firedCount}x</span>
            </div>
            {alert.assignee && (
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[var(--text-faint)]">Assignee</span>
                <span className="text-[11px] font-medium text-[var(--text-secondary)]">{alert.assignee}</span>
              </div>
            )}
            {alert.silenceUntil && (
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[var(--text-faint)]">Silenced Until</span>
                <span className="text-[11px] font-medium text-[var(--yellow)]">{alert.silenceUntil}</span>
              </div>
            )}
          </div>
        </div>

        {alert.tags.length > 0 && (
          <div className="border-b border-[var(--line)] px-4 py-4">
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">Tags</h3>
            <div className="flex flex-wrap gap-1.5">
              {alert.tags.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 rounded-md bg-[var(--surface-3)] px-1.5 py-1 text-[10px] text-[var(--text-faint)]">
                  <Tag size={8} />
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {alert.linkedIssue && (
          <div className="border-b border-[var(--line)] px-4 py-4">
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">Linked Issue</h3>
            <a className="inline-flex items-center gap-1.5 text-[11px] text-[var(--blue)] transition-colors hover:text-[var(--blue)]/80" href="#">
              <GitBranch size={10} />
              {alert.linkedIssue}
            </a>
          </div>
        )}

        <div className="border-b border-[var(--line)]">
          <button
            className="flex w-full items-center justify-between px-4 py-3 transition-colors hover:bg-[var(--surface-3)]"
            onClick={() => setShowHistory(!showHistory)}
            type="button"
          >
            <div className="flex items-center gap-2">
              <Activity size={14} className="text-[var(--text-tertiary)]" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">History</span>
              <span className="text-[10px] text-[var(--text-faint)]">({alert.history.length})</span>
            </div>
            {showHistory ? <ChevronDown size={14} className="text-[var(--text-tertiary)]" /> : <ChevronRight size={14} className="text-[var(--text-tertiary)]" />}
          </button>
          {showHistory && (
            <div className="px-4 pb-3" data-testid="alert-detail-history">
              <div className="space-y-2">
                {alert.history.map((entry, index) => (
                  <div key={`${entry.timestamp}-${index}`} className="flex items-center gap-3 text-[11px]">
                    <span className="w-16 shrink-0 text-[var(--text-faint)]">{entry.timestamp}</span>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5',
                        entry.status === 'firing'
                          ? 'bg-[var(--red)]/[0.10] text-[var(--red)]'
                          : entry.status === 'acknowledged'
                            ? 'bg-[var(--yellow)]/[0.10] text-[var(--yellow)]'
                            : 'bg-[var(--green)]/[0.10] text-[var(--green)]',
                      )}
                    >
                      {entry.status === 'firing' ? <BellOff size={8} /> : entry.status === 'acknowledged' ? <ShieldAlert size={8} /> : <CheckCircle2 size={8} />}
                      {entry.status}
                    </span>
                    <span className="font-mono text-[var(--text-secondary)]">{entry.value}</span>
                    {entry.notified && <span className="ml-auto text-[var(--text-faint)]">notified</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-[var(--line)] bg-[var(--surface)] px-4 py-3">
        <div className="flex flex-wrap gap-2" data-testid="alert-detail-actions">
          {liveActions.map((actionMeta) => {
            const isCurrentAction = isCurrentAlertAction && lastAction === actionMeta.action
            return (
              <ActionButton
                key={actionMeta.action}
                busy={isCurrentAction && isActionPending}
                disabled={isActionPending || detailSource !== 'mixed'}
                onClick={() => onRunLiveAction(actionMeta.action)}
                source="same-origin-live"
                testId={`alert-detail-action-${actionMeta.action}`}
                variant={actionMeta.variant}
              >
                {isCurrentAction && isActionPending ? <LoaderCircle size={12} className="animate-spin" /> : actionMeta.action === 'acknowledge' ? <ShieldAlert size={12} /> : <CheckCircle2 size={12} />}
                {isCurrentAction && isActionPending ? actionMeta.pendingLabel : actionMeta.label}
              </ActionButton>
            )
          })}

          <ActionButton
            disabled
            source="shell-only"
            testId={`alert-detail-action-${shellOnlyAction.toLowerCase()}`}
            variant="secondary"
          >
            <BellOff size={12} />
            {shellOnlyAction}
          </ActionButton>

          <ActionButton source="shell-only" testId="alert-detail-copy-link" variant="secondary">
            <Copy size={12} />
            Copy Link
          </ActionButton>
        </div>
      </div>
    </div>
  )
}

"use client"

import { cn } from '@/lib/utils'
import type { Alert, AlertStatus, AlertType, Severity } from '@/lib/mock-data'
import { GitBranch, Sparkles, Bell, BellOff, CheckCircle2, ShieldAlert, Activity, Clock, Zap, TrendingUp, AlertTriangle } from 'lucide-react'

const severityColor: Record<Severity, string> = {
  critical: 'var(--red)',
  high: 'var(--yellow)',
  medium: 'var(--blue)',
  low: 'var(--text-faint)',
}

const severityTextClass: Record<Severity, string> = {
  critical: 'text-[var(--red)]',
  high: 'text-[var(--yellow)]',
  medium: 'text-[var(--blue)]',
  low: 'text-[var(--text-tertiary)]',
}

const typeIcon: Record<AlertType, React.ElementType> = {
  'error-rate': TrendingUp,
  latency: Clock,
  availability: Activity,
  custom: Zap,
}

function StatusBadge({ status }: { status: AlertStatus }) {
  if (status === 'firing') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-[4px] px-1.5 py-[2px] text-[11px] font-semibold leading-none text-[var(--red)] ring-1 ring-inset ring-[var(--red)]/20 bg-[var(--red)]/[0.10]"
        data-status="firing"
      >
        <Bell size={8} className="animate-pulse" />
        firing
      </span>
    )
  }

  if (status === 'acknowledged') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-[4px] px-1.5 py-[2px] text-[11px] font-medium leading-none text-[var(--yellow)] ring-1 ring-inset ring-[var(--yellow)]/15 bg-[var(--yellow)]/[0.08]"
        data-status="acknowledged"
      >
        <ShieldAlert size={8} />
        acknowledged
      </span>
    )
  }

  if (status === 'resolved') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-[4px] px-1.5 py-[2px] text-[11px] font-medium leading-none text-[var(--green)] ring-1 ring-inset ring-[var(--green)]/15 bg-[var(--green)]/[0.08]"
        data-status="resolved"
      >
        <CheckCircle2 size={8} />
        resolved
      </span>
    )
  }

  return (
    <span
      className="inline-flex items-center gap-1 rounded-[4px] px-1.5 py-[2px] text-[11px] font-medium leading-none text-[var(--yellow)] ring-1 ring-inset ring-[var(--yellow)]/15 bg-[var(--yellow)]/[0.08]"
      data-status="silenced"
    >
      <BellOff size={8} />
      silenced
    </span>
  )
}

function ChannelBadges({ channels }: { channels: string[] }) {
  const channelIcons: Record<string, React.ElementType> = {
    slack: () => <span className="text-[9px] font-bold">#</span>,
    email: () => <span className="text-[9px] font-bold">@</span>,
    pagerduty: () => <span className="text-[9px] font-bold">!</span>,
  }

  return (
    <div className="flex items-center gap-1">
      {channels.map((channel) => {
        const Icon = channelIcons[channel]
        return Icon ? (
          <span
            key={channel}
            className="flex h-4 w-4 items-center justify-center rounded bg-[var(--surface-3)] text-[var(--text-tertiary)] ring-1 ring-inset ring-[var(--line)]"
            title={channel}
          >
            <Icon />
          </span>
        ) : null
      })}
    </div>
  )
}

interface AlertRowProps {
  alert: Alert
  isSelected: boolean
  onClick: () => void
}

function AlertRow({ alert, isSelected, onClick }: AlertRowProps) {
  const accent = severityColor[alert.severity]
  const TypeIcon = typeIcon[alert.type]
  const sourceLabel = alert.source === 'live' ? 'mixed live' : 'fallback'

  return (
    <button
      className={cn(
        'group relative w-full border-b border-[var(--line)] text-left transition-colors duration-100',
        isSelected ? 'bg-[var(--surface-2)]' : 'hover:bg-[var(--surface-2)]/60',
      )}
      data-alert-source={alert.source ?? 'fallback'}
      data-testid={`alert-row-${alert.id}`}
      onClick={onClick}
      type="button"
    >
      <div
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ backgroundColor: accent, opacity: alert.severity === 'low' ? 0.4 : 1 }}
      />

      <div className="px-3 py-3.5 pl-4 sm:px-4 sm:pl-5">
        <div className="flex items-start gap-3 sm:gap-5">
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex items-center gap-2">
              <TypeIcon size={14} className="shrink-0 text-[var(--text-tertiary)]" />
              <p className="truncate font-mono text-[13.5px] font-semibold leading-snug text-[var(--text-primary)] sm:text-sm">
                {alert.name}
              </p>
              <StatusBadge status={alert.status} />
            </div>

            <p className="mb-2 truncate text-[12px] text-[var(--text-secondary)]">{alert.description}</p>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className={cn('text-[11px] font-semibold uppercase tracking-[0.05em] leading-none', severityTextClass[alert.severity])}>
                {alert.severity}
              </span>
              <span className="text-[var(--line)]">·</span>
              <span className="text-[11px] font-mono text-[var(--text-faint)]">{alert.id}</span>
              <span className="text-[var(--line)]">·</span>
              <span className="text-[11px] font-medium text-[var(--text-faint)]">{alert.project}</span>
              <span className="opacity-60 text-[var(--line)]">·</span>
              <span className="text-[11px] font-medium text-[var(--text-faint)]">{alert.environment}</span>
              <span className="opacity-60 text-[var(--line)]">·</span>
              <span className="capitalize text-[11px] font-medium text-[var(--text-faint)]">{alert.type.replace('-', ' ')}</span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <code className="rounded-[4px] bg-[var(--blue)]/[0.08] px-1.5 py-[2px] text-[11px] font-mono leading-none text-[var(--blue)] ring-1 ring-inset ring-[var(--blue)]/15">
                {alert.condition}
              </code>
              <ChannelBadges channels={alert.channels} />
              {alert.linkedIssue && (
                <span className="inline-flex items-center gap-1 rounded-[4px] bg-[var(--surface-3)] px-1.5 py-[2px] font-mono text-[10px] leading-none text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--line)]">
                  <GitBranch size={9} className="opacity-60" />
                  {alert.linkedIssue}
                </span>
              )}
              {alert.aiInsight && (
                <span className="inline-flex items-center gap-1 rounded-[4px] bg-[var(--purple)]/[0.08] px-1.5 py-[2px] text-[10px] leading-none text-[var(--purple)] ring-1 ring-inset ring-[var(--purple)]/15">
                  <Sparkles size={9} />
                  AI
                </span>
              )}
              <span
                className="inline-flex items-center gap-1 rounded-[4px] bg-[var(--surface-3)] px-1.5 py-[2px] text-[10px] leading-none text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--line)]"
                data-testid={`alert-row-source-${alert.id}`}
              >
                {sourceLabel}
              </span>
              {alert.assignee && (
                <span className="ml-auto flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
                  <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[var(--surface-3)] text-[8px] font-bold uppercase text-[var(--text-primary)] ring-1 ring-inset ring-[var(--line)]">
                    {alert.assignee[0]}
                  </span>
                  {alert.assignee}
                </span>
              )}
            </div>
          </div>

          <div className="flex-shrink-0 flex-col items-end gap-2 pt-0.5 text-right">
            <div>
              <p className="text-sm font-bold tabular-nums" style={{ color: accent }}>
                {alert.currentValue}
              </p>
              <p className="mt-0.5 text-[10px] text-[var(--text-faint)]">threshold {alert.threshold}</p>
            </div>
            <div>
              <p className="text-[12px] font-medium text-[var(--text-primary)]">{alert.lastFired}</p>
              <p className="mt-1 text-[10px] text-[var(--text-faint)]">{alert.firedCount}x fired</p>
            </div>
          </div>
        </div>
      </div>
    </button>
  )
}

interface AlertListProps {
  alerts: Alert[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export function AlertList({ alerts, selectedId, onSelect }: AlertListProps) {
  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center" data-testid="alerts-empty-state">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--surface-2)] ring-1 ring-inset ring-[var(--line)]">
          <Bell size={20} className="text-[var(--text-tertiary)]" />
        </div>
        <p className="mb-1 text-sm font-medium text-[var(--text-primary)]">No alerts found</p>
        <p className="text-[11px] text-[var(--text-secondary)]">Try adjusting your filters</p>
      </div>
    )
  }

  return (
    <div className="min-h-[16rem]" data-testid="alerts-list">
      <div className="flex flex-wrap items-center gap-y-1.5 border-b border-[var(--line)] bg-[var(--surface)] py-2 pl-4 pr-3 sm:pl-5 sm:pr-4">
        <span className="whitespace-nowrap text-[11px] text-[var(--text-secondary)]">
          <span className="font-semibold tabular-nums text-[var(--text-primary)]">{alerts.length}</span> alerts
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button className="text-[11px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] active:scale-[0.97]" type="button">
            Bulk actions
          </button>
        </div>
      </div>

      {alerts.map((alert) => (
        <AlertRow
          key={alert.id}
          alert={alert}
          isSelected={selectedId === alert.id}
          onClick={() => onSelect(alert.id)}
        />
      ))}
    </div>
  )
}

"use client"

import { useCallback, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { type Alert, type AlertStatus, type AlertType, type Severity } from '@/lib/mock-data'
import { useAlertsLiveState } from '@/components/dashboard/alerts-live-state'
import { AlertStatsBar } from './alert-stats'
import { AlertList } from './alert-list'
import { AlertDetail } from './alert-detail'
import { Search, SlidersHorizontal, Bell, ShieldAlert, CheckCircle2, AlertTriangle, Zap, TrendingUp, Clock, Activity } from 'lucide-react'

type SortKey = 'triggeredAt' | 'lastFired' | 'firedCount' | 'currentValueNumeric' | 'severity'
type SortDir = 'asc' | 'desc'
type FilterStatus = 'all' | Exclude<AlertStatus, 'silenced'>

export function AlertsPage() {
  const {
    alerts,
    stats,
    statsFieldSources,
    bootstrapState,
    bootstrapError,
    liveAlertCount,
    overviewSource,
    selectedAlertId,
    selectedAlert,
    selectedAlertState,
    selectedAlertSource,
    actionPhase,
    actionError,
    lastAction,
    lastActionAlertId,
    isActionPending,
    selectAlert,
    clearSelectedAlert,
    runAlertAction,
  } = useAlertsLiveState()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('firing')
  const [typeFilter, setTypeFilter] = useState<AlertType | 'all'>('all')
  const [severityFilter, setSeverityFilter] = useState<Severity | 'all'>('all')
  const [sortKey, setSortKey] = useState<SortKey>('triggeredAt')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [closingAlert, setClosingAlert] = useState<Alert | null>(null)
  const [isClosingAlertPanel, setIsClosingAlertPanel] = useState(false)
  const closeTimeoutRef = useRef<number | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const clearPendingClose = useCallback(() => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
  }, [])

  const toggleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((current) => (current === 'desc' ? 'asc' : 'desc'))
      } else {
        setSortKey(key)
        setSortDir('desc')
      }
    },
    [sortKey],
  )

  const filteredAlerts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    const visibleAlerts = alerts.filter((alert) => {
      if (
        normalizedSearch &&
        !alert.name.toLowerCase().includes(normalizedSearch) &&
        !alert.description.toLowerCase().includes(normalizedSearch) &&
        !alert.id.toLowerCase().includes(normalizedSearch)
      ) {
        return false
      }

      if (statusFilter !== 'all' && alert.status !== statusFilter) {
        return false
      }

      if (typeFilter !== 'all' && alert.type !== typeFilter) {
        return false
      }

      if (severityFilter !== 'all' && alert.severity !== severityFilter) {
        return false
      }

      return true
    })

    visibleAlerts.sort((left, right) => {
      if (sortKey === 'severity') {
        const severityOrder: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1 }
        const leftValue = severityOrder[left.severity]
        const rightValue = severityOrder[right.severity]
        return sortDir === 'desc' ? rightValue - leftValue : leftValue - rightValue
      }

      const leftValue = left[sortKey]
      const rightValue = right[sortKey]
      return sortDir === 'desc'
        ? (rightValue as number) - (leftValue as number)
        : (leftValue as number) - (rightValue as number)
    })

    return visibleAlerts
  }, [alerts, search, severityFilter, sortDir, sortKey, statusFilter, typeFilter])

  const closePanel = useCallback(() => {
    if (!selectedAlert) {
      clearSelectedAlert()
      return
    }

    clearPendingClose()
    setClosingAlert(selectedAlert)
    setIsClosingAlertPanel(true)
    closeTimeoutRef.current = window.setTimeout(() => {
      clearSelectedAlert()
      setClosingAlert(null)
      setIsClosingAlertPanel(false)
      closeTimeoutRef.current = null
    }, 150)
  }, [clearPendingClose, clearSelectedAlert, selectedAlert])

  const openAlert = useCallback(
    (id: string) => {
      if (selectedAlertId === id) {
        closePanel()
        return
      }

      clearPendingClose()
      setClosingAlert(null)
      setIsClosingAlertPanel(false)
      selectAlert(id)
    },
    [clearPendingClose, closePanel, selectAlert, selectedAlertId],
  )

  const detailAlert = selectedAlert ?? closingAlert
  const hasPanel = detailAlert !== null
  const isCompact = hasPanel

  return (
    <>
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto transition-all duration-200 ease-out"
        data-alert-action-alert-id={lastActionAlertId ?? ''}
        data-alert-action-error-code={actionError?.code ?? ''}
        data-alert-action-error-stage={actionError?.stage ?? ''}
        data-alert-action-phase={actionPhase}
        data-bootstrap-error-code={bootstrapError?.code ?? ''}
        data-bootstrap-state={bootstrapState}
        data-has-detail-panel={hasPanel ? 'true' : 'false'}
        data-last-action={lastAction ?? ''}
        data-live-alert-count={String(liveAlertCount)}
        data-overview-source={overviewSource}
        data-search-value={search}
        data-selected-alert-id={selectedAlert?.id ?? ''}
        data-selected-alert-source={selectedAlertSource}
        data-selected-alert-state={selectedAlertState}
        data-severity-filter={severityFilter}
        data-status-filter={statusFilter}
        data-testid="alerts-shell"
      >
        <AlertStatsBar
          bootstrapErrorCode={bootstrapError?.code ?? null}
          bootstrapState={bootstrapState}
          compact={isCompact}
          overviewSource={overviewSource}
          statSources={statsFieldSources}
          stats={stats}
        />

        <AlertsFilterBar
          search={search}
          onSearch={setSearch}
          statusFilter={statusFilter}
          onStatusFilter={setStatusFilter}
          typeFilter={typeFilter}
          onTypeFilter={setTypeFilter}
          severityFilter={severityFilter}
          onSeverityFilter={setSeverityFilter}
        />

        <AlertsSortBar compact={isCompact} onToggleSort={toggleSort} sortDir={sortDir} sortKey={sortKey} />

        <AlertList alerts={filteredAlerts} onSelect={openAlert} selectedId={selectedAlertId} />
      </div>

      {detailAlert && (
        <div
          ref={panelRef}
          className={`relative z-10 flex w-[440px] shrink-0 flex-col overflow-hidden sm:w-[320px] md:w-[380px] ${isClosingAlertPanel ? 'panel-exit' : 'panel-enter'}`}
          data-action-error-code={actionError?.code ?? ''}
          data-action-error-stage={actionError?.stage ?? ''}
          data-action-phase={actionPhase}
          data-alert-status={detailAlert.status}
          data-last-action={lastAction ?? ''}
          data-source={detailAlert.source === 'live' ? 'mixed' : 'fallback'}
          data-state={detailAlert.source === 'live' ? 'ready' : 'fallback'}
          data-testid="alert-detail-panel"
          style={{ boxShadow: 'var(--shadow-panel)' }}
        >
          <AlertDetail
            actionErrorCode={lastActionAlertId === detailAlert.id ? actionError?.code ?? null : null}
            actionPhase={actionPhase}
            detailSource={detailAlert.source === 'live' ? 'mixed' : 'fallback'}
            alert={detailAlert}
            isActionPending={isActionPending}
            lastAction={lastAction}
            lastActionAlertId={lastActionAlertId}
            onClose={closePanel}
            onRunLiveAction={(action) => void runAlertAction(detailAlert.id, action)}
          />
        </div>
      )}
    </>
  )
}

interface FilterProps {
  search: string
  onSearch: (value: string) => void
  statusFilter: FilterStatus
  onStatusFilter: (value: FilterStatus) => void
  typeFilter: AlertType | 'all'
  onTypeFilter: (value: AlertType | 'all') => void
  severityFilter: Severity | 'all'
  onSeverityFilter: (value: Severity | 'all') => void
}

function AlertsFilterBar({
  search,
  onSearch,
  statusFilter,
  onStatusFilter,
  typeFilter,
  onTypeFilter,
  severityFilter,
  onSeverityFilter,
}: FilterProps) {
  const statuses: FilterStatus[] = ['all', 'firing', 'acknowledged', 'resolved']
  const types: (AlertType | 'all')[] = ['all', 'error-rate', 'latency', 'availability', 'custom']
  const severities: (Severity | 'all')[] = ['all', 'critical', 'high', 'medium', 'low']

  const typeIcon: Record<string, React.ElementType> = {
    'error-rate': TrendingUp,
    latency: Clock,
    availability: Activity,
    custom: Zap,
  }

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-[var(--line)] bg-[var(--surface)] px-2 py-2">
      <div className="relative w-48 shrink-0 md:w-52">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
        <input
          className="w-full bg-transparent py-1 pl-8 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-faint)] focus:outline-none transition-all duration-150"
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search alerts…"
          value={search}
        />
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-1">
        <div className="flex items-center gap-0.5">
          <SlidersHorizontal size={11} className="mr-1 hidden text-[var(--text-faint)] sm:block" />
          {statuses.map((status) => {
            const isActive = statusFilter === status
            const colorMap: Record<string, string> = {
              all: isActive ? 'bg-[var(--surface-3)] text-[var(--text-primary)]' : '',
              firing: isActive ? 'bg-[var(--red)]/[0.10] text-[var(--red)]' : '',
              acknowledged: isActive ? 'bg-[var(--yellow)]/[0.10] text-[var(--yellow)]' : '',
              resolved: isActive ? 'bg-[var(--green)]/[0.10] text-[var(--green)]' : '',
            }
            return (
              <button
                key={status}
                className={cn(
                  'flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium capitalize transition-all duration-150 active:scale-[0.96] sm:px-2',
                  colorMap[status] || 'text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]',
                )}
                data-testid={`alerts-status-filter-${status}`}
                onClick={() => onStatusFilter(status === statusFilter ? 'all' : status)}
                type="button"
              >
                {status === 'firing' && <Bell size={9} />}
                {status === 'acknowledged' && <ShieldAlert size={9} />}
                {status === 'resolved' && <CheckCircle2 size={9} />}
                {status === 'all' && <AlertTriangle size={9} />}
                {status}
              </button>
            )
          })}
        </div>

        <div className="mx-1 hidden h-3.5 w-px bg-[var(--line)] md:block" />

        <div className="flex items-center gap-0.5">
          {types.slice(0, 4).map((type) => {
            const isActive = typeFilter === type
            const Icon = type !== 'all' ? typeIcon[type] : AlertTriangle
            return (
              <button
                key={type}
                className={cn(
                  'flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium transition-all duration-150 active:scale-[0.96] sm:px-2',
                  isActive
                    ? 'bg-[var(--surface-3)] text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]',
                )}
                onClick={() => onTypeFilter(type === typeFilter ? 'all' : type)}
                title={type}
                type="button"
              >
                {type !== 'all' && <Icon size={9} />}
                <span className="hidden sm:inline">{type === 'all' ? 'All' : type.replace('-', ' ')}</span>
              </button>
            )
          })}
        </div>

        <div className="mx-1 hidden h-3.5 w-px bg-[var(--line)] md:block" />

        <div className="flex items-center gap-0.5">
          {severities.slice(1).map((severity) => {
            const isActive = severityFilter === severity
            const colorMap: Record<string, string> = {
              critical: isActive ? 'bg-[var(--red)]/[0.12] text-[var(--red)]' : '',
              high: isActive ? 'bg-[var(--yellow)]/[0.12] text-[var(--yellow)]' : '',
              medium: isActive ? 'bg-[var(--blue)]/[0.12] text-[var(--blue)]' : '',
              low: isActive ? 'bg-[var(--text-tertiary)]/[0.12] text-[var(--text-tertiary)]' : '',
            }
            return (
              <button
                key={severity}
                className={cn(
                  'rounded-md px-1.5 py-1 text-[11px] font-medium capitalize transition-all duration-150 active:scale-[0.96] sm:px-2',
                  colorMap[severity] || 'text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]',
                )}
                onClick={() => onSeverityFilter(severity === severityFilter ? 'all' : severity)}
                type="button"
              >
                {severity}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

interface SortBarProps {
  sortKey: SortKey
  sortDir: SortDir
  onToggleSort: (key: SortKey) => void
  compact?: boolean
}

function AlertsSortBar({ sortKey, sortDir, onToggleSort, compact }: SortBarProps) {
  const sortOptions: Array<{ key: SortKey; label: string; icon: React.ElementType }> = [
    { key: 'triggeredAt', label: 'Triggered', icon: Clock },
    { key: 'lastFired', label: 'Last Fired', icon: Bell },
    { key: 'firedCount', label: 'Fired Count', icon: Zap },
    { key: 'currentValueNumeric', label: 'Value', icon: Activity },
    { key: 'severity', label: 'Severity', icon: AlertTriangle },
  ]

  return (
    <div className={cn('flex items-center gap-1 border-b border-[var(--line)] bg-[var(--surface)]/50 px-4 py-2', compact && 'px-3 py-1.5')}>
      <span className="mr-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">Sort by</span>
      {sortOptions.map(({ key, label, icon: Icon }) => {
        const isActive = sortKey === key
        return (
          <button
            key={key}
            className={cn(
              'flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all duration-150 active:scale-[0.96]',
              isActive
                ? 'bg-[var(--surface-3)] text-[var(--text-primary)] ring-1 ring-inset ring-[var(--line)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]',
            )}
            onClick={() => onToggleSort(key)}
            type="button"
          >
            <Icon size={10} />
            <span>{label}</span>
            {isActive && <span className="ml-0.5 text-[9px] text-[var(--text-faint)]">{sortDir === 'asc' ? '↑' : '↓'}</span>}
          </button>
        )
      })}
    </div>
  )
}

"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import {
  fetchProjectDashboardBootstrap,
  fetchEventDetail,
  fetchIssueLatestEvents,
  fetchIssueTimeline,
  mutateIssue,
  MesherApiError,
  type MesherApiErrorCode,
} from "@/lib/mesher-api"
import {
  adaptMesherDashboardBootstrap,
  adaptMesherSelectedIssueDetail,
  buildEmptyIssuesOverview,
  type IssueRecentEvent,
  type IssuesOverviewSnapshot,
  type IssuesOverviewSource,
} from "@/lib/issues-live-adapter"
import { type Issue, type IssueStatus, type Severity } from "@/lib/dashboard-types"
import { useDashboardSession } from "@/components/dashboard/dashboard-session"
import { toast } from "@/hooks/use-toast"

export type IssueStatusFilter = IssueStatus | "all"
export type IssueSeverityFilter = Severity | "all"
export type IssuesBootstrapState = "loading" | "ready" | "failed"
export type SelectedIssueState = "idle" | "loading" | "ready" | "failed"
export type SelectedIssueSource = "none" | IssuesOverviewSource
export type IssueMutationPhase = "idle" | "mutating" | "refreshing" | "failed"
export type IssueMutationStage = "mutation" | "overview-refresh" | "detail-refresh"

type SelectedIssueReadStep = "latest-event" | "event-detail" | "timeline"

export interface IssuesBootstrapError {
  code: MesherApiErrorCode
  message: string
  path: string
  status: number | null
}

export interface SelectedIssueError extends IssuesBootstrapError {
  step: SelectedIssueReadStep
}

export interface IssueMutationError extends IssuesBootstrapError {
  stage: IssueMutationStage
  action: string
  issueId: string
}

interface SelectedIssueSnapshot {
  issue: Issue
  latestEventId: string
  recentEvents: IssueRecentEvent[]
  source: Exclude<SelectedIssueSource, "none">
}

const ISSUE_STATUS_FILTER_VALUES: IssueStatusFilter[] = [
  "all",
  "open",
  "resolved",
  "ignored",
]

const ISSUE_SEVERITY_FILTER_VALUES: IssueSeverityFilter[] = [
  "all",
  "critical",
  "high",
  "medium",
  "low",
]

const SUPPORTED_ISSUE_ACTIONS = ["resolve", "unresolve", "archive"] as const

function isSupportedIssueAction(value: string): value is (typeof SUPPORTED_ISSUE_ACTIONS)[number] {
  return SUPPORTED_ISSUE_ACTIONS.includes(value as (typeof SUPPORTED_ISSUE_ACTIONS)[number])
}

export function normalizeIssueStatusFilter(value?: string | null): IssueStatusFilter {
  return ISSUE_STATUS_FILTER_VALUES.includes(value as IssueStatusFilter)
    ? (value as IssueStatusFilter)
    : "all"
}

export function normalizeIssueSeverityFilter(value?: string | null): IssueSeverityFilter {
  return ISSUE_SEVERITY_FILTER_VALUES.includes(value as IssueSeverityFilter)
    ? (value as IssueSeverityFilter)
    : "all"
}

function normalizeIssueSearch(value?: string | null): string {
  return value ?? ""
}

function toIssuesBootstrapError(error: unknown): IssuesBootstrapError {
  if (error instanceof MesherApiError) {
    return {
      code: error.code,
      message: error.message,
      path: error.path,
      status: error.status,
    }
  }

  return {
    code: "network",
    message: error instanceof Error ? error.message : "Unknown Mesher bootstrap error",
    path: "/api/v1/projects/unknown",
    status: null,
  }
}

function selectedIssueStepFromPath(path: string): SelectedIssueReadStep {
  if (path.includes("/timeline")) {
    return "timeline"
  }

  if (path.includes("/issues/") && path.includes("/events")) {
    return "latest-event"
  }

  return "event-detail"
}

function toSelectedIssueError(error: unknown): SelectedIssueError {
  if (error instanceof MesherApiError) {
    return {
      code: error.code,
      message: error.message,
      path: error.path,
      status: error.status,
      step: selectedIssueStepFromPath(error.path),
    }
  }

  return {
    code: "network",
    message: error instanceof Error ? error.message : "Unknown selected issue read error",
    path: "/api/v1/issues/unknown",
    status: null,
    step: "event-detail",
  }
}

function toIssueMutationError(
  error: unknown,
  stage: IssueMutationStage,
  action: string,
  issueId: string,
): IssueMutationError {
  if (error instanceof MesherApiError) {
    return {
      code: error.code,
      message: error.message,
      path: error.path,
      status: error.status,
      stage,
      action,
      issueId,
    }
  }

  return {
    code: "network",
    message: error instanceof Error ? error.message : "Unknown issue mutation error",
    path:
      stage === "overview-refresh"
        ? "/api/v1/projects/unknown/issues"
        : `/api/v1/issues/${issueId}/${action || "unknown"}`,
    status: null,
    stage,
    action,
    issueId,
  }
}

function describeSelectedIssueStep(step: SelectedIssueReadStep) {
  switch (step) {
    case "latest-event":
      return "latest event lookup"
    case "event-detail":
      return "event detail"
    case "timeline":
      return "issue timeline"
  }
}

function describeIssueAction(action: string) {
  switch (action) {
    case "resolve":
      return "Resolve"
    case "unresolve":
      return "Reopen"
    case "archive":
      return "Ignore"
    default:
      return "Issue action"
  }
}

function describeIssueMutationStage(stage: IssueMutationStage) {
  switch (stage) {
    case "mutation":
      return "mutation"
    case "overview-refresh":
      return "overview refresh"
    case "detail-refresh":
      return "detail refresh"
  }
}

function showSelectedIssueErrorToast(issueId: string, error: SelectedIssueError) {
  const surface = describeSelectedIssueStep(error.step)
  const reason = error.status ? `${error.code} · status ${error.status}` : error.code

  toast({
    title: `Live ${surface} failed`,
    description: `Issue ${issueId} detail is unavailable because the Mesher ${surface} read failed (${reason}).`,
    variant: "destructive",
  })
}

function showIssueMutationErrorToast(error: IssueMutationError) {
  const actionLabel = describeIssueAction(error.action)
  const stageLabel = describeIssueMutationStage(error.stage)
  const reason = error.status ? `${error.code} · status ${error.status}` : error.code

  if (error.stage === "mutation") {
    toast({
      title: `${actionLabel} failed`,
      description: `Issue ${error.issueId} stayed selected because the same-origin ${actionLabel.toLowerCase()} request failed (${reason}).`,
      variant: "destructive",
    })
    return
  }

  toast({
    title: `${actionLabel} applied, but refresh failed`,
    description: `Issue ${error.issueId} changed on Mesher, but the follow-up ${stageLabel} failed (${reason}). Refresh before taking another action.`,
    variant: "destructive",
  })
}

interface DashboardIssuesStateValue {
  search: string
  statusFilter: IssueStatusFilter
  severityFilter: IssueSeverityFilter
  selectedIssueId: string | null
  selectedIssue: Issue | null
  selectedIssueState: SelectedIssueState
  selectedIssueSource: SelectedIssueSource
  selectedIssueLatestEventId: string | null
  selectedIssueRecentEvents: IssueRecentEvent[]
  selectedIssueError: SelectedIssueError | null
  filteredIssues: Issue[]
  stats: ReturnType<typeof buildEmptyIssuesOverview>["stats"]
  statsFieldSources: ReturnType<typeof buildEmptyIssuesOverview>["statsSources"]
  eventSeries: ReturnType<typeof buildEmptyIssuesOverview>["eventSeries"]
  bootstrapState: IssuesBootstrapState
  bootstrapError: IssuesBootstrapError | null
  liveIssueCount: number
  issuesSource: IssuesOverviewSource
  statsSource: IssuesOverviewSource
  chartSource: IssuesOverviewSource
  overviewSource: IssuesOverviewSource
  issueMutationPhase: IssueMutationPhase
  issueMutationError: IssueMutationError | null
  lastIssueAction: string | null
  lastIssueActionIssueId: string | null
  isIssueMutationPending: boolean
  setSearch: (value: string) => void
  setStatusFilter: (value: string) => void
  setSeverityFilter: (value: string) => void
  selectIssue: (id: string) => void
  clearSelectedIssue: () => void
  runIssueAction: (issueId: string, action: string) => Promise<void>
}

const DashboardIssuesStateContext = createContext<DashboardIssuesStateValue | null>(null)

export function DashboardIssuesStateProvider({ children }: { children: ReactNode }) {
  const { activeProject } = useDashboardSession()
  const [search, setSearchState] = useState("")
  const [statusFilter, setStatusFilterState] = useState<IssueStatusFilter>("all")
  const [severityFilter, setSeverityFilterState] = useState<IssueSeverityFilter>("all")
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null)
  const [overviewData, setOverviewData] = useState(() => buildEmptyIssuesOverview())
  const [bootstrapState, setBootstrapState] = useState<IssuesBootstrapState>("loading")
  const [bootstrapError, setBootstrapError] = useState<IssuesBootstrapError | null>(null)
  const [selectedIssueState, setSelectedIssueState] = useState<SelectedIssueState>("idle")
  const [selectedIssueError, setSelectedIssueError] = useState<SelectedIssueError | null>(null)
  const [selectedIssueSnapshots, setSelectedIssueSnapshots] = useState<Record<string, SelectedIssueSnapshot>>({})
  const [selectedIssueNeedsHydration, setSelectedIssueNeedsHydration] = useState(false)
  const [issueMutationPhase, setIssueMutationPhase] = useState<IssueMutationPhase>("idle")
  const [issueMutationError, setIssueMutationError] = useState<IssueMutationError | null>(null)
  const [lastIssueAction, setLastIssueAction] = useState<string | null>(null)
  const [lastIssueActionIssueId, setLastIssueActionIssueId] = useState<string | null>(null)
  const selectedIssueAbortRef = useRef<AbortController | null>(null)
  const selectedIssueMutationAbortRef = useRef<AbortController | null>(null)
  const overviewRefreshAbortRef = useRef<AbortController | null>(null)
  const selectedIssueIdRef = useRef<string | null>(null)

  useEffect(() => {
    selectedIssueIdRef.current = selectedIssueId
  }, [selectedIssueId])

  const clearSelectedIssueSnapshot = useCallback((issueId: string) => {
    setSelectedIssueSnapshots((current) => {
      if (!current[issueId]) {
        return current
      }

      const next = { ...current }
      delete next[issueId]
      return next
    })
  }, [])

  const hydrateSelectedIssue = useCallback(async (issueId: string, baseIssue: Issue, signal: AbortSignal) => {
    const [latestEvents, timeline] = await Promise.all([
      fetchIssueLatestEvents(issueId, signal),
      fetchIssueTimeline(issueId, signal),
    ])

    if (signal.aborted) {
      return null
    }

    const latestEvent = latestEvents.data[0]
    if (!latestEvent) {
      return null
    }

    const detail = await fetchEventDetail(latestEvent.id, signal)
    if (signal.aborted) {
      return null
    }

    return adaptMesherSelectedIssueDetail(baseIssue, latestEvent, detail, timeline)
  }, [])

  const refreshOverview = useCallback(
    async ({ clearOnFailure = false }: { clearOnFailure?: boolean } = {}): Promise<IssuesOverviewSnapshot | null> => {
      overviewRefreshAbortRef.current?.abort()
      const abortController = new AbortController()
      overviewRefreshAbortRef.current = abortController

      try {
        if (!activeProject) return null
        const payload = await fetchProjectDashboardBootstrap(activeProject.id, abortController.signal)
        if (abortController.signal.aborted) {
          return null
        }

        const adapted = adaptMesherDashboardBootstrap(payload, activeProject.name)
        setOverviewData(adapted)
        setBootstrapState("ready")
        setBootstrapError(null)
        return adapted
      } catch (error) {
        if (abortController.signal.aborted) {
          return null
        }

        if (clearOnFailure) {
          const normalizedError = toIssuesBootstrapError(error)
          setOverviewData(buildEmptyIssuesOverview())
          setBootstrapState("failed")
          setBootstrapError(normalizedError)
        }

        throw error
      } finally {
        if (overviewRefreshAbortRef.current === abortController) {
          overviewRefreshAbortRef.current = null
        }
      }
    },
    [activeProject],
  )

  useEffect(() => {
    let cancelled = false

    setOverviewData(buildEmptyIssuesOverview())
    setBootstrapState("loading")
    setBootstrapError(null)
    setSelectedIssueId(null)
    setSelectedIssueSnapshots({})
    setSelectedIssueState("idle")
    setSelectedIssueError(null)

    void refreshOverview({ clearOnFailure: true }).catch(() => {
      if (cancelled) {
        return
      }
    })

    return () => {
      cancelled = true
      overviewRefreshAbortRef.current?.abort()
      selectedIssueAbortRef.current?.abort()
      selectedIssueMutationAbortRef.current?.abort()
    }
  }, [refreshOverview])

  const issuesById = useMemo(
    () => new Map(overviewData.issues.map((issue) => [issue.id, issue] as const)),
    [overviewData.issues],
  )

  useEffect(() => {
    if (!selectedIssueId) {
      return
    }

    if (!issuesById.has(selectedIssueId)) {
      selectedIssueAbortRef.current?.abort()
      selectedIssueMutationAbortRef.current?.abort()
      setSelectedIssueId(null)
      setSelectedIssueNeedsHydration(false)
      setSelectedIssueState("idle")
      setSelectedIssueError(null)
    }
  }, [issuesById, selectedIssueId])

  useEffect(() => {
    selectedIssueAbortRef.current?.abort()

    if (!selectedIssueId) {
      setSelectedIssueState("idle")
      setSelectedIssueError(null)
      return
    }

    const issueId = selectedIssueId

    const baseIssue = issuesById.get(issueId)
    if (!baseIssue) {
      setSelectedIssueState("failed")
      setSelectedIssueError({
        code: "invalid-payload",
        message: `Unknown issue ${issueId}`,
        path: `/api/v1/issues/${issueId}`,
        status: null,
        step: "latest-event",
      })
      setSelectedIssueNeedsHydration(false)
      return
    }
    const selectedBaseIssue = baseIssue

    const cachedSnapshot = selectedIssueSnapshots[issueId]
    if (!selectedIssueNeedsHydration) {
      if (cachedSnapshot) {
        setSelectedIssueState("ready")
        setSelectedIssueError(null)
      }
      return
    }

    const abortController = new AbortController()
    selectedIssueAbortRef.current = abortController
    setSelectedIssueState("loading")
    setSelectedIssueError(null)

    async function hydrateSelection() {
      try {
        const hydrated = await hydrateSelectedIssue(issueId, selectedBaseIssue, abortController.signal)
        if (abortController.signal.aborted) {
          return
        }

        if (!hydrated) {
          setSelectedIssueState("ready")
          setSelectedIssueError(null)
          setSelectedIssueNeedsHydration(false)
          return
        }

        setSelectedIssueSnapshots((current) => ({
          ...current,
          [issueId]: hydrated,
        }))
        setSelectedIssueState("ready")
        setSelectedIssueError(null)
        setSelectedIssueNeedsHydration(false)
      } catch (error) {
        if (abortController.signal.aborted) {
          return
        }

        const normalizedError = toSelectedIssueError(error)
        setSelectedIssueState("failed")
        setSelectedIssueError(normalizedError)
        setSelectedIssueNeedsHydration(false)
        showSelectedIssueErrorToast(issueId, normalizedError)
      }
    }

    void hydrateSelection()

    return () => {
      abortController.abort()
      if (selectedIssueAbortRef.current === abortController) {
        selectedIssueAbortRef.current = null
      }
    }
  }, [hydrateSelectedIssue, issuesById, selectedIssueId, selectedIssueNeedsHydration, selectedIssueSnapshots])

  const selectedIssueSnapshot = selectedIssueId ? selectedIssueSnapshots[selectedIssueId] ?? null : null
  const selectedIssue = useMemo(
    () =>
      selectedIssueId
        ? selectedIssueSnapshot?.issue ?? issuesById.get(selectedIssueId) ?? null
        : null,
    [issuesById, selectedIssueId, selectedIssueSnapshot],
  )

  const filteredIssues = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    return overviewData.issues.filter((issue) => {
      if (
        normalizedSearch &&
        !issue.title.toLowerCase().includes(normalizedSearch) &&
        !issue.id.toLowerCase().includes(normalizedSearch)
      ) {
        return false
      }

      if (statusFilter !== "all" && issue.status !== statusFilter) {
        return false
      }

      if (severityFilter !== "all" && issue.severity !== severityFilter) {
        return false
      }

      return true
    })
  }, [overviewData.issues, search, severityFilter, statusFilter])

  const setSearch = useCallback((value: string) => {
    setSearchState(normalizeIssueSearch(value))
  }, [])

  const setStatusFilter = useCallback((value: string) => {
    setStatusFilterState(normalizeIssueStatusFilter(value))
  }, [])

  const setSeverityFilter = useCallback((value: string) => {
    setSeverityFilterState(normalizeIssueSeverityFilter(value))
  }, [])

  const selectIssue = useCallback(
    (id: string) => {
      if (!issuesById.has(id)) {
        setSelectedIssueId(null)
        setSelectedIssueNeedsHydration(false)
        setSelectedIssueState("idle")
        setSelectedIssueError(null)
        return
      }

      selectedIssueAbortRef.current?.abort()
      selectedIssueMutationAbortRef.current?.abort()
      setSelectedIssueId(id)
      setSelectedIssueError(null)

      if (selectedIssueSnapshots[id]) {
        setSelectedIssueState("ready")
        setSelectedIssueNeedsHydration(false)
        return
      }

      setSelectedIssueState("loading")
      setSelectedIssueNeedsHydration(true)
    },
    [issuesById, selectedIssueSnapshots],
  )

  const clearSelectedIssue = useCallback(() => {
    selectedIssueAbortRef.current?.abort()
    selectedIssueMutationAbortRef.current?.abort()
    setSelectedIssueId(null)
    setSelectedIssueNeedsHydration(false)
    setSelectedIssueState("idle")
    setSelectedIssueError(null)
  }, [])

  const runIssueAction = useCallback(
    async (issueId: string, action: string) => {
      const normalizedAction = action.trim().toLowerCase()
      const targetIssue = issuesById.get(issueId) ?? selectedIssueSnapshots[issueId]?.issue ?? null

      setLastIssueAction(normalizedAction || action)
      setLastIssueActionIssueId(issueId)
      setIssueMutationError(null)

      if (!isSupportedIssueAction(normalizedAction)) {
        const error = toIssueMutationError(
          new MesherApiError(
            "invalid-payload",
            `/api/v1/issues/${encodeURIComponent(issueId || "unknown")}/${encodeURIComponent(normalizedAction || "unknown")}`,
            `Unsupported issue action "${action}"`,
          ),
          "mutation",
          normalizedAction || action,
          issueId || "unknown",
        )
        setIssueMutationPhase("failed")
        setIssueMutationError(error)
        showIssueMutationErrorToast(error)
        return
      }

      if (!targetIssue) {
        const error = toIssueMutationError(
          new MesherApiError(
            "invalid-payload",
            `/api/v1/issues/${encodeURIComponent(issueId || "unknown")}/${normalizedAction}`,
            `Unknown issue ${issueId}`,
          ),
          "mutation",
          normalizedAction,
          issueId || "unknown",
        )
        setIssueMutationPhase("failed")
        setIssueMutationError(error)
        showIssueMutationErrorToast(error)
        return
      }

      if (issueMutationPhase === "mutating" || issueMutationPhase === "refreshing") {
        return
      }

      setIssueMutationPhase("mutating")

      try {
        await mutateIssue(issueId, normalizedAction)
      } catch (error) {
        const normalizedError = toIssueMutationError(error, "mutation", normalizedAction, issueId)
        setIssueMutationPhase("failed")
        setIssueMutationError(normalizedError)
        showIssueMutationErrorToast(normalizedError)
        return
      }

      clearSelectedIssueSnapshot(issueId)
      if (selectedIssueIdRef.current === issueId) {
        setSelectedIssueNeedsHydration(false)
      }

      setIssueMutationPhase("refreshing")

      let refreshedOverview: IssuesOverviewSnapshot | null = null
      try {
        refreshedOverview = await refreshOverview()
      } catch (error) {
        const normalizedError = toIssueMutationError(error, "overview-refresh", normalizedAction, issueId)
        setIssueMutationPhase("failed")
        setIssueMutationError(normalizedError)
        if (selectedIssueIdRef.current === issueId) {
          setSelectedIssueState("ready")
          setSelectedIssueError(null)
          setSelectedIssueNeedsHydration(false)
        }
        showIssueMutationErrorToast(normalizedError)
        return
      }

      const refreshedIssue = refreshedOverview?.issues.find((issue) => issue.id === issueId) ?? null
      if (selectedIssueIdRef.current !== issueId) {
        setIssueMutationPhase("idle")
        setIssueMutationError(null)
        return
      }

      if (!refreshedIssue) {
        clearSelectedIssue()
        setIssueMutationPhase("idle")
        setIssueMutationError(null)
        return
      }

      const abortController = new AbortController()
      selectedIssueMutationAbortRef.current?.abort()
      selectedIssueMutationAbortRef.current = abortController
      setSelectedIssueState("loading")
      setSelectedIssueError(null)
      setSelectedIssueNeedsHydration(false)

      try {
        const hydrated = await hydrateSelectedIssue(issueId, refreshedIssue, abortController.signal)
        if (abortController.signal.aborted) {
          return
        }

        if (hydrated) {
          setSelectedIssueSnapshots((current) => ({
            ...current,
            [issueId]: hydrated,
          }))
        }

        setSelectedIssueState("ready")
        setSelectedIssueError(null)
        setIssueMutationPhase("idle")
        setIssueMutationError(null)
      } catch (error) {
        if (abortController.signal.aborted) {
          return
        }

        const normalizedSelectedIssueError = toSelectedIssueError(error)
        const normalizedMutationError = toIssueMutationError(error, "detail-refresh", normalizedAction, issueId)
        setSelectedIssueState("failed")
        setSelectedIssueError(normalizedSelectedIssueError)
        setIssueMutationPhase("failed")
        setIssueMutationError(normalizedMutationError)
        showIssueMutationErrorToast(normalizedMutationError)
      } finally {
        if (selectedIssueMutationAbortRef.current === abortController) {
          selectedIssueMutationAbortRef.current = null
        }
      }
    },
    [
      clearSelectedIssue,
      clearSelectedIssueSnapshot,
      hydrateSelectedIssue,
      issueMutationPhase,
      issuesById,
      refreshOverview,
      selectedIssueSnapshots,
    ],
  )

  const selectedIssueSource: SelectedIssueSource = selectedIssueId
    ? selectedIssueSnapshot?.source ?? "live"
    : "none"

  const selectedIssueLatestEventId = selectedIssueSnapshot?.latestEventId ?? null
  const selectedIssueRecentEvents = useMemo(
    () => selectedIssueSnapshot?.recentEvents ?? [],
    [selectedIssueSnapshot],
  )
  const isIssueMutationPending = issueMutationPhase === "mutating" || issueMutationPhase === "refreshing"

  const value = useMemo<DashboardIssuesStateValue>(
    () => ({
      search,
      statusFilter,
      severityFilter,
      selectedIssueId,
      selectedIssue,
      selectedIssueState,
      selectedIssueSource,
      selectedIssueLatestEventId,
      selectedIssueRecentEvents,
      selectedIssueError,
      filteredIssues,
      stats: overviewData.stats,
      statsFieldSources: overviewData.statsSources,
      eventSeries: overviewData.eventSeries,
      bootstrapState,
      bootstrapError,
      liveIssueCount: overviewData.liveIssueCount,
      issuesSource: overviewData.sources.issues,
      statsSource: overviewData.sources.stats,
      chartSource: overviewData.sources.chart,
      overviewSource: overviewData.sources.overall,
      issueMutationPhase,
      issueMutationError,
      lastIssueAction,
      lastIssueActionIssueId,
      isIssueMutationPending,
      setSearch,
      setStatusFilter,
      setSeverityFilter,
      selectIssue,
      clearSelectedIssue,
      runIssueAction,
    }),
    [
      bootstrapError,
      bootstrapState,
      clearSelectedIssue,
      filteredIssues,
      issueMutationError,
      issueMutationPhase,
      isIssueMutationPending,
      lastIssueAction,
      lastIssueActionIssueId,
      overviewData.eventSeries,
      overviewData.liveIssueCount,
      overviewData.sources.chart,
      overviewData.sources.issues,
      overviewData.sources.overall,
      overviewData.sources.stats,
      overviewData.stats,
      overviewData.statsSources,
      runIssueAction,
      search,
      selectIssue,
      selectedIssue,
      selectedIssueError,
      selectedIssueId,
      selectedIssueLatestEventId,
      selectedIssueRecentEvents,
      selectedIssueSource,
      selectedIssueState,
      setSearch,
      setSeverityFilter,
      setStatusFilter,
      severityFilter,
      statusFilter,
    ],
  )

  return (
    <DashboardIssuesStateContext.Provider value={value}>
      {children}
    </DashboardIssuesStateContext.Provider>
  )
}

export function useDashboardIssuesState() {
  const value = useContext(DashboardIssuesStateContext)

  if (!value) {
    throw new Error("useDashboardIssuesState must be used within DashboardIssuesStateProvider")
  }

  return value
}

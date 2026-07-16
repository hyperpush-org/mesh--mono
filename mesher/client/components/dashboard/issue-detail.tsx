"use client"

import { cn } from "@/lib/utils"
import type { Issue, IssueStatus } from "@/lib/mock-data"
import type { IssueRecentEvent } from "@/lib/issues-live-adapter"
import type {
  IssueMutationPhase,
  SelectedIssueSource,
  SelectedIssueState,
} from "@/components/dashboard/dashboard-issues-state"
import {
  X,
  GitBranch,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Copy,
  Check,
  Database,
  AlertTriangle,
  LoaderCircle,
  Clock3,
} from "lucide-react"
import { useState } from "react"

interface IssueDetailProps {
  issue: Issue
  detailState: SelectedIssueState
  detailSource: SelectedIssueSource
  latestEventId: string | null
  recentEvents: IssueRecentEvent[]
  errorCode: string | null
  liveActionPhase: IssueMutationPhase
  liveActionErrorCode: string | null
  liveActionIssueId: string | null
  lastLiveAction: string | null
  isLiveActionPending: boolean
  onRunLiveAction: (action: "resolve" | "unresolve" | "archive") => void
  onClose: () => void
  onOpenAI: () => void
}

type LiveIssueAction = "resolve" | "unresolve" | "archive"

interface LiveActionDescriptor {
  action: LiveIssueAction
  label: string
  pendingLabel: string
  variant: "primary" | "secondary" | "accent"
}

const severityConfig = {
  critical: { color: "var(--red)", label: "Critical", classes: "text-[var(--red)] bg-[var(--red)]/[0.10] ring-[var(--red)]/20" },
  high: { color: "var(--yellow)", label: "High", classes: "text-[var(--yellow)] bg-[var(--yellow)]/[0.10] ring-[var(--yellow)]/20" },
  medium: { color: "var(--blue)", label: "Medium", classes: "text-[var(--blue)] bg-[var(--blue)]/[0.10] ring-[var(--blue)]/20" },
  low: { color: "var(--text-tertiary)", label: "Low", classes: "text-[var(--text-secondary)] bg-[var(--surface-3)] ring-[var(--line)]" },
} as const

const statusConfig: Record<string, { label: string; classes: string }> = {
  open: { label: "Open", classes: "text-[var(--red)] bg-[var(--red)]/[0.10] ring-[var(--red)]/20" },
  "in-progress": { label: "In Progress", classes: "text-[var(--yellow)] bg-[var(--yellow)]/[0.10] ring-[var(--yellow)]/20" },
  regressed: { label: "Regressed", classes: "text-[var(--red)] bg-[var(--red)]/[0.10] ring-[var(--red)]/20" },
  resolved: { label: "Resolved", classes: "text-[var(--green)] bg-[var(--green)]/[0.10] ring-[var(--green)]/20" },
  ignored: { label: "Ignored", classes: "text-[var(--text-secondary)] bg-[var(--surface-3)] ring-[var(--line)]" },
}

function getSupportedMaintainerActions(status: IssueStatus): LiveActionDescriptor[] {
  switch (status) {
    case "resolved":
      return [
        { action: "unresolve", label: "Reopen", pendingLabel: "Reopening…", variant: "primary" },
        { action: "archive", label: "Ignore", pendingLabel: "Ignoring…", variant: "secondary" },
      ]
    case "ignored":
      return [
        { action: "unresolve", label: "Reopen", pendingLabel: "Reopening…", variant: "primary" },
      ]
    case "open":
    case "in-progress":
    case "regressed":
    default:
      return [
        { action: "resolve", label: "Resolve", pendingLabel: "Resolving…", variant: "primary" },
        { action: "archive", label: "Ignore", pendingLabel: "Ignoring…", variant: "secondary" },
      ]
  }
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-[7px]">
      <span className="text-[11px] text-[var(--text-tertiary)]">{label}</span>
      <span className="text-[11px] font-medium tabular-nums text-[var(--text-primary)]">{value}</span>
    </div>
  )
}

function ActionButton({
  children,
  variant = "secondary",
  onClick,
  href,
  disabled = false,
  busy = false,
  testId,
  source,
}: {
  children: React.ReactNode
  variant?: "primary" | "secondary" | "accent"
  onClick?: () => void
  href?: string
  disabled?: boolean
  busy?: boolean
  testId?: string
  source?: string
}) {
  const base = "inline-flex items-center gap-1.5 rounded-md px-2.5 py-[5px] text-[11px] font-medium transition-all duration-150 active:scale-[0.97]"
  const disabledClasses = "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-inherit disabled:hover:text-inherit"
  const styles = {
    primary: "bg-[var(--purple)]/[0.12] text-[var(--purple)] hover:bg-[var(--purple)]/[0.18]",
    secondary: "bg-[var(--surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)] ring-1 ring-inset ring-[var(--line)]",
    accent: "bg-[var(--green)]/[0.10] text-[var(--green)] hover:bg-[var(--green)]/[0.16]",
  }

  if (href) {
    return (
      <a
        href={href}
        className={cn(base, styles[variant])}
        data-source={source}
        data-testid={testId}
        rel="noreferrer"
        target="_blank"
      >
        {children}
      </a>
    )
  }

  return (
    <button
      aria-busy={busy}
      className={cn(base, styles[variant], disabledClasses)}
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

function DetailStatusBanner({
  detailState,
  detailSource,
  latestEventId,
  errorCode,
}: {
  detailState: SelectedIssueState
  detailSource: SelectedIssueSource
  latestEventId: string | null
  errorCode: string | null
}) {
  if (detailState === "loading") {
    return (
      <div
        className="mx-4 mb-3 flex items-start gap-2 rounded-lg border border-[var(--blue)]/20 bg-[var(--blue)]/[0.05] px-3 py-2 text-[11px] text-[var(--text-secondary)]"
        data-testid="issue-detail-live-banner"
      >
        <LoaderCircle size={14} className="mt-0.5 shrink-0 animate-spin text-[var(--blue)]" />
        <div>
          <p className="font-medium text-[var(--text-primary)]">Loading live Mesher detail and timeline…</p>
          <p>Fallback shell content stays mounted until the selected-issue reads settle.</p>
        </div>
      </div>
    )
  }

  if (detailState === "failed") {
    return (
      <div
        className="mx-4 mb-3 flex items-start gap-2 rounded-lg border border-[var(--red)]/20 bg-[var(--red)]/[0.05] px-3 py-2 text-[11px] text-[var(--text-secondary)]"
        data-testid="issue-detail-live-banner"
      >
        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-[var(--red)]" />
        <div>
          <p className="font-medium text-[var(--text-primary)]">Live issue detail unavailable</p>
          <p>Mesher detail reads failed{errorCode ? ` (${errorCode})` : ""}, so the panel kept its fallback shell content.</p>
        </div>
      </div>
    )
  }

  if (detailSource === "mixed") {
    return (
      <div
        className="mx-4 mb-3 flex items-start gap-2 rounded-lg border border-[var(--green)]/20 bg-[var(--green)]/[0.05] px-3 py-2 text-[11px] text-[var(--text-secondary)]"
        data-testid="issue-detail-live-banner"
      >
        <Database size={14} className="mt-0.5 shrink-0 text-[var(--green)]" />
        <div>
          <p className="font-medium text-[var(--text-primary)]">Live event detail + timeline active</p>
          <p>
            Latest event {latestEventId ? <span className="font-mono text-[var(--text-primary)]">{latestEventId}</span> : "loaded"}
            {" "}is from Mesher; unsupported shell fields still use visible fallback content.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="mx-4 mb-3 flex items-start gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-2)]/70 px-3 py-2 text-[11px] text-[var(--text-secondary)]"
      data-testid="issue-detail-live-banner"
    >
      <Clock3 size={14} className="mt-0.5 shrink-0 text-[var(--text-tertiary)]" />
      <div>
        <p className="font-medium text-[var(--text-primary)]">Fallback detail shell active</p>
        <p>No latest Mesher event detail was returned for this issue selection.</p>
      </div>
    </div>
  )
}

function RecentEventsCard({ recentEvents }: { recentEvents: IssueRecentEvent[] }) {
  if (recentEvents.length === 0) {
    return null
  }

  return (
    <div
      className="mx-4 mb-3 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface-2)]/70"
      data-testid="issue-detail-recent-events"
    >
      <div className="flex items-center justify-between border-b border-[var(--line)] px-3 py-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)]">Recent event timeline</p>
          <p className="text-[11px] text-[var(--text-secondary)]">Latest Mesher timeline entries for this issue.</p>
        </div>
        <span className="rounded bg-[var(--surface-3)] px-1.5 py-[2px] text-[10px] font-medium text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--line)]">
          {recentEvents.length}
        </span>
      </div>
      <div className="divide-y divide-[var(--line)]/60">
        {recentEvents.map((event) => (
          <div key={event.id} className="flex items-start gap-3 px-3 py-2.5">
            <span
              className={cn(
                "mt-1 h-2 w-2 shrink-0 rounded-full",
                event.level === "error"
                  ? "bg-[var(--red)]"
                  : event.level === "warning"
                    ? "bg-[var(--yellow)]"
                    : "bg-[var(--blue)]",
              )}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-[var(--text-faint)]">{event.time}</span>
                <span className="rounded bg-[var(--surface-3)] px-1.5 py-[1px] text-[10px] font-medium text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--line)]">
                  {event.level}
                </span>
              </div>
              <p className="mt-1 break-words text-[11px] leading-relaxed text-[var(--text-primary)]">{event.message}</p>
              <p className="mt-1 font-mono text-[10px] text-[var(--text-faint)]">{event.id}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function IssueDetail({
  issue,
  detailState,
  detailSource,
  latestEventId,
  recentEvents,
  errorCode,
  liveActionPhase,
  liveActionErrorCode,
  liveActionIssueId,
  lastLiveAction,
  isLiveActionPending,
  onRunLiveAction,
  onClose,
  onOpenAI,
}: IssueDetailProps) {
  const [tab, setTab] = useState<"stack" | "breadcrumbs" | "context">("stack")
  const [copied, setCopied] = useState(false)

  const severity = severityConfig[issue.severity]
  const status = statusConfig[issue.status] ?? statusConfig.open
  const liveActions = getSupportedMaintainerActions(issue.status)
  const isCurrentIssueAction = liveActionIssueId === issue.id
  const actionErrorVisible = isCurrentIssueAction && liveActionPhase === "failed" && liveActionErrorCode

  function copyId() {
    navigator.clipboard.writeText(issue.id)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <aside className="flex h-full flex-col overflow-hidden border-l border-[var(--line)] bg-[var(--surface)]">
      <div className="flex h-[var(--header-height)] flex-shrink-0 items-center justify-between gap-2 border-b border-[var(--line)] px-4">
        <div className="flex min-w-0 items-center gap-2">
          <button
            onClick={copyId}
            title="Copy issue ID"
            className="flex shrink-0 items-center gap-1 font-mono text-[11px] text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
            type="button"
          >
            {copied ? <Check size={11} className="text-[var(--green)]" /> : <Copy size={11} />}
            {issue.id}
          </button>
          <span className={cn(
            "shrink-0 rounded px-1.5 py-[2px] text-[10px] font-semibold uppercase tracking-[0.03em] leading-none ring-1 ring-inset",
            status.classes,
          )}>
            {status.label}
          </span>
          <span className={cn(
            "shrink-0 rounded px-1.5 py-[2px] text-[10px] font-semibold leading-none ring-1 ring-inset",
            severity.classes,
          )}>
            {severity.label}
          </span>
        </div>
        <button
          aria-label="Close issue details"
          data-testid="issue-detail-close"
          onClick={onClose}
          className="-mr-1 shrink-0 rounded-md p-1.5 text-[var(--text-tertiary)] transition-all duration-150 hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)] active:scale-[0.92]"
          type="button"
        >
          <X size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 pt-4 pb-3">
          <h2 className="break-words text-[14px] font-semibold leading-[1.4] tracking-[-0.01em] text-[var(--text-primary)]">
            {issue.title}
          </h2>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-secondary)]">{issue.subtitle}</p>
          <p className="mt-1.5 font-mono text-[10px] text-[var(--text-faint)]">{issue.file}</p>
        </div>

        <DetailStatusBanner
          detailState={detailState}
          detailSource={detailSource}
          latestEventId={latestEventId}
          errorCode={errorCode}
        />

        <div
          className="flex flex-wrap items-center gap-1.5 px-4 pb-1.5"
          data-action-phase={liveActionPhase}
          data-action-source="same-origin"
          data-testid="issue-detail-actions"
        >
          {liveActions.map((actionMeta) => {
            const isCurrentAction = isCurrentIssueAction && lastLiveAction === actionMeta.action
            return (
              <ActionButton
                key={actionMeta.action}
                busy={isCurrentAction && isLiveActionPending}
                disabled={isLiveActionPending}
                onClick={() => onRunLiveAction(actionMeta.action)}
                source="same-origin-live"
                testId={`issue-detail-action-${actionMeta.action}`}
                variant={actionMeta.variant}
              >
                {isCurrentAction && isLiveActionPending ? <LoaderCircle size={11} className="animate-spin" /> : null}
                {isCurrentAction && isLiveActionPending ? actionMeta.pendingLabel : actionMeta.label}
              </ActionButton>
            )
          })}
          <ActionButton onClick={onOpenAI} source="shell-only" variant="primary">
            <Sparkles size={11} />
            AI Analysis
          </ActionButton>
          {issue.githubIssue ? (
            <ActionButton source="shell-only" variant="secondary" href="#">
              <GitBranch size={11} />
              {issue.githubIssue}
              <ExternalLink size={9} className="-ml-0.5 text-[var(--text-faint)]" />
            </ActionButton>
          ) : (
            <ActionButton source="shell-only" variant="secondary">
              <GitBranch size={11} />
              Link Issue
            </ActionButton>
          )}
        </div>

        <div className="px-4 pb-3" data-testid="issue-detail-action-source-note">
          <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-faint)]">Maintainer actions</p>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-secondary)]">
            Resolve, Reopen, and Ignore call the provider-owned same-origin Mesher seam. AI Analysis and issue linking stay visible as shell-only helpers.
          </p>
          {actionErrorVisible ? (
            <p
              className="mt-2 rounded-md border border-[var(--red)]/20 bg-[var(--red)]/[0.05] px-2.5 py-2 text-[11px] text-[var(--red)]"
              data-testid="issue-detail-action-error"
            >
              Last live action failed ({liveActionErrorCode}). The previous visible issue state stayed mounted until a refreshed read succeeds.
            </p>
          ) : null}
        </div>

        {issue.aiSummary && (
          <div className="mx-4 mb-3 overflow-hidden rounded-lg border border-[var(--purple)]/[0.12] bg-[var(--purple)]/[0.04]">
            <div className="px-3 py-2.5">
              <div className="mb-1.5 flex items-center gap-1.5">
                <Sparkles size={10} className="shrink-0 text-[var(--purple)]" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-[var(--purple)]">AI Analysis</span>
              </div>
              <p className="text-[11px] leading-[1.65] text-[var(--text-secondary)]">{issue.aiSummary}</p>
            </div>
            {issue.suspectCommit && (
              <div className="flex items-center gap-2 border-t border-[var(--purple)]/[0.08] bg-[var(--purple)]/[0.02] px-3 py-2">
                <GitBranch size={10} className="shrink-0 text-[var(--text-faint)]" />
                <span className="text-[10px] text-[var(--text-tertiary)]">Suspect:</span>
                <code className="rounded bg-[var(--surface-3)] px-1.5 py-[1px] font-mono text-[10px] text-[var(--text-primary)]">{issue.suspectCommit}</code>
                <button className="ml-auto flex shrink-0 items-center gap-0.5 text-[10px] text-[var(--purple)] hover:underline active:scale-[0.97]" type="button">
                  Open PR <ChevronRight size={9} />
                </button>
              </div>
            )}
          </div>
        )}

        <div className="mx-4 mb-1 rounded-lg bg-[var(--surface-2)]/60 px-3 py-1 ring-1 ring-inset ring-[var(--line)]/60 divide-y divide-[var(--line)]/50">
          <MetaItem label="Last seen" value={issue.lastSeen} />
          <MetaItem label="First seen" value={issue.firstSeen} />
          <MetaItem label="Events" value={issue.count.toLocaleString()} />
          <MetaItem label="Users affected" value={issue.users.toLocaleString()} />
          <MetaItem label="Project" value={issue.project} />
          <MetaItem label="Environment" value={issue.environment} />
        </div>

        <RecentEventsCard recentEvents={recentEvents} />

        {issue.tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 px-4 py-3">
            {issue.tags.map((tag) => (
              <span key={tag} className="rounded px-2 py-[3px] text-[10px] font-medium text-[var(--text-tertiary)] ring-1 ring-inset ring-[var(--line)] bg-[var(--surface-2)]">
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="sticky top-0 z-10 mt-1 flex border-b border-[var(--line)] bg-[var(--surface)] px-4">
          {(["stack", "breadcrumbs", "context"] as const).map((nextTab) => {
            const label = nextTab === "stack" ? "Stack Trace" : nextTab === "breadcrumbs" ? "Breadcrumbs" : "Context"
            const active = tab === nextTab
            return (
              <button
                key={nextTab}
                onClick={() => setTab(nextTab)}
                className={cn(
                  "mr-5 border-b-[1.5px] px-0 py-2.5 text-[11px] font-medium transition-colors duration-150",
                  active
                    ? "border-[var(--text-primary)] text-[var(--text-primary)]"
                    : "border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
                )}
                type="button"
              >
                {label}
              </button>
            )
          })}
        </div>

        <div className="px-4 pt-3 pb-8">
          {tab === "stack" && <StackTraceTab frames={issue.stacktrace} />}
          {tab === "breadcrumbs" && <BreadcrumbsTab breadcrumbs={issue.breadcrumbs} />}
          {tab === "context" && <ContextTab issue={issue} />}
        </div>
      </div>
    </aside>
  )
}

function StackTraceTab({ frames }: { frames: Issue["stacktrace"] }) {
  if (frames.length === 0) {
    return <p data-testid="issue-detail-stack-empty" className="py-4 text-[11px] text-[var(--text-tertiary)]">No stack trace available.</p>
  }
  return (
    <div data-testid="issue-detail-stack-list" className="space-y-1.5">
      {frames.map((frame, index) => (
        <div
          key={`${frame.file}-${frame.line}-${index}`}
          className={cn(
            "overflow-hidden rounded-md border font-mono text-[11px]",
            frame.isApp ? "border-[var(--line)] bg-[var(--surface-2)]" : "border-[var(--line-subtle)] opacity-40",
          )}
        >
          <div className="flex items-center justify-between px-3 py-1.5">
            <span className={cn("truncate", frame.isApp ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]")}>{frame.fn}</span>
            <span className="ml-2 shrink-0 text-[10px] text-[var(--text-faint)]">{frame.file}:{frame.line}</span>
          </div>
          <div className="border-t border-[var(--line)]/50 bg-[var(--surface)]/50 px-3 py-1.5">
            {frame.code.map((line, lineIndex) => (
              <div
                key={`${frame.file}-${frame.line}-${lineIndex}`}
                className={cn(
                  "rounded-sm px-2 py-[1px] text-[10px] leading-[1.6]",
                  lineIndex === frame.highlight ? "bg-[var(--red)]/[0.08] text-[var(--text-primary)]" : "text-[var(--text-faint)]",
                )}
              >
                <span className="mr-2 inline-block w-7 select-none text-right text-[var(--text-faint)]/60">
                  {frame.line + lineIndex - frame.highlight}
                </span>
                {line}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function BreadcrumbsTab({ breadcrumbs }: { breadcrumbs: Issue["breadcrumbs"] }) {
  if (breadcrumbs.length === 0) {
    return <p data-testid="issue-detail-breadcrumbs-empty" className="py-4 text-[11px] text-[var(--text-tertiary)]">No breadcrumbs recorded.</p>
  }
  return (
    <div data-testid="issue-detail-breadcrumbs-list" className="relative space-y-3 border-l border-[var(--line)] pl-4">
      {breadcrumbs.map((breadcrumb, index) => (
        <div key={`${breadcrumb.time}-${breadcrumb.type}-${index}`} className="relative">
          <div
            className={cn(
              "absolute -left-[17px] top-1.5 h-2 w-2 rounded-full border",
              breadcrumb.level === "error"
                ? "border-[var(--red)] bg-[var(--red)]"
                : breadcrumb.level === "warning"
                  ? "border-[var(--yellow)] bg-[var(--yellow)]"
                  : "border-[var(--line)] bg-[var(--surface-3)]",
            )}
          />
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex-shrink-0 font-mono text-[10px] text-[var(--text-faint)]">{breadcrumb.time}</span>
            <div>
              <span className="mr-2 rounded bg-[var(--surface-3)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">{breadcrumb.type}</span>
              <span className="text-[11px] text-[var(--text-primary)]">{breadcrumb.message}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function ContextTab({ issue }: { issue: Issue }) {
  return (
    <div className="space-y-2.5">
      {[
        { label: "tags", items: issue.tags },
        { label: "project", items: [issue.project] },
        { label: "environment", items: [issue.environment] },
      ].map(({ label, items }) => (
        <div key={label} className="flex items-start gap-3">
          <span className="mt-[3px] w-20 flex-shrink-0 font-mono text-[10px] text-[var(--text-faint)]">{label}</span>
          <div className="flex flex-wrap gap-1">
            {items.map((item) => (
              <span key={item} className="rounded bg-[var(--surface-2)] px-2 py-[2px] font-mono text-[10px] text-[var(--text-primary)] ring-1 ring-inset ring-[var(--line)]">
                {item}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

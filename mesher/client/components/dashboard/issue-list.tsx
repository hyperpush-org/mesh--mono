"use client"

import { cn } from "@/lib/utils"
import type { Issue, Severity, IssueStatus } from "@/lib/mock-data"
import type { IssuesOverviewSource } from "@/lib/issues-live-adapter"
import { GitBranch, Sparkles, Users, RefreshCw, Database } from "lucide-react"

const severityColor: Record<Severity, string> = {
  critical: "var(--red)",
  high: "var(--yellow)",
  medium: "var(--blue)",
  low: "var(--text-faint)",
}

const severityTextClass: Record<Severity, string> = {
  critical: "text-[var(--red)]",
  high: "text-[var(--yellow)]",
  medium: "text-[var(--blue)]",
  low: "text-[var(--text-tertiary)]",
}

const STATUS_BADGE_CONFIG: Record<IssueStatus, { label: string; className: string }> = {
  open: {
    label: "open",
    className: "bg-[var(--red)]/[0.10] text-[var(--red)] ring-[var(--red)]/20",
  },
  "in-progress": {
    label: "in progress",
    className: "bg-[var(--yellow)]/[0.08] text-[var(--yellow)] ring-[var(--yellow)]/15",
  },
  regressed: {
    label: "regressed",
    className: "bg-[var(--red)]/[0.10] text-[var(--red)] ring-[var(--red)]/20",
  },
  resolved: {
    label: "resolved",
    className: "bg-[var(--green)]/[0.08] text-[var(--green)] ring-[var(--green)]/15",
  },
  ignored: {
    label: "ignored",
    className: "bg-[var(--surface-3)] text-[var(--text-secondary)] ring-[var(--line)]",
  },
}

function StatusBadge({
  issueId,
  status,
  source,
}: {
  issueId: string
  status: IssueStatus
  source: "live" | "fallback"
}) {
  const config = STATUS_BADGE_CONFIG[status]

  if (status === "regressed") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-[4px] px-1.5 py-[2px] text-[11px] font-semibold leading-none ring-1 ring-inset",
          config.className,
        )}
        data-source={source}
        data-status={status}
        data-testid={`issue-row-status-${issueId}`}
      >
        <RefreshCw size={8} className="animate-spin" style={{ animationDuration: "3s" }} />
        {config.label}
      </span>
    )
  }

  if (status === "in-progress") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-[4px] px-1.5 py-[2px] text-[11px] font-medium leading-none ring-1 ring-inset",
          config.className,
        )}
        data-source={source}
        data-status={status}
        data-testid={`issue-row-status-${issueId}`}
      >
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[currentColor]" />
        {config.label}
      </span>
    )
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[4px] px-1.5 py-[2px] text-[11px] font-medium leading-none ring-1 ring-inset",
        config.className,
      )}
      data-source={source}
      data-status={status}
      data-testid={`issue-row-status-${issueId}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-[currentColor]" />
      {config.label}
    </span>
  )
}

function FilePath({ path }: { path: string }) {
  const parts = path.split("/")
  const file = parts.pop() || ""
  return (
    <span className="font-mono text-[11px] leading-none">
      <span className="text-[var(--text-faint)]">{parts.join("/")}/</span>
      <span className="text-[var(--text-tertiary)]">{file}</span>
    </span>
  )
}

interface IssueRowProps {
  issue: Issue
  isSelected: boolean
  onClick: () => void
  overviewSource: IssuesOverviewSource
}

function IssueRow({ issue, isSelected, onClick, overviewSource }: IssueRowProps) {
  const accent = severityColor[issue.severity]
  const isLiveOverlayIssue = overviewSource !== "fallback" && issue.project === "default"
  const statusSource = isLiveOverlayIssue ? "live" : "fallback"

  return (
    <button
      onClick={onClick}
      data-live-status={isLiveOverlayIssue ? issue.status : "fallback"}
      data-source={isLiveOverlayIssue ? "mixed" : "fallback"}
      data-status={issue.status}
      data-testid={`issue-row-${issue.id}`}
      className={cn(
        "group relative w-full text-left",
        "border-b border-[var(--line)]",
        "transition-colors duration-100",
        isSelected ? "bg-[var(--surface-2)]" : "hover:bg-[var(--surface-2)]/60",
      )}
      type="button"
    >
      <div
        className="absolute left-0 inset-y-0 w-[3px]"
        style={{ backgroundColor: accent, opacity: issue.severity === "low" ? 0.4 : 1 }}
      />

      <div className="pl-4 sm:pl-5 pr-3 sm:pr-4 py-3.5">
        <div className="flex items-start gap-3 sm:gap-5">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[13.5px] font-semibold leading-snug text-[var(--text-primary)] sm:text-sm">
              {issue.title}
            </p>

            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span
                className={cn(
                  "text-[11px] font-semibold uppercase tracking-[0.05em] leading-none",
                  severityTextClass[issue.severity],
                )}
              >
                {issue.severity}
              </span>
              <span className="text-[var(--line)]">·</span>
              <span className="text-[11px] font-mono text-[var(--text-faint)]">{issue.id}</span>
              <span className="text-[var(--line)]">·</span>
              <span className="max-w-[24rem] truncate text-[12px] text-[var(--text-secondary)]">
                {issue.subtitle}
              </span>
              <StatusBadge issueId={issue.id} source={statusSource} status={issue.status} />
              {isLiveOverlayIssue ? (
                <span className="inline-flex items-center gap-1 rounded-[4px] bg-[var(--blue)]/[0.08] px-1.5 py-[2px] text-[10px] font-medium leading-none text-[var(--blue)] ring-1 ring-inset ring-[var(--blue)]/15">
                  <Database size={9} /> live status + fallback shell
                </span>
              ) : null}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <FilePath path={issue.file} />
              <span className="text-[var(--line)] opacity-60">·</span>
              {[issue.project, issue.environment, ...issue.tags.slice(0, 2)].map((tag, index) => (
                <span key={`${tag}-${index}`} className="text-[11px] font-medium text-[var(--text-faint)]">
                  {tag}
                </span>
              ))}
              {issue.githubIssue && (
                <span className="inline-flex items-center gap-1 rounded-[4px] bg-[var(--surface-3)] px-1.5 py-[2px] font-mono text-[10px] leading-none text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--line)]">
                  <GitBranch size={9} className="opacity-60" /> {issue.githubIssue}
                </span>
              )}
              {issue.aiSummary && (
                <span className="inline-flex items-center gap-1 rounded-[4px] bg-[var(--purple)]/[0.08] px-1.5 py-[2px] text-[10px] leading-none text-[var(--purple)] ring-1 ring-inset ring-[var(--purple)]/15">
                  <Sparkles size={9} /> AI
                </span>
              )}
              {issue.assignee && (
                <span className="ml-auto flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
                  <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[var(--surface-3)] text-[8px] font-bold uppercase text-[var(--text-primary)] ring-1 ring-inset ring-[var(--line)]">
                    {issue.assignee[0]}
                  </span>
                  {issue.assignee}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-shrink-0 items-start gap-3 pt-0.5 sm:gap-4">
            <div className="w-[48px] text-right sm:w-[56px]">
              <p className="text-sm font-bold leading-none tabular-nums text-[var(--text-primary)]">
                {issue.count.toLocaleString()}
              </p>
              <p className="mt-1 text-[10px] text-[var(--text-tertiary)]">events</p>
            </div>
            <div className="w-[38px] text-right sm:w-[44px]">
              <p className="flex items-center justify-end gap-1 text-sm font-bold leading-none tabular-nums text-[var(--text-primary)]">
                <Users size={10} className="text-[var(--text-tertiary)]" />
                {issue.users}
              </p>
              <p className="mt-1 text-[10px] text-[var(--text-tertiary)]">users</p>
            </div>
            <div className="w-[52px] text-right sm:w-[60px]">
              <p className="text-[12px] font-medium leading-none text-[var(--text-primary)]">{issue.lastSeen}</p>
              <p className="mt-1.5 text-[10px] text-[var(--text-faint)]">first {issue.firstSeen}</p>
            </div>
          </div>
        </div>
      </div>
    </button>
  )
}

interface IssueListProps {
  issues: Issue[]
  selectedId: string | null
  onSelect: (id: string) => void
  statusFilter: string
  severityFilter: string
  overviewSource: IssuesOverviewSource
}

function getOverviewCaption(source: IssuesOverviewSource) {
  if (source === "fallback") {
    return "Fallback issue list active"
  }

  return "Live issue rows active · live status badges + fallback shell extras"
}

export function IssueList({
  issues,
  selectedId,
  onSelect,
  statusFilter,
  severityFilter,
  overviewSource,
}: IssueListProps) {
  if (issues.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center" data-testid="issues-list-empty">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--surface-2)] ring-1 ring-inset ring-[var(--line)]">
          <Sparkles size={20} className="text-[var(--text-tertiary)]" />
        </div>
        <p className="mb-1 text-sm font-medium text-[var(--text-primary)]">No issues found</p>
        <p className="text-[11px] text-[var(--text-secondary)]">Try adjusting your filters</p>
      </div>
    )
  }

  return (
    <div className="min-h-[16rem]" data-testid="issues-list" data-source={overviewSource}>
      <div className="border-b border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-[10px] uppercase tracking-[0.08em] text-[var(--text-faint)] sm:px-5">
        {getOverviewCaption(overviewSource)}
      </div>
      <div className="flex flex-wrap items-center gap-y-1.5 border-b border-[var(--line)] bg-[var(--surface)] pl-4 pr-3 py-2 sm:pl-5 sm:pr-4">
        <div className="min-w-0 flex items-center gap-3">
          <span className="whitespace-nowrap text-[11px] text-[var(--text-secondary)]">
            <span className="font-semibold tabular-nums text-[var(--text-primary)]">{issues.length}</span> issues
            {statusFilter !== "all" && <span className="text-[var(--text-faint)]"> · {statusFilter}</span>}
            {severityFilter !== "all" && <span className="text-[var(--text-faint)]"> · {severityFilter}</span>}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--text-faint)]">Sort: Last seen</span>
            <button className="text-[11px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] active:scale-[0.97]" type="button">
              Bulk actions
            </button>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-3 sm:gap-4">
          <span className="w-[48px] text-right text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)] sm:w-[56px]">
            events
          </span>
          <span className="w-[38px] text-right text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)] sm:w-[44px]">
            users
          </span>
          <span className="w-[52px] text-right text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)] sm:w-[60px]">
            time
          </span>
        </div>
      </div>

      {issues.map((issue) => (
        <IssueRow
          key={issue.id}
          issue={issue}
          isSelected={selectedId === issue.id}
          onClick={() => onSelect(issue.id)}
          overviewSource={overviewSource}
        />
      ))}
    </div>
  )
}

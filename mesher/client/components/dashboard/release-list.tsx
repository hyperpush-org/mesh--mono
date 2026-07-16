"use client"

import { type Release } from "@/lib/mock-data"
import { cn } from "@/lib/utils"
import {
  GitBranch, Clock, CheckCircle2,
  XCircle, PauseCircle, ArrowUpRight, ArrowDownRight
} from "lucide-react"

interface ReleaseListProps {
  releases: Release[]
  selectedId: string | null
  onSelect: (release: Release) => void
}

const statusConfig: Record<Release["status"], { icon: React.ElementType; color: string; label: string }> = {
  deployed: { icon: CheckCircle2, color: "var(--green)", label: "Deployed" },
  "rolling-back": { icon: ArrowUpRight, color: "var(--yellow)", label: "Rolling Back" },
  failed: { icon: XCircle, color: "var(--red)", label: "Failed" },
  pending: { icon: PauseCircle, color: "var(--blue)", label: "Pending" },
  staged: { icon: Clock, color: "var(--purple)", label: "Staged" },
}

const environmentConfig: Record<Release["environment"], { color: string; label: string }> = {
  production: { color: "var(--green)", label: "Production" },
  staging: { color: "var(--blue)", label: "Staging" },
}

export function ReleaseList({ releases, selectedId, onSelect }: ReleaseListProps) {
  if (releases.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-12 h-12 rounded-lg bg-[var(--surface-2)] ring-1 ring-inset ring-[var(--line)] flex items-center justify-center mb-4">
          <GitBranch size={20} className="text-[var(--text-tertiary)]" />
        </div>
        <p className="text-sm font-medium text-[var(--text-primary)] mb-1">No releases found</p>
        <p className="text-[11px] text-[var(--text-secondary)]">Try adjusting your filters</p>
      </div>
    )
  }

  return (
    <div className="min-h-[16rem]">
      {/* Header: count */}
      <div className="flex flex-wrap items-center px-4 py-2 border-b border-[var(--line)] bg-[var(--surface)]">
        <span className="text-[11px] text-[var(--text-secondary)] whitespace-nowrap">
          <span className="text-[var(--text-primary)] font-semibold tabular-nums">{releases.length}</span> releases
        </span>
        <div className="flex items-center gap-2 ml-auto">
          <button className="text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors active:scale-[0.97]">Bulk actions</button>
        </div>
      </div>

      {/* Rows */}
      {releases.map((release) => {
        const status = statusConfig[release.status]
        const env = environmentConfig[release.environment]
        const isSelected = selectedId === release.id

        return (
          <button
            key={release.id}
            onClick={() => onSelect(release)}
            className={cn(
              "group relative w-full text-left border-b border-[var(--line)] transition-colors duration-100",
              isSelected
                ? "bg-[var(--surface-2)]"
                : "hover:bg-[var(--surface-2)]/60"
            )}
          >
            {/* Full-height left status stripe */}
            <div
              className="absolute left-0 inset-y-0 w-[3px]"
              style={{ backgroundColor: status.color, opacity: 1 }}
            />

            <div className="pl-4 sm:pl-5 pr-3 sm:pr-4 py-3.5">
              <div className="flex items-start gap-3 sm:gap-5">

                {/* Main content */}
                <div className="flex-1 min-w-0">

                  {/* Title row */}
                  <div className="flex items-center gap-2 mb-1.5">
                    <GitBranch size={14} className="shrink-0 text-[var(--text-tertiary)]" />
                    <p className="text-[13.5px] sm:text-sm font-semibold font-mono text-[var(--text-primary)] leading-snug">
                      {release.version}
                    </p>
                  </div>

                  {/* Meta row 1: commit · author · branch */}
                  <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                    <span className="text-[11px] font-mono text-[var(--text-faint)]">{release.commit}</span>
                    <span className="text-[var(--line)]">·</span>
                    <span className="text-[11px] font-medium text-[var(--text-faint)]">{release.author}</span>
                    <span className="text-[var(--line)]">·</span>
                    <span className="text-[11px] font-medium text-[var(--text-faint)]">{release.branch}</span>
                  </div>

                  {/* Commit message */}
                  <p className="text-[12px] text-[var(--text-secondary)] truncate mb-2">
                    {release.commitMessage}
                  </p>

                  {/* Meta row 2: error rate · P95 */}
                  <div className="flex items-center gap-1.5 flex-wrap mt-2">
                    <code className="text-[11px] font-mono text-[var(--text-faint)]">
                      Error rate: <span className={cn("font-semibold", release.errorRateChange > 0 ? "text-[var(--red)]" : "text-[var(--green)]")}>{release.errorRate}%</span>
                      {release.errorRateChange !== 0 && (
                        <span className="ml-0.5">
                          {release.errorRateChange > 0 ? "+" : ""}{release.errorRateChange}%
                        </span>
                      )}
                    </code>
                    <span className="text-[var(--line)]">·</span>
                    <code className="text-[11px] font-mono text-[var(--text-faint)]">
                      P95: <span className={cn("font-semibold", release.p95LatencyChange > 0 ? "text-[var(--red)]" : "text-[var(--green)]")}>{release.p95Latency}ms</span>
                      {release.p95LatencyChange !== 0 && (
                        <span className="ml-0.5">
                          {release.p95LatencyChange > 0 ? "+" : ""}{release.p95LatencyChange}
                        </span>
                      )}
                    </code>
                  </div>
                </div>

                {/* Right: status + env + time */}
                <div className="flex-shrink-0 flex flex-col items-end gap-2 pt-0.5">
                  {/* Status + env */}
                  <div className="text-right">
                    <div className="flex items-center gap-1.5 justify-end">
                      <status.icon size={11} className={cn("shrink-0", { "animate-pulse": release.status === "rolling-back" })} style={{ color: status.color }} />
                      <span className="text-sm font-bold tabular-nums" style={{ color: status.color }}>
                        {status.label}
                      </span>
                    </div>
                    <div className="mt-1">
                      <span
                        className="px-1.5 py-[2px] rounded-[4px] font-medium leading-none ring-1 ring-inset text-[11px]"
                        style={{ backgroundColor: env.color + "15", color: env.color, borderColor: env.color + "30" }}
                      >
                        {env.label}
                      </span>
                    </div>
                  </div>
                  {/* Timing */}
                  <div className="text-right">
                    <p className="text-[12px] font-medium text-[var(--text-primary)]">{release.deployedAt}</p>
                  </div>
                </div>

              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

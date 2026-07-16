"use client"

import { MOCK_RELEASE_STATS } from "@/lib/mock-data"
import { GitBranch, Rocket, AlertTriangle, Clock, Zap, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  icon: React.ElementType
  accent?: "green" | "red" | "default" | "purple"
}

function StatCard({ label, value, sub, icon: Icon, accent = "default" }: StatCardProps) {
  const isGreen = accent === "green"
  const isRed = accent === "red"
  const isPurple = accent === "purple"

  return (
    <div className={cn(
      "flex-1 px-4 py-3 relative",
      isRed && "bg-[var(--red)]/[0.03]"
    )}>
      {isRed && (
        <div className="absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-[var(--red)]/30 to-transparent" />
      )}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)] truncate">{label}</span>
        <Icon
          size={12}
          className={cn(
            "shrink-0 ml-1",
            isGreen && "text-[var(--green)]",
            isRed && "text-[var(--red)]",
            isPurple && "text-[var(--purple)]",
            !isGreen && !isRed && !isPurple && "text-[var(--text-faint)]"
          )}
        />
      </div>
      <div className="flex items-end gap-1.5">
        <span className={cn(
          "text-[20px] font-bold leading-none tracking-tight tabular-nums",
          isGreen && "text-[var(--green)]",
          isRed && "text-[var(--red)]",
          isPurple && "text-[var(--purple)]",
          !isGreen && !isRed && !isPurple && "text-[var(--text-primary)]"
        )}>
          {value}
        </span>
        {sub && <span className="text-[10px] text-[var(--text-secondary)] mb-0.5">{sub}</span>}
      </div>
    </div>
  )
}

interface ReleaseStatsProps {
  compact?: boolean
}

export function ReleaseStats({ compact = false }: ReleaseStatsProps) {
  return (
    <div
      className={cn(
        "border-b border-[var(--line)] bg-[var(--surface)]",
        compact
          ? "grid grid-cols-4"
          : "grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7"
      )}
      style={{ boxShadow: "var(--shadow-inset-subtle)" }}
    >
      <StatCard label="Total Releases" value={MOCK_RELEASE_STATS.totalReleases} icon={GitBranch} />
      <StatCard label="Successful" value={MOCK_RELEASE_STATS.successfulDeployments} sub="deployments" icon={CheckCircle2} accent="green" />
      <StatCard label="Failed" value={MOCK_RELEASE_STATS.failedDeployments} icon={AlertTriangle} accent="red" />
      <StatCard label="Rollback Rate" value={MOCK_RELEASE_STATS.rollbackRate} icon={Rocket} />
      <StatCard label="Avg Deploy Time" value={MOCK_RELEASE_STATS.avgDeploymentTime} icon={Clock} />
      <StatCard label="Active Releases" value={MOCK_RELEASE_STATS.activeReleases} icon={Zap} />
      <StatCard label="Deploys Today" value={MOCK_RELEASE_STATS.deploymentsToday} icon={GitBranch} accent="purple" />
    </div>
  )
}

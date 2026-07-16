"use client"

import { useState, useMemo, useCallback, useRef } from "react"
import { cn } from "@/lib/utils"
import { MOCK_RELEASES, type Release } from "@/lib/mock-data"
import { ReleaseStats } from "./release-stats"
import { ReleaseList } from "./release-list"
import { ReleaseDetail } from "./release-detail"
import { Search, SlidersHorizontal, GitBranch, CheckCircle2, XCircle, Clock, Zap } from "lucide-react"

type SortKey = "deployedAt" | "version" | "errorRate" | "p95Latency"
type SortDir = "asc" | "desc"

export function ReleasesPage() {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [environmentFilter, setEnvironmentFilter] = useState("all")
  const [sortKey, setSortKey] = useState<SortKey>("deployedAt")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [selectedRelease, setSelectedRelease] = useState<Release | null>(null)
  const [animating, setAnimating] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const toggleSort = useCallback((key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"))
    } else {
      setSortKey(key)
      setSortDir("desc")
    }
  }, [sortKey])

  const filtered = useMemo(() => {
    let releases = MOCK_RELEASES.filter((r) => {
      if (search && !r.version.toLowerCase().includes(search.toLowerCase()) &&
          !r.commitMessage.toLowerCase().includes(search.toLowerCase()) &&
          !r.commit.toLowerCase().includes(search.toLowerCase())) return false
      if (statusFilter !== "all" && r.status !== statusFilter) return false
      if (environmentFilter !== "all" && r.environment !== environmentFilter) return false
      return true
    })
    releases.sort((a, b) => {
      if (sortKey === "version") {
        const va = parseInt(a.version.replace(/\D/g, ""), 10)
        const vb = parseInt(b.version.replace(/\D/g, ""), 10)
        return sortDir === "desc" ? vb - va : va - vb
      }
      const av = a[sortKey]
      const bv = b[sortKey]
      return sortDir === "desc" ? (bv as number) - (av as number) : (av as number) - (bv as number)
    })
    return releases
  }, [search, statusFilter, environmentFilter, sortKey, sortDir])

  const closePanel = useCallback(() => {
    if (!selectedRelease) return
    setAnimating(true)
    setTimeout(() => {
      setSelectedRelease(null)
      setAnimating(false)
    }, 150)
  }, [selectedRelease])

  const openRelease = useCallback((release: Release) => {
    if (selectedRelease?.id === release.id) {
      closePanel()
    } else {
      setSelectedRelease(release)
      setAnimating(false)
    }
  }, [selectedRelease, closePanel])

  const hasPanel = selectedRelease !== null
  const isCompact = hasPanel

  return (
    <>
      <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-y-auto overflow-x-hidden transition-all duration-200 ease-out">
        <ReleaseStats compact={isCompact} />

        {/* Filter bar */}
        <ReleasesFilterBar
          search={search}
          onSearch={setSearch}
          statusFilter={statusFilter}
          onStatusFilter={setStatusFilter}
          environmentFilter={environmentFilter}
          onEnvironmentFilter={setEnvironmentFilter}
        />

        {/* Sort bar */}
        <ReleasesSortBar
          sortKey={sortKey}
          sortDir={sortDir}
          onToggleSort={toggleSort}
          compact={isCompact}
        />

        {/* Release list */}
        <ReleaseList
          releases={filtered}
          selectedId={selectedRelease?.id ?? null}
          onSelect={openRelease}
        />
      </div>

      {/* Detail panel */}
      {hasPanel && (
        <div
          ref={panelRef}
          className={`flex flex-col w-[440px] md:w-[380px] sm:w-[320px] shrink-0 overflow-hidden relative z-10 ${animating ? "panel-exit" : "panel-enter"}`}
          style={{ boxShadow: "var(--shadow-panel)" }}
        >
          <ReleaseDetail release={selectedRelease!} onClose={closePanel} />
        </div>
      )}
    </>
  )
}

/* ── Filter bar ── */
interface FilterProps {
  search: string
  onSearch: (v: string) => void
  statusFilter: string
  onStatusFilter: (v: string) => void
  environmentFilter: string
  onEnvironmentFilter: (v: string) => void
}

function ReleasesFilterBar({ search, onSearch, statusFilter, onStatusFilter, environmentFilter, onEnvironmentFilter }: FilterProps) {
  const statuses = ["all", "deployed", "rolling-back", "failed", "pending", "staged"]
  const environments = ["all", "production", "staging"]

  const statusLabel: Record<string, string> = {
    all: "All Status",
    deployed: "Deployed",
    "rolling-back": "Rolling Back",
    failed: "Failed",
    pending: "Pending",
    staged: "Staged",
  }

  const envLabel: Record<string, string> = {
    all: "All Environments",
    production: "Production",
    staging: "Staging",
  }

  return (
    <div className="flex flex-wrap items-center gap-1 px-2 py-2 border-b border-[var(--line)] bg-[var(--surface)]">
      <div className="relative w-48 md:w-52 shrink-0">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search releases…"
          className="w-full pl-8 pr-3 py-1 bg-transparent text-xs text-[var(--text-primary)] placeholder:text-[var(--text-faint)] focus:outline-none transition-all duration-150"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1 ml-auto">
        <div className="flex items-center gap-0.5">
          <SlidersHorizontal size={11} className="text-[var(--text-faint)] mr-1 hidden sm:block" />
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => onStatusFilter(s)}
              className={cn(
                "px-1.5 sm:px-2 py-1 rounded-md text-[11px] font-medium transition-all duration-150 active:scale-[0.96]",
                statusFilter === s
                  ? "bg-[var(--surface-3)] text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)]"
              )}
            >
              {statusLabel[s] || s}
            </button>
          ))}
        </div>

        <div className="w-px h-3.5 bg-[var(--line)] mx-1 hidden md:block" />

        <div className="flex items-center gap-0.5">
          {environments.slice(1).map((e) => {
            const isActive = environmentFilter === e
            const colorMap: Record<string, string> = {
              production: isActive ? "bg-[var(--green)]/[0.10] text-[var(--green)]" : "",
              staging: isActive ? "bg-[var(--blue)]/[0.10] text-[var(--blue)]" : "",
            }
            return (
              <button
                key={e}
                onClick={() => onEnvironmentFilter(e === environmentFilter ? "all" : e)}
                className={cn(
                  "px-1.5 sm:px-2 py-1 rounded-md text-[11px] font-medium capitalize transition-all duration-150 active:scale-[0.96]",
                  colorMap[e] || "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)]"
                )}
              >
                {e}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ── Sort bar ── */
interface SortBarProps {
  sortKey: SortKey
  sortDir: SortDir
  onToggleSort: (key: SortKey) => void
  compact?: boolean
}

function ReleasesSortBar({ sortKey, sortDir, onToggleSort, compact }: SortBarProps) {
  const sortOptions: Array<{ key: SortKey; label: string; icon: React.ElementType }> = [
    { key: "deployedAt", label: "Deployed", icon: Clock },
    { key: "version", label: "Version", icon: GitBranch },
    { key: "errorRate", label: "Error Rate", icon: XCircle },
    { key: "p95Latency", label: "P95 Latency", icon: Zap },
  ]

  return (
    <div className={cn(
      "flex items-center gap-1 px-4 py-2 border-b border-[var(--line)] bg-[var(--surface)]/50",
      compact && "px-3 py-1.5"
    )}>
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)] mr-2">Sort by</span>
      {sortOptions.map(({ key, label, icon: Icon }) => {
        const isActive = sortKey === key
        return (
          <button
            key={key}
            onClick={() => onToggleSort(key)}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all duration-150 active:scale-[0.96]",
              isActive
                ? "bg-[var(--surface-3)] text-[var(--text-primary)] ring-1 ring-inset ring-[var(--line)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)]"
            )}
          >
            <Icon size={10} />
            <span>{label}</span>
            {isActive && (
              <span className="text-[9px] text-[var(--text-faint)] ml-0.5">
                {sortDir === "asc" ? "↑" : "↓"}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

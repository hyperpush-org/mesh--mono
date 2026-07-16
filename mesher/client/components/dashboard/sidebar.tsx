"use client"

import { useState } from "react"
import { Link } from "@tanstack/react-router"
import {
  getDashboardRoute,
  type DashboardRouteKey,
} from "@/components/dashboard/dashboard-route-map"
import { cn } from "@/lib/utils"
import {
  AlertTriangle,
  Activity,
  GitBranch,
  Bell,
  Settings,
  ChevronDown,
  Box,
  PanelLeftClose,
  PanelLeftOpen,
  Check,
  Plus,
} from "lucide-react"

const PROJECTS = [
  { id: "hyperpush-web", label: "hyperpush-web", color: "var(--green)" },
  { id: "hyperpush-api", label: "hyperpush-api", color: "var(--blue)" },
]

type NavItem = {
  icon: React.ElementType
  label: string
  href: DashboardRouteKey
  badge?: string
  accent?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { icon: AlertTriangle, label: "Issues", href: "issues", badge: "24" },
  { icon: Activity, label: "Performance", href: "performance" },
  { icon: GitBranch, label: "Releases", href: "releases" },
  { icon: Bell, label: "Alerts", href: "alerts", badge: "3" },
  { icon: Settings, label: "Settings", href: "settings" },
]

interface SidebarProps {
  active: DashboardRouteKey
  collapsed: boolean
  onToggleCollapse: () => void
}

export function Sidebar({ active, collapsed, onToggleCollapse }: SidebarProps) {
  const [activeProject, setActiveProject] = useState("hyperpush-web")
  const [projectOpen, setProjectOpen] = useState(false)
  const project = PROJECTS.find((candidate) => candidate.id === activeProject) ?? PROJECTS[0]

  const handleToggleProject = () => {
    if (collapsed) return
    setProjectOpen((open) => !open)
  }

  const handleSelectProject = (id: string) => {
    setActiveProject(id)
    setProjectOpen(false)
  }

  return (
    <aside
      className="fixed left-0 top-0 z-30 flex h-screen flex-col overflow-hidden bg-[var(--surface)] transition-[width] duration-200 ease-out"
      data-collapsed={collapsed ? "true" : "false"}
      data-testid="dashboard-sidebar"
      style={{ width: collapsed ? "var(--sidebar-collapsed)" : "var(--sidebar-width)", boxShadow: "var(--shadow-sidebar)" }}
    >
      <div
        className={cn(
          "flex items-center border-b border-[var(--line)] shrink-0",
          collapsed ? "justify-center" : "justify-between px-5"
        )}
        style={{ height: "var(--header-height)" }}
      >
        {!collapsed && <img src="/logo-light.svg" alt="hyperpush" className="h-5" />}
        <button
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-tertiary)] transition-all duration-150 hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)] active:scale-[0.93]"
          data-testid="sidebar-collapse-toggle"
          onClick={onToggleCollapse}
        >
          {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </button>
      </div>

      <div className="shrink-0">
        <button
          aria-expanded={projectOpen}
          className={cn(
            "flex items-center w-full transition-colors shrink-0",
            collapsed ? "justify-center py-3" : "justify-between gap-2 px-5 py-3",
            projectOpen ? "bg-[var(--surface-2)]" : "hover:bg-[var(--surface-2)]"
          )}
          onClick={handleToggleProject}
        >
          <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-[5px] bg-[var(--surface-3)] ring-1 ring-inset ring-[var(--line)]">
            <Box size={10} style={{ color: project.color }} />
          </div>
          {!collapsed && (
            <>
              <span className="flex-1 truncate text-left text-xs font-medium text-[var(--text-primary)]">
                {project.label}
              </span>
              <ChevronDown
                size={12}
                className={cn(
                  "flex-shrink-0 text-[var(--text-tertiary)] transition-transform duration-200",
                  projectOpen && "rotate-180"
                )}
              />
            </>
          )}
        </button>

        <div
          aria-hidden={!projectOpen}
          className={cn(
            "overflow-hidden transition-all duration-200 ease-out",
            projectOpen ? "max-h-64 opacity-100" : "max-h-0 opacity-0"
          )}
        >
          <div className="border-b border-[var(--line)] bg-[var(--surface-2)] py-1.5">
            <div className="px-5 py-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-faint)]">
                Projects
              </p>
            </div>

            {PROJECTS.map((projectOption) => {
              const isSelected = activeProject === projectOption.id
              return (
                <button
                  key={projectOption.id}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-5 py-[7px] text-[12px] font-medium transition-colors",
                    isSelected
                      ? "text-[var(--text-primary)]"
                      : "text-[var(--text-secondary)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
                  )}
                  onClick={() => handleSelectProject(projectOption.id)}
                >
                  <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-[5px] bg-[var(--surface-3)] ring-1 ring-inset ring-[var(--line)]">
                    <Box size={10} style={{ color: projectOption.color }} />
                  </div>
                  <span className="flex-1 truncate text-left">{projectOption.label}</span>
                  {isSelected && <Check size={11} className="shrink-0 text-[var(--green)]" />}
                </button>
              )
            })}

            <div className="mx-4 my-1.5 h-px bg-[var(--line)]" />
            <button
              className="flex w-full items-center gap-2.5 px-5 py-[7px] text-[12px] font-medium text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text-secondary)]"
              onClick={() => setProjectOpen(false)}
            >
              <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-[5px] bg-[var(--surface-2)] ring-1 ring-inset ring-[var(--line)]">
                <Plus size={10} className="text-[var(--text-faint)]" />
              </div>
              <span>New project…</span>
            </button>
          </div>
        </div>

        {!projectOpen && <div className="border-b border-[var(--line)]" />}
      </div>

      <nav className={cn("flex-1 overflow-y-auto py-2", collapsed ? "px-1.5" : "px-2.5")}>
        {!collapsed && (
          <div className="px-2 pb-2 pt-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-tertiary)]">Monitor</p>
          </div>
        )}
        {NAV_ITEMS.map((item) => {
          const isActive = active === item.href
          const route = getDashboardRoute(item.href)
          return (
            <Link
              key={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "group mb-0.5 flex w-full items-center rounded-md text-[12.5px] font-medium transition-all duration-150 active:scale-[0.97]",
                collapsed ? "justify-center py-2" : "justify-between px-2.5 py-[7px]",
                isActive
                  ? "bg-[var(--surface-3)] text-[var(--text-primary)] shadow-[var(--shadow-inset-subtle)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
              )}
              data-active={isActive ? "true" : "false"}
              data-testid={`sidebar-nav-${item.href}`}
              title={collapsed ? item.label : undefined}
              to={route.pathname}
            >
              {collapsed ? (
                <item.icon
                  size={16}
                  className={cn(
                    "transition-colors",
                    isActive ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)]"
                  )}
                />
              ) : (
                <>
                  <span className="flex items-center gap-2.5">
                    <item.icon
                      size={14}
                      className={cn(
                        "flex-shrink-0 transition-colors",
                        isActive ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)]"
                      )}
                    />
                    <span>{item.label}</span>
                    {item.accent && !isActive && (
                      <span className="rounded bg-[var(--purple-dim)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider leading-none text-[var(--purple)]">new</span>
                    )}
                  </span>
                  {item.badge && (
                    <span
                      className={cn(
                        "rounded-[4px] px-1.5 py-0.5 text-[10px] font-semibold leading-none tabular-nums",
                        isActive
                          ? "bg-[var(--text-primary)] text-[var(--background)]"
                          : "bg-[var(--surface-3)] text-[var(--text-tertiary)]"
                      )}
                    >
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </Link>
          )
        })}
      </nav>

      <div className={cn("shrink-0 border-t border-[var(--line)] py-3", collapsed ? "px-1.5" : "px-3")}>
        <div className={cn("flex items-center", collapsed ? "justify-center" : "justify-between gap-2.5 px-2")}>
          <div className={cn("flex items-center", collapsed ? "" : "gap-2.5")}>
            <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[var(--surface-3)] to-[var(--surface-2)] text-[10px] font-bold text-[var(--text-primary)] ring-1 ring-inset ring-[var(--line)]">
              N
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-[var(--text-primary)]">alex.kim</p>
                <p className="truncate text-[10px] text-[var(--text-tertiary)]">owner</p>
              </div>
            )}
          </div>
          <Link
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-tertiary)] transition-all duration-150 hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)] active:scale-[0.93]"
            data-testid="sidebar-footer-settings"
            title="Settings"
            to={getDashboardRoute("settings").pathname}
          >
            <Settings size={14} />
          </Link>
        </div>
      </div>
    </aside>
  )
}

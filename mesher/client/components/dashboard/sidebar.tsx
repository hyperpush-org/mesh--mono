'use client'

import { Link, useNavigate } from '@tanstack/react-router'
import { AlertTriangle, Bell, Box, LogOut, PanelLeftClose, PanelLeftOpen, Settings } from 'lucide-react'
import { getDashboardRoute, type DashboardRouteKey } from '@/components/dashboard/dashboard-route-map'
import { useDashboardSession } from '@/components/dashboard/dashboard-session'
import { cn } from '@/lib/utils'
import { logoutFromMesher } from '@/lib/mesher-api'

const NAV_ITEMS: Array<{ icon: React.ElementType; label: string; href: DashboardRouteKey }> = [
  { icon: AlertTriangle, label: 'Issues', href: 'issues' },
  { icon: Bell, label: 'Alerts', href: 'alerts' },
  { icon: Settings, label: 'Settings', href: 'settings' },
]

interface SidebarProps {
  active: DashboardRouteKey
  collapsed: boolean
  onToggleCollapse: () => void
}

function initials(value: string) {
  const tokens = value.split(/[^A-Za-z0-9]+/).filter(Boolean)
  if (tokens.length === 0) return 'HP'
  if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase()
  return `${tokens[0][0]}${tokens[1][0]}`.toUpperCase()
}

export function Sidebar({ active, collapsed, onToggleCollapse }: SidebarProps) {
  const navigate = useNavigate()
  const { user, projects, activeProject, setActiveProjectId } = useDashboardSession()

  const handleLogout = async () => {
    await logoutFromMesher()
    await navigate({ to: '/login' })
  }

  return (
    <aside
      className="fixed left-0 top-0 z-30 flex h-screen flex-col overflow-hidden bg-[var(--surface)] transition-[width] duration-200 ease-out"
      data-collapsed={collapsed ? 'true' : 'false'}
      data-testid="dashboard-sidebar"
      style={{ width: collapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-width)', boxShadow: 'var(--shadow-sidebar)' }}
    >
      <div className={cn('flex shrink-0 items-center border-b border-[var(--line)]', collapsed ? 'justify-center' : 'justify-between px-5')} style={{ height: 'var(--header-height)' }}>
        {collapsed ? null : <img src="/logo-light.svg" alt="hyperpush" className="h-5" />}
        <button aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-[var(--surface-2)]" data-testid="sidebar-collapse-toggle" onClick={onToggleCollapse} type="button">
          {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </button>
      </div>

      <div className="shrink-0 border-b border-[var(--line)] p-2.5">
        {collapsed ? (
          <div className="flex justify-center py-1" title={activeProject?.name}><Box size={15} className="text-[var(--green)]" /></div>
        ) : (
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-faint)]">Project</span>
            <select
              aria-label="Active project"
              className="w-full rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-2 py-2 text-xs text-[var(--text-primary)]"
              data-testid="active-project-select"
              onChange={(event) => setActiveProjectId(event.target.value)}
              value={activeProject?.id ?? ''}
            >
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
            <span className="mt-1 block truncate text-[10px] text-[var(--text-tertiary)]">{activeProject?.orgName} · {activeProject?.platform || 'platform not set'}</span>
          </label>
        )}
      </div>

      <nav className={cn('flex-1 overflow-y-auto py-2', collapsed ? 'px-1.5' : 'px-2.5')}>
        {NAV_ITEMS.map((item) => {
          const isActive = active === item.href
          return (
            <Link
              key={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn('group mb-0.5 flex items-center rounded-md text-[12.5px] font-medium', collapsed ? 'justify-center py-2' : 'gap-2.5 px-2.5 py-2', isActive ? 'bg-[var(--surface-3)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-2)]')}
              data-testid={`sidebar-nav-${item.href}`}
              title={collapsed ? item.label : undefined}
              to={getDashboardRoute(item.href).pathname}
            >
              <item.icon size={15} />
              {collapsed ? null : <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      <div className={cn('shrink-0 border-t border-[var(--line)] py-3', collapsed ? 'px-1.5' : 'px-3')}>
        <div className={cn('flex items-center', collapsed ? 'justify-center' : 'gap-2.5 px-2')}>
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-3)] text-[10px] font-bold">{initials(user?.display_name || user?.email || '')}</div>
          {collapsed ? null : (
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-[var(--text-primary)]">{user?.display_name || user?.email}</p>
              <p className="truncate text-[10px] text-[var(--text-tertiary)]">{activeProject?.role}</p>
            </div>
          )}
          <button aria-label="Sign out" className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-[var(--surface-2)]" data-testid="sidebar-sign-out" onClick={() => void handleLogout()} type="button"><LogOut size={14} /></button>
        </div>
      </div>
    </aside>
  )
}

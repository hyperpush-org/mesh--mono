'use client'

import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useLocation } from '@tanstack/react-router'
import { DashboardIssuesStateProvider } from '@/components/dashboard/dashboard-issues-state'
import { getDashboardRouteKeyByPathname, getDashboardRouteTitle } from '@/components/dashboard/dashboard-route-map'
import { Header } from '@/components/dashboard/header'
import { Sidebar } from '@/components/dashboard/sidebar'

export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <DashboardIssuesStateProvider>
      <DashboardShellLayout>{children}</DashboardShellLayout>
    </DashboardIssuesStateProvider>
  )
}

function DashboardShellLayout({ children }: { children: ReactNode }) {
  const pathname = useLocation({ select: (location) => location.pathname })
  const activeNav = getDashboardRouteKeyByPathname(pathname)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 639px)')
    const update = () => setSidebarCollapsed(mediaQuery.matches)
    update()
    mediaQuery.addEventListener('change', update)
    return () => mediaQuery.removeEventListener('change', update)
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--background)] font-sans" data-route-key={activeNav} data-testid="dashboard-shell">
      <Sidebar active={activeNav} collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed((value) => !value)} />
      <div
        className="flex min-w-0 flex-1 flex-col overflow-hidden transition-[margin] duration-200 ease-out"
        data-testid="dashboard-main"
        style={{ marginLeft: sidebarCollapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-width)' }}
      >
        {activeNav === 'settings' ? null : <Header title={getDashboardRouteTitle(activeNav)} />}
        <div className="relative flex min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>
    </div>
  )
}

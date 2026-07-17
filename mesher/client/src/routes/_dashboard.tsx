import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { DashboardShell } from '@/components/dashboard/dashboard-shell'
import { DashboardSessionProvider } from '@/components/dashboard/dashboard-session'
import { getMesherSessionToken } from '@/lib/mesher-api'

export const Route = createFileRoute('/_dashboard')({
  ssr: false,
  beforeLoad: () => {
    if (!getMesherSessionToken()) throw redirect({ to: '/login' })
  },
  component: DashboardLayoutRoute,
})

function DashboardLayoutRoute() {
  return (
    <DashboardSessionProvider>
      <DashboardShell>
        <Outlet />
      </DashboardShell>
    </DashboardSessionProvider>
  )
}

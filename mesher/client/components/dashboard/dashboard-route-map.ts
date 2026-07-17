import { isCapabilityLive, type CapabilityKey } from '@/lib/capabilities'

export const DASHBOARD_ROUTE_KEYS = [
  'issues',
  'alerts',
  'settings',
] as const

export type DashboardRouteKey = (typeof DASHBOARD_ROUTE_KEYS)[number]

export interface DashboardRouteDefinition {
  key: DashboardRouteKey
  pathname: string
  title: string
  navLabel: string
  capability: CapabilityKey
}

export const DASHBOARD_ROUTE_MAP: Record<DashboardRouteKey, DashboardRouteDefinition> = {
  issues: {
    key: 'issues',
    pathname: '/',
    title: 'Issues',
    navLabel: 'Issues',
    capability: 'issues',
  },
  alerts: {
    key: 'alerts',
    pathname: '/alerts',
    title: 'Alerts',
    navLabel: 'Alerts',
    capability: 'alerts',
  },
  settings: {
    key: 'settings',
    pathname: '/settings',
    title: 'Settings',
    navLabel: 'Settings',
    capability: 'project-settings',
  },
}

for (const route of Object.values(DASHBOARD_ROUTE_MAP)) {
  if (!isCapabilityLive(route.capability)) {
    throw new Error(`Dashboard route ${route.key} requires live capability ${route.capability}`)
  }
}

export function normalizeDashboardRouteKey(routeKey?: string | null): DashboardRouteKey {
  if (!routeKey) {
    return 'issues'
  }

  return routeKey in DASHBOARD_ROUTE_MAP
    ? (routeKey as DashboardRouteKey)
    : 'issues'
}

export function getDashboardRoute(routeKey?: string | null): DashboardRouteDefinition {
  return DASHBOARD_ROUTE_MAP[normalizeDashboardRouteKey(routeKey)]
}

export function getDashboardRouteKeyByPathname(pathname?: string | null): DashboardRouteKey {
  if (!pathname || pathname === '/') {
    return 'issues'
  }

  const normalizedPathname = pathname.replace(/\/+$/, '')

  for (const route of Object.values(DASHBOARD_ROUTE_MAP)) {
    if (route.pathname === normalizedPathname) {
      return route.key
    }
  }

  return 'issues'
}

export function getDashboardRouteTitle(routeKey?: string | null): string {
  return getDashboardRoute(routeKey).title
}

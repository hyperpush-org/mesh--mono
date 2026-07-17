'use client'

import type { ReactNode } from 'react'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  fetchMesherSessionContext,
  type MesherLoginResponse,
  type MesherSessionMembership,
} from '@/lib/mesher-api'

const ACTIVE_PROJECT_KEY = 'hyperpush.active-project-id'

interface DashboardProject {
  id: string
  slug: string
  name: string
  platform: string
  orgId: string
  orgName: string
  orgSlug: string
  role: MesherSessionMembership['role']
}

interface DashboardSessionValue {
  state: 'loading' | 'ready' | 'empty' | 'error'
  user: MesherLoginResponse['user'] | null
  projects: DashboardProject[]
  activeProject: DashboardProject | null
  setActiveProjectId: (projectId: string) => void
  retry: () => void
}

const DashboardSessionContext = createContext<DashboardSessionValue | null>(null)

function uniqueProjects(memberships: MesherSessionMembership[]): DashboardProject[] {
  const projects = new Map<string, DashboardProject>()

  for (const membership of memberships) {
    if (!membership.project_id || projects.has(membership.project_id)) continue
    projects.set(membership.project_id, {
      id: membership.project_id,
      slug: membership.project_slug,
      name: membership.project_name,
      platform: membership.project_platform,
      orgId: membership.org_id,
      orgName: membership.org_name,
      orgSlug: membership.org_slug,
      role: membership.role,
    })
  }

  return [...projects.values()]
}

export function DashboardSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DashboardSessionValue['state']>('loading')
  const [user, setUser] = useState<MesherLoginResponse['user'] | null>(null)
  const [projects, setProjects] = useState<DashboardProject[]>([])
  const [activeProjectId, setActiveProjectIdState] = useState<string | null>(null)
  const [requestVersion, setRequestVersion] = useState(0)

  useEffect(() => {
    const abortController = new AbortController()
    setState('loading')

    void fetchMesherSessionContext(abortController.signal)
      .then((context) => {
        if (abortController.signal.aborted) return
        const nextProjects = uniqueProjects(context.memberships)
        const storedProjectId = window.sessionStorage.getItem(ACTIVE_PROJECT_KEY)
        const nextActiveProject =
          nextProjects.find((project) => project.id === storedProjectId) ?? nextProjects[0] ?? null

        setUser(context.user)
        setProjects(nextProjects)
        setActiveProjectIdState(nextActiveProject?.id ?? null)
        if (nextActiveProject) {
          window.sessionStorage.setItem(ACTIVE_PROJECT_KEY, nextActiveProject.id)
          setState('ready')
        } else {
          window.sessionStorage.removeItem(ACTIVE_PROJECT_KEY)
          setState('empty')
        }
      })
      .catch(() => {
        if (!abortController.signal.aborted) setState('error')
      })

    return () => abortController.abort()
  }, [requestVersion])

  const setActiveProjectId = useCallback(
    (projectId: string) => {
      if (!projects.some((project) => project.id === projectId)) return
      window.sessionStorage.setItem(ACTIVE_PROJECT_KEY, projectId)
      setActiveProjectIdState(projectId)
    },
    [projects],
  )

  const retry = useCallback(() => setRequestVersion((version) => version + 1), [])
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null
  const value = useMemo<DashboardSessionValue>(
    () => ({ state, user, projects, activeProject, setActiveProjectId, retry }),
    [activeProject, projects, retry, setActiveProjectId, state, user],
  )

  if (state === 'loading') {
    return <main className="flex min-h-screen items-center justify-center bg-[var(--background)] text-sm text-[var(--text-secondary)]">Loading your workspace…</main>
  }

  if (state === 'error') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4 text-[var(--text-primary)]">
        <div className="max-w-md rounded-xl border border-[var(--line)] bg-[var(--surface)] p-6 text-center">
          <h1 className="text-lg font-semibold">Workspace unavailable</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">Your session is valid, but Hyperpush could not load its organization and project context.</p>
          <button className="mt-4 rounded-md bg-[var(--green)] px-4 py-2 text-sm font-semibold text-black" onClick={retry} type="button">Try again</button>
        </div>
      </main>
    )
  }

  if (state === 'empty') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4 text-[var(--text-primary)]">
        <div className="max-w-md rounded-xl border border-[var(--line)] bg-[var(--surface)] p-6 text-center">
          <h1 className="text-lg font-semibold">No authorized projects</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">Ask an organization owner to add you to a project. Self-service project creation is not available in this release.</p>
        </div>
      </main>
    )
  }

  return <DashboardSessionContext.Provider value={value}>{children}</DashboardSessionContext.Provider>
}

export function useDashboardSession() {
  const context = useContext(DashboardSessionContext)
  if (!context) throw new Error('useDashboardSession must be used within DashboardSessionProvider')
  return context
}

"use client"

import type { ReactNode } from "react"
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { useLocation } from "@tanstack/react-router"
import { AIPanel } from "@/components/dashboard/ai-panel"
import { DashboardIssuesStateProvider, useDashboardIssuesState } from "@/components/dashboard/dashboard-issues-state"
import {
  getDashboardRouteKeyByPathname,
  getDashboardRouteTitle,
} from "@/components/dashboard/dashboard-route-map"
import { Header } from "@/components/dashboard/header"
import { Sidebar } from "@/components/dashboard/sidebar"
import { Sparkles } from "lucide-react"

interface DashboardShellProps {
  children: ReactNode
}

interface DashboardShellContextValue {
  toggleAI: () => void
}

const DashboardShellContext = createContext<DashboardShellContextValue | null>(null)

export function useDashboardShell() {
  const context = useContext(DashboardShellContext)

  if (!context) {
    throw new Error("useDashboardShell must be used within DashboardShell")
  }

  return context
}

export function DashboardShell({ children }: DashboardShellProps) {
  return (
    <DashboardIssuesStateProvider>
      <DashboardShellLayout>{children}</DashboardShellLayout>
    </DashboardIssuesStateProvider>
  )
}

function DashboardShellLayout({ children }: DashboardShellProps) {
  const { clearSelectedIssue } = useDashboardIssuesState()
  const pathname = useLocation({
    select: (location) => location.pathname,
  })
  const activeNav = getDashboardRouteKeyByPathname(pathname)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [isAIPanelOpen, setIsAIPanelOpen] = useState(false)
  const [isClosingAIPanel, setIsClosingAIPanel] = useState(false)
  const aiCloseTimeoutRef = useRef<number | null>(null)
  const previousPathnameRef = useRef<string | null>(null)
  const copilotAutoCollapsedSidebar = useRef(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 639px)")

    const handleMediaChange = (event: MediaQueryListEvent) => {
      setSidebarCollapsed(event.matches)
    }

    setSidebarCollapsed(mediaQuery.matches)

    mediaQuery.addEventListener("change", handleMediaChange)
    return () => mediaQuery.removeEventListener("change", handleMediaChange)
  }, [])

  const clearPendingAIPanelClose = useCallback(() => {
    if (aiCloseTimeoutRef.current !== null) {
      window.clearTimeout(aiCloseTimeoutRef.current)
      aiCloseTimeoutRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      clearPendingAIPanelClose()
    }
  }, [clearPendingAIPanelClose])

  const restoreSidebarAfterAutoCollapse = useCallback(() => {
    if (!copilotAutoCollapsedSidebar.current) {
      return
    }

    setSidebarCollapsed(false)
    copilotAutoCollapsedSidebar.current = false
  }, [])

  const hideAIPanelImmediately = useCallback(() => {
    clearPendingAIPanelClose()
    setIsClosingAIPanel(false)
    setIsAIPanelOpen(false)
    restoreSidebarAfterAutoCollapse()
  }, [clearPendingAIPanelClose, restoreSidebarAfterAutoCollapse])

  useEffect(() => {
    if (previousPathnameRef.current !== null && previousPathnameRef.current !== pathname) {
      hideAIPanelImmediately()
    }

    previousPathnameRef.current = pathname
  }, [hideAIPanelImmediately, pathname])

  const closeAIPanel = useCallback(() => {
    if (!isAIPanelOpen) {
      return
    }

    clearPendingAIPanelClose()
    setIsClosingAIPanel(true)
    aiCloseTimeoutRef.current = window.setTimeout(() => {
      setIsAIPanelOpen(false)
      setIsClosingAIPanel(false)
      restoreSidebarAfterAutoCollapse()
      aiCloseTimeoutRef.current = null
    }, 150)
  }, [clearPendingAIPanelClose, isAIPanelOpen, restoreSidebarAfterAutoCollapse])

  const toggleAI = useCallback(() => {
    if (isAIPanelOpen) {
      closeAIPanel()
      return
    }

    clearPendingAIPanelClose()
    clearSelectedIssue()

    setIsClosingAIPanel(false)
    setIsAIPanelOpen(true)
  }, [
    clearPendingAIPanelClose,
    clearSelectedIssue,
    closeAIPanel,
    isAIPanelOpen,
    sidebarCollapsed,
  ])

  const isSettings = activeNav === "settings"
  const pageTitle = getDashboardRouteTitle(activeNav)
  const contextValue = useMemo<DashboardShellContextValue>(() => ({ toggleAI }), [toggleAI])

  return (
    <DashboardShellContext.Provider value={contextValue}>
      <div
        className="flex h-screen overflow-hidden bg-[var(--background)] font-sans"
        data-route-key={activeNav}
        data-testid="dashboard-shell"
      >
        <Sidebar
          active={activeNav}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => {
            copilotAutoCollapsedSidebar.current = false
            setSidebarCollapsed((collapsed) => !collapsed)
          }}
        />

        <div
          className="flex min-w-0 flex-1 flex-col overflow-hidden transition-[margin] duration-200 ease-out"
          data-testid="dashboard-main"
          style={{ marginLeft: sidebarCollapsed ? "var(--sidebar-collapsed)" : "var(--sidebar-width)" }}
        >
          {!isSettings && (
            <Header title={pageTitle}>
              <button
                aria-label="AI Copilot"
                className={`flex h-8 min-h-[32px] shrink-0 items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium transition-all duration-150 active:scale-[0.97] sm:px-3 ${
                  isAIPanelOpen
                    ? "border-[var(--purple)]/30 bg-[var(--purple-dim)] text-[var(--purple)]"
                    : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-primary)] hover:bg-[var(--surface-3)]"
                }`}
                data-active={isAIPanelOpen ? "true" : "false"}
                data-testid="ai-copilot-toggle"
                onClick={toggleAI}
              >
                <Sparkles className="shrink-0" size={11} />
                <span className="hidden whitespace-nowrap sm:inline">AI Copilot</span>
              </button>
            </Header>
          )}

          <div className="relative flex min-h-0 flex-1 overflow-hidden">
            {children}

            {isAIPanelOpen && (
              <div
                className={`relative z-10 flex w-[440px] shrink-0 flex-col overflow-hidden sm:w-[320px] md:w-[380px] ${isClosingAIPanel ? "panel-exit" : "panel-enter"}`}
                data-testid="ai-panel"
                style={{ boxShadow: "var(--shadow-panel)" }}
              >
                <AIPanel onClose={closeAIPanel} />
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardShellContext.Provider>
  )
}

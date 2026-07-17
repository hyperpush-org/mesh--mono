export type Severity = 'critical' | 'high' | 'medium' | 'low'
export type IssueStatus = 'open' | 'ignored' | 'resolved'

export interface StackFrame {
  file: string
  line: number
  col: number
  fn: string
  code: string[]
  highlight: number
  isApp: boolean
}

export interface Breadcrumb {
  time: string
  type: string
  message: string
  level: 'info' | 'warning' | 'error'
}

export interface Issue {
  id: string
  title: string
  subtitle: string
  file: string | null
  severity: Severity
  status: IssueStatus
  count: number
  project: string
  environment: string | null
  firstSeen: string
  lastSeen: string
  assignee?: string
  tags: string[]
  stacktrace: StackFrame[]
  breadcrumbs: Breadcrumb[]
  sdkName: string | null
  sdkVersion: string | null
  sessionId: string | null
}

export interface IssuesOverviewStats {
  totalEvents: number
  openIssues: number
  criticalIssues: number
  eventsPerMin: number
}

export interface IssueEventSeriesPoint {
  time: string
  critical: number
  high: number
  medium: number
  low: number
}

export type AlertStatus = 'firing' | 'acknowledged' | 'resolved'
export type AlertType = 'error-rate' | 'latency' | 'availability' | 'custom'
export type AlertLiveAction = 'acknowledge' | 'resolve'

export interface AlertHistory {
  timestamp: string
  status: AlertStatus
  value: string
}

export interface Alert {
  id: string
  name: string
  description: string
  type: AlertType
  status: AlertStatus
  severity: Severity
  project: string
  environment: string | null
  triggeredAt: string
  lastFired: string
  firedCount: number
  threshold: string | null
  currentValue: string | null
  condition: string
  evaluationWindow: string | null
  history: AlertHistory[]
  ruleName: string
  supportedActions: AlertLiveAction[]
}

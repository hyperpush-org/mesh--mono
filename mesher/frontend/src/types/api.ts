// Dashboard
export interface VolumePoint {
  bucket: string;
  count: number;
}

export interface LevelBreakdown {
  level: string;
  count: number;
}

export interface TopIssue {
  id: string;
  title: string;
  level: string;
  status: string;
  event_count: number;
  last_seen: string;
}

export interface HealthSummary {
  unresolved_count: number;
  events_24h: number;
  new_today: number;
}

export interface TagBreakdown {
  value: string;
  count: number;
}

// Issues
export interface Issue {
  id: string;
  title: string;
  level: string;
  status: string;
  event_count: number;
  first_seen: string;
  last_seen: string;
  assigned_to: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  has_more: boolean;
  next_cursor?: string;
  next_cursor_id?: string;
}

// Events
export interface EventSummary {
  id: string;
  issue_id: string;
  level: string;
  message: string;
  received_at: string;
}

export interface EventTagSummary extends EventSummary {
  tags: Record<string, string>;
}

export interface EventDetail {
  event: {
    id: string;
    project_id: string;
    issue_id: string;
    level: string;
    message: string;
    fingerprint: string;
    exception: unknown;
    stacktrace: unknown;
    breadcrumbs: unknown;
    tags: Record<string, string>;
    extra: unknown;
    user_context: unknown;
    sdk_name: string;
    sdk_version: string;
    received_at: string;
  };
  navigation: {
    next_id: string | null;
    prev_id: string | null;
  };
}

// Alerts
export interface AlertRule {
  id: string;
  project_id: string;
  name: string;
  condition: {
    condition_type: string;
    threshold: number;
    window_minutes: number;
  };
  action: unknown;
  enabled: boolean;
  cooldown_minutes: number;
  last_fired_at: string | null;
  created_at: string;
}

export interface Alert {
  id: string;
  rule_id: string;
  project_id: string;
  status: string;
  message: string;
  condition_snapshot: unknown;
  triggered_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  rule_name: string;
}

// Settings
export interface ProjectSettings {
  retention_days: number;
  sample_rate: number;
}

export interface ProjectStorage {
  event_count: number;
  estimated_bytes: number;
}

// Team / API Keys
export interface Member {
  id: string;
  user_id: string;
  email: string;
  display_name: string;
  role: string;
  joined_at: string;
}

export interface ApiKey {
  id: string;
  project_id: string;
  key_value: string;
  label: string;
  created_at: string;
  revoked_at: string | null;
}

// WebSocket messages
export type WsMessage =
  | { type: "event"; issue_id: string; data: unknown }
  | { type: "issue"; action: string; issue_id: string }
  | { type: "issue_count"; project_id: string; count: number }
  | {
      type: "alert";
      alert_id: string;
      rule_name: string;
      condition: string;
      message: string;
    }
  | { type: "filters_updated" }
  | { type: "error"; message: string };

// Action responses
export interface ActionResponse {
  status: string;
  affected: number;
}

// Filter params for query string building
export interface IssueFilterParams {
  status?: string;
  level?: string;
  assigned_to?: string;
  cursor?: string;
  cursor_id?: string;
  limit?: number;
}

export interface EventFilterParams {
  q?: string;
  key?: string;
  value?: string;
  cursor?: string;
  cursor_id?: string;
  limit?: number;
}

import type {
  ActionResponse,
  Alert,
  AlertRule,
  ApiKey,
  EventDetail,
  EventSummary,
  EventTagSummary,
  HealthSummary,
  Issue,
  IssueFilterParams,
  LevelBreakdown,
  Member,
  PaginatedResponse,
  ProjectSettings,
  ProjectStorage,
  TagBreakdown,
  TopIssue,
  VolumePoint,
} from "@/types/api";

const API_BASE = "/api/v1";

function toQueryString(params?: Record<string, unknown>): string {
  if (!params) return "";
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== ""
  );
  if (entries.length === 0) return "";
  return entries
    .map(
      ([k, v]) =>
        `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`
    )
    .join("&");
}

async function fetchApi<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(
      (err as { error?: string }).error || res.statusText
    );
  }
  return res.json() as Promise<T>;
}

function postJson<T>(path: string, body?: unknown): Promise<T> {
  return fetchApi<T>(path, {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
  });
}

export const api = {
  dashboard: {
    volume: (projectId: string, bucket = "hour") =>
      fetchApi<VolumePoint[]>(
        `/projects/${projectId}/dashboard/volume?bucket=${bucket}`
      ),
    levels: (projectId: string) =>
      fetchApi<LevelBreakdown[]>(
        `/projects/${projectId}/dashboard/levels`
      ),
    topIssues: (projectId: string, limit = 10) =>
      fetchApi<TopIssue[]>(
        `/projects/${projectId}/dashboard/top-issues?limit=${limit}`
      ),
    health: (projectId: string) =>
      fetchApi<HealthSummary>(
        `/projects/${projectId}/dashboard/health`
      ),
    tags: (projectId: string, key: string) =>
      fetchApi<TagBreakdown[]>(
        `/projects/${projectId}/dashboard/tags?key=${encodeURIComponent(key)}`
      ),
  },

  issues: {
    list: (projectId: string, params?: IssueFilterParams) => {
      const qs = toQueryString(params as Record<string, unknown>);
      return fetchApi<PaginatedResponse<Issue>>(
        `/projects/${projectId}/issues${qs ? `?${qs}` : ""}`
      );
    },
    events: (
      issueId: string,
      params?: { cursor?: string; cursor_id?: string; limit?: number }
    ) => {
      const qs = toQueryString(params as Record<string, unknown>);
      return fetchApi<PaginatedResponse<EventSummary>>(
        `/issues/${issueId}/events${qs ? `?${qs}` : ""}`
      );
    },
    timeline: (issueId: string, limit = 50) =>
      fetchApi<EventSummary[]>(
        `/issues/${issueId}/timeline?limit=${limit}`
      ),
    resolve: (issueId: string) =>
      postJson<ActionResponse>(`/issues/${issueId}/resolve`),
    archive: (issueId: string) =>
      postJson<ActionResponse>(`/issues/${issueId}/archive`),
    unresolve: (issueId: string) =>
      postJson<ActionResponse>(`/issues/${issueId}/unresolve`),
    assign: (issueId: string, userId: string) =>
      postJson<{ status: string }>(`/issues/${issueId}/assign`, {
        user_id: userId,
      }),
    discard: (issueId: string) =>
      postJson<ActionResponse>(`/issues/${issueId}/discard`),
    delete: (issueId: string) =>
      postJson<ActionResponse>(`/issues/${issueId}/delete`),
  },

  events: {
    search: (projectId: string, q: string, limit = 25) =>
      fetchApi<EventSummary[]>(
        `/projects/${projectId}/events/search?q=${encodeURIComponent(q)}&limit=${limit}`
      ),
    byTag: (
      projectId: string,
      key: string,
      value: string,
      limit = 25
    ) =>
      fetchApi<EventTagSummary[]>(
        `/projects/${projectId}/events/tags?key=${encodeURIComponent(key)}&value=${encodeURIComponent(value)}&limit=${limit}`
      ),
    detail: (eventId: string) =>
      fetchApi<EventDetail>(`/events/${eventId}`),
  },

  alerts: {
    rules: (projectId: string) =>
      fetchApi<AlertRule[]>(
        `/projects/${projectId}/alert-rules`
      ),
    createRule: (projectId: string, rule: Omit<AlertRule, "id" | "project_id" | "last_fired_at" | "created_at">) =>
      postJson<{ id: string }>(
        `/projects/${projectId}/alert-rules`,
        rule
      ),
    toggleRule: (ruleId: string, enabled: boolean) =>
      postJson<ActionResponse>(`/alert-rules/${ruleId}/toggle`, {
        enabled,
      }),
    deleteRule: (ruleId: string) =>
      postJson<ActionResponse>(`/alert-rules/${ruleId}/delete`),
    list: (projectId: string, status?: string) => {
      const qs = status ? `?status=${encodeURIComponent(status)}` : "";
      return fetchApi<Alert[]>(
        `/projects/${projectId}/alerts${qs}`
      );
    },
    acknowledge: (alertId: string) =>
      postJson<ActionResponse>(`/alerts/${alertId}/acknowledge`),
    resolve: (alertId: string) =>
      postJson<ActionResponse>(`/alerts/${alertId}/resolve`),
  },

  team: {
    members: (orgId: string) =>
      fetchApi<Member[]>(`/orgs/${orgId}/members`),
    addMember: (orgId: string, userId: string, role?: string) =>
      postJson<{ id: string }>(`/orgs/${orgId}/members`, {
        user_id: userId,
        role,
      }),
    updateRole: (orgId: string, membershipId: string, role: string) =>
      postJson<ActionResponse>(
        `/orgs/${orgId}/members/${membershipId}/role`,
        { role }
      ),
    removeMember: (orgId: string, membershipId: string) =>
      postJson<ActionResponse>(
        `/orgs/${orgId}/members/${membershipId}/remove`
      ),
    apiKeys: (projectId: string) =>
      fetchApi<ApiKey[]>(`/projects/${projectId}/api-keys`),
    createKey: (projectId: string, label?: string) =>
      postJson<{ key_value: string }>(
        `/projects/${projectId}/api-keys`,
        { label }
      ),
    revokeKey: (keyId: string) =>
      postJson<ActionResponse>(`/api-keys/${keyId}/revoke`),
  },

  settings: {
    get: (projectId: string) =>
      fetchApi<ProjectSettings>(
        `/projects/${projectId}/settings`
      ),
    update: (projectId: string, settings: Partial<ProjectSettings>) =>
      postJson<ActionResponse>(
        `/projects/${projectId}/settings`,
        settings
      ),
    storage: (projectId: string) =>
      fetchApi<ProjectStorage>(
        `/projects/${projectId}/storage`
      ),
  },
};

"use client"

import { useState, type ElementType, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useSettingsLiveState } from '@/components/dashboard/settings/settings-live-state'
import {
  Settings as SettingsIcon,
  Users,
  GitBranch,
  Key,
  AlertTriangle,
  CreditCard,
  Shield,
  Bell,
  User,
  RefreshCw,
  Check,
  X,
  Plus,
  Trash2,
  Copy,
  ChevronDown,
  Monitor,
  Zap,
  Database,
  PlugZap,
} from 'lucide-react'

type SettingsLiveState = ReturnType<typeof useSettingsLiveState>

type SettingsTab =
  | 'general'
  | 'team'
  | 'integrations'
  | 'api-keys'
  | 'alerts'
  | 'billing'
  | 'security'
  | 'notifications'
  | 'profile'

const NAV_GROUPS: Array<{
  label: string
  items: Array<{ id: SettingsTab; label: string; icon: ElementType }>
}> = [
  {
    label: 'Project',
    items: [
      { id: 'general', label: 'General', icon: SettingsIcon },
      { id: 'team', label: 'Team', icon: Users },
      { id: 'integrations', label: 'Integrations', icon: GitBranch },
      { id: 'api-keys', label: 'API Keys', icon: Key },
      { id: 'alerts', label: 'Alerts', icon: AlertTriangle },
      { id: 'billing', label: 'Billing', icon: CreditCard },
    ],
  },
  {
    label: 'Account',
    items: [
      { id: 'security', label: 'Security', icon: Shield },
      { id: 'notifications', label: 'Notifications', icon: Bell },
      { id: 'profile', label: 'Profile', icon: User },
    ],
  },
]

const PROJECT_CONFIG = {
  name: 'hyperpush-web',
  description: 'Main web application for production error tracking',
  defaultEnvironment: 'production',
  publicDashboard: true,
  allowAnonymousIssues: false,
}

const INTEGRATIONS = [
  { id: 'github', name: 'GitHub', icon: GitBranch, connected: true, detail: 'hyperpush/web · main' },
  { id: 'slack', name: 'Slack', icon: Bell, connected: true, detail: '#alerts' },
]

const BILLING_INFO = {
  plan: 'Pro',
  monthlyPrice: 29,
  nextBillingDate: 'May 10, 2026',
  eventsIncluded: 100000,
  eventsUsed: 67842,
  aiAnalysisUsed: 18,
  aiAnalysisIncluded: 30,
}

const NOTIF_PREFS = {
  email: true,
  slack: true,
  critical: true,
  high: true,
  medium: false,
  low: false,
}

const USER_PROFILE = {
  name: 'Alex Kim',
  email: 'alex@hyperpush.dev',
  username: 'alex.kim',
  avatar: 'AK',
}

const ACTIVE_SESSIONS = [
  { id: '1', device: 'Chrome on macOS', location: 'San Francisco, CA', ip: '192.168.1.1', lastActive: 'Active now', current: true },
  { id: '2', device: 'Safari on iOS', location: 'San Francisco, CA', ip: '192.168.1.2', lastActive: '2h ago', current: false },
]

const iCls =
  'h-9 px-3 rounded-md bg-[var(--surface-2)] border border-[var(--line)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--green)]/40 focus:ring-1 focus:ring-[var(--green)]/20 transition-all disabled:cursor-not-allowed disabled:opacity-60'
const sCls = `${iCls} appearance-none cursor-pointer pr-8`

const SVCOLS: Record<string, string> = {
  critical: 'text-[var(--red)] bg-[var(--red)]/[0.10]',
  high: 'text-[var(--yellow)] bg-[var(--yellow)]/[0.10]',
  medium: 'text-[var(--blue)] bg-[var(--blue)]/[0.08]',
  low: 'text-[var(--text-secondary)] bg-[var(--surface-3)]',
}

const ROLCOLS: Record<string, string> = {
  owner: 'text-[var(--green)] bg-[var(--green)]/[0.08]',
  admin: 'text-[var(--blue)] bg-[var(--blue)]/[0.08]',
  member: 'text-[var(--yellow)] bg-[var(--yellow)]/[0.08]',
  developer: 'text-[var(--yellow)] bg-[var(--yellow)]/[0.08]',
  viewer: 'text-[var(--text-secondary)] bg-[var(--surface-3)]',
}

function tabSupportLabel(tab: SettingsTab) {
  if (tab === 'general') {
    return 'mixed live'
  }
  if (tab === 'team' || tab === 'api-keys' || tab === 'alerts') {
    return 'live'
  }
  return 'mock-only'
}

function Toggle({
  checked,
  defaultChecked,
  onCheckedChange,
  disabled,
}: {
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (next: boolean) => void
  disabled?: boolean
}) {
  const [internal, setInternal] = useState(defaultChecked ?? false)
  const value = checked ?? internal

  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      disabled={disabled}
      onClick={() => {
        const next = !value
        if (checked === undefined) {
          setInternal(next)
        }
        onCheckedChange?.(next)
      }}
      className={cn(
        'relative inline-flex h-[20px] w-[36px] shrink-0 rounded-full transition-colors duration-200 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60',
        value ? 'bg-[var(--green)]' : 'bg-[var(--surface-3)] border border-[var(--line)]',
      )}
    >
      <span
        className={cn(
          'mt-[2px] block h-[16px] w-[16px] rounded-full bg-white shadow-sm transition-transform duration-200',
          value ? 'translate-x-[18px]' : 'translate-x-[2px]',
        )}
      />
    </button>
  )
}

function SelectWrap({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      {children}
      <ChevronDown size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
    </div>
  )
}

function PageTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-1 border-b border-[var(--line)] pb-5">
      <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-[var(--text-primary)]">{title}</h2>
      <p className="mt-1 text-[12.5px] text-[var(--text-tertiary)]">{subtitle}</p>
    </div>
  )
}

function SectionHead({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 pb-1 pt-8 first:pt-0">
      <span className="shrink-0 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[var(--text-faint)]">
        {title}
      </span>
      <div className="h-px flex-1 bg-[var(--line)]" />
      {action}
    </div>
  )
}

function SettingRow({
  label,
  description,
  children,
  last,
}: {
  label: string
  description?: string
  children: ReactNode
  last?: boolean
}) {
  return (
    <div className={cn('flex items-center justify-between gap-8 py-3.5', !last && 'border-b border-[var(--line)]')}>
      <div className="min-w-0">
        <p className="text-[13px] font-medium leading-snug text-[var(--text-primary)]">{label}</p>
        {description ? <p className="mt-0.5 text-[11.5px] leading-snug text-[var(--text-tertiary)]">{description}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function InputRow({
  label,
  description,
  children,
  last,
}: {
  label: string
  description?: string
  children: ReactNode
  last?: boolean
}) {
  return (
    <div className={cn('py-3.5', !last && 'border-b border-[var(--line)]')}>
      <p className="mb-0.5 text-[13px] font-medium text-[var(--text-primary)]">{label}</p>
      {description ? <p className="mb-2.5 text-[11.5px] text-[var(--text-tertiary)]">{description}</p> : <div className="mb-2" />}
      {children}
    </div>
  )
}

function Row({ children, last }: { children: ReactNode; last?: boolean }) {
  return <div className={cn('flex items-center py-3', !last && 'border-b border-[var(--line)]')}>{children}</div>
}

function SourceBadge({
  label,
  tone = 'neutral',
  testId,
}: {
  label: string
  tone?: 'neutral' | 'live' | 'mixed' | 'mock' | 'error'
  testId?: string
}) {
  const toneClass =
    tone === 'live'
      ? 'bg-[var(--green)]/[0.10] text-[var(--green)]'
      : tone === 'mixed'
        ? 'bg-[var(--blue)]/[0.10] text-[var(--blue)]'
        : tone === 'mock'
          ? 'bg-[var(--surface-3)] text-[var(--text-secondary)]'
          : tone === 'error'
            ? 'bg-[var(--red)]/[0.10] text-[var(--red)]'
            : 'bg-[var(--surface-2)] text-[var(--text-secondary)]'

  return (
    <span
      data-testid={testId}
      className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]', toneClass)}
    >
      {label}
    </span>
  )
}

function StatusBanner({
  icon: Icon,
  title,
  description,
  tone = 'neutral',
  testId,
}: {
  icon: ElementType
  title: string
  description: string
  tone?: 'neutral' | 'live' | 'mixed' | 'mock' | 'error'
  testId?: string
}) {
  const toneClass =
    tone === 'live'
      ? 'border-[var(--green)]/20 bg-[var(--green)]/[0.06]'
      : tone === 'mixed'
        ? 'border-[var(--blue)]/20 bg-[var(--blue)]/[0.06]'
        : tone === 'mock'
          ? 'border-[var(--line)] bg-[var(--surface-2)]'
          : tone === 'error'
            ? 'border-[var(--red)]/20 bg-[var(--red)]/[0.06]'
            : 'border-[var(--line)] bg-[var(--surface-2)]'

  return (
    <div data-testid={testId} className={cn('mt-4 flex items-start gap-2.5 rounded-lg border px-3 py-2.5', toneClass)}>
      <Icon size={13} className="mt-0.5 shrink-0 text-[var(--text-tertiary)]" />
      <div>
        <p className="text-[12px] font-medium text-[var(--text-primary)]">{title}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-tertiary)]">{description}</p>
      </div>
    </div>
  )
}

function SectionErrorCallout({
  prefix,
  code,
  path,
  testId,
}: {
  prefix: string
  code: string
  path: string
  testId: string
}) {
  return (
    <p data-testid={testId} className="mt-2 text-[11px] text-[var(--red)]">
      {prefix} ({code}) via {path}
    </p>
  )
}

function MockOnlyWrap({ children, note, testId }: { children: ReactNode; note: string; testId?: string }) {
  return (
    <div data-testid={testId}>
      <StatusBanner
        icon={PlugZap}
        title="Mock-only shell"
        description={note}
        tone="mock"
        testId={testId ? `${testId}-banner` : undefined}
      />
      <fieldset disabled className="mt-2 space-y-0 opacity-75">
        {children}
      </fieldset>
    </div>
  )
}

function Btn({
  children,
  icon: Icon,
  onClick,
  ghost,
  danger,
  small,
  disabled,
  type = 'button',
  testId,
}: {
  children: ReactNode
  icon?: ElementType
  onClick?: () => void
  ghost?: boolean
  danger?: boolean
  small?: boolean
  disabled?: boolean
  type?: 'button' | 'submit'
  testId?: string
}) {
  return (
    <button
      data-testid={testId}
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md font-medium transition-all duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60',
        small ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5 text-[11px]',
        danger
          ? 'bg-[var(--red)]/[0.10] text-[var(--red)] hover:bg-[var(--red)]/[0.18]'
          : ghost
            ? 'border border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            : 'bg-[var(--green)]/[0.10] text-[var(--green)] hover:bg-[var(--green)]/[0.18]',
      )}
    >
      {Icon ? <Icon size={11} /> : null}
      {children}
    </button>
  )
}

function SevBadge({ s }: { s: string }) {
  return (
    <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide', SVCOLS[s] || SVCOLS.low)}>
      {s}
    </span>
  )
}

function RoleBadge({ r }: { r: string }) {
  return (
    <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide', ROLCOLS[r] || ROLCOLS.viewer)}>
      {r}
    </span>
  )
}

function ProgressBar({ value, max, color = 'var(--green)' }: { value: number; max: number; color?: string }) {
  return (
    <div className="h-1 overflow-hidden rounded-full bg-[var(--surface-3)]">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min((value / max) * 100, 100)}%`, backgroundColor: color }} />
    </div>
  )
}

function copyText(value: string) {
  return navigator.clipboard.writeText(value).catch(() => undefined)
}

function MixedLiveHeader({ tab, live }: { tab: SettingsTab; live: SettingsLiveState }) {
  const support = tabSupportLabel(tab)
  const summary =
    support === 'mock-only'
      ? 'No backend write route yet — the shell stays visible but non-live.'
      : support === 'mixed live'
        ? 'General mixes live retention/storage reads with clearly mock-only controls.'
        : 'This tab uses same-origin /api/v1 reads and writes where the backend already exists.'

  return (
    <div className="flex items-center gap-2">
      <SourceBadge
        label={support}
        tone={support === 'live' ? 'live' : support === 'mixed live' ? 'mixed' : 'mock'}
        testId="settings-shell-support-badge"
      />
      <span className="max-w-[340px] text-right text-[11px] text-[var(--text-faint)]">{summary}</span>
    </div>
  )
}

export function SettingsPage() {
  const [tab, setTab] = useState<SettingsTab>('general')
  const live = useSettingsLiveState()

  return (
    <div
      data-testid="settings-shell"
      data-current-tab={tab}
      data-shell-state={live.shellState}
      data-shell-source={live.shellSource}
      data-general-state={live.general.state}
      data-general-source={live.general.source}
      data-api-keys-state={live.apiKeys.state}
      data-api-keys-source={live.apiKeys.source}
      data-team-state={live.team.state}
      data-team-source={live.team.source}
      data-alert-rules-state={live.alertRules.state}
      data-alert-rules-source={live.alertRules.source}
      data-last-mutation-section={live.lastMutationSection}
      data-last-mutation-action={live.lastMutationAction ?? 'none'}
      data-last-mutation-phase={live.lastMutationPhase}
      data-last-mutation-error-code={live.lastMutationError?.code ?? 'none'}
      className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-[var(--surface)]"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--line)] px-6" style={{ height: 'var(--header-height)' }}>
        <div className="flex items-center gap-2.5">
          <SettingsIcon size={14} className="text-[var(--text-tertiary)]" />
          <span className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">Settings</span>
        </div>
        <MixedLiveHeader tab={tab} live={live} />
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <nav className="w-48 shrink-0 overflow-y-auto border-r border-[var(--line)] py-4">
          {NAV_GROUPS.map((group, groupIndex) => (
            <div key={group.label} className={cn(groupIndex > 0 && 'mt-5 border-t border-[var(--line)] pt-5')}>
              <p className="px-4 pb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-faint)]">{group.label}</p>
              {group.items.map((item) => {
                const active = tab === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTab(item.id)}
                    className={cn(
                      'relative flex w-full items-center gap-2.5 px-4 py-[6px] text-[12.5px] font-medium transition-colors duration-100',
                      active ? 'text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]',
                    )}
                  >
                    {active ? <span className="absolute bottom-0.5 left-0 top-0.5 w-[2px] rounded-r-sm bg-[var(--green)]" /> : null}
                    <item.icon size={13} className={active ? 'text-[var(--green)]' : ''} />
                    {item.label}
                    <span className="ml-auto">
                      <SourceBadge
                        label={tabSupportLabel(item.id)}
                        tone={
                          tabSupportLabel(item.id) === 'live'
                            ? 'live'
                            : tabSupportLabel(item.id) === 'mixed live'
                              ? 'mixed'
                              : 'mock'
                        }
                      />
                    </span>
                  </button>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-8 py-7">
            {tab === 'general' ? <GeneralTab live={live} /> : null}
            {tab === 'api-keys' ? <APIKeysTab live={live} /> : null}
            {tab === 'alerts' ? <AlertRulesTab live={live} /> : null}
            {tab === 'team' ? <TeamTab live={live} /> : null}
            {tab === 'integrations' ? <IntegrationsTab /> : null}
            {tab === 'billing' ? <BillingTab /> : null}
            {tab === 'security' ? <SecurityTab /> : null}
            {tab === 'notifications' ? <NotificationsTab /> : null}
            {tab === 'profile' ? <ProfileTab /> : null}
          </div>
        </div>
      </div>
    </div>
  )
}

function GeneralTab({ live }: { live: SettingsLiveState }) {
  const general = live.general
  const statusTone = general.state === 'failed' ? 'error' : general.state === 'ready' ? 'mixed' : 'neutral'

  return (
    <div
      data-testid="settings-general-panel"
      data-state={general.state}
      data-source={general.source}
      data-mutation-phase={general.mutationPhase}
      data-mutation-error-code={general.mutationError?.code ?? 'none'}
    >
      <PageTitle title="General" subtitle="Live retention and storage controls where Mesher already has routes, with the rest of the shell kept honest." />

      <StatusBanner
        icon={Database}
        tone={statusTone}
        testId="settings-general-status-banner"
        title={
          general.state === 'failed'
            ? 'General live reads failed'
            : general.state === 'ready'
              ? 'Live retention and storage active'
              : 'Loading same-origin settings and storage'
        }
        description={
          general.state === 'failed'
            ? 'The shell stayed mounted, but this subsection is explicitly marked failed instead of pretending the old fake save loop worked.'
            : general.state === 'ready'
              ? 'Retention days, sample rate, and storage metrics come from /api/v1/projects/default/settings and /storage. Project identity controls remain mock-only for now.'
              : 'Bootstrap reads for settings and storage run in parallel so the rest of the shell does not block.'
        }
      />
      {general.error ? (
        <SectionErrorCallout
          prefix="Last live general read failed"
          code={general.error.code}
          path={general.error.path}
          testId="settings-general-error"
        />
      ) : null}
      {general.mutationError ? (
        <SectionErrorCallout
          prefix="Last live general write failed"
          code={general.mutationError.code}
          path={general.mutationError.path}
          testId="settings-general-mutation-error"
        />
      ) : null}

      <SectionHead title="Live data handling" action={<SourceBadge label={general.source} tone={statusTone} testId="settings-general-source-badge" />} />

      <InputRow label="Retention days" description="Writes to the real project settings route via same-origin /api/v1.">
        <div className="flex items-center gap-2">
          <input
            data-testid="settings-retention-days-input"
            type="number"
            min={1}
            step={1}
            value={general.form.retentionDays}
            onChange={(event) => general.setRetentionDays(event.target.value)}
            className={cn(iCls, 'w-32')}
            disabled={general.isPending}
          />
          <Btn testId="settings-general-refresh" ghost icon={RefreshCw} onClick={() => void general.refresh({ preserveStateOnFailure: true })} disabled={general.isPending}>
            Refresh
          </Btn>
          <Btn testId="settings-general-save" icon={general.isPending ? RefreshCw : Check} onClick={() => void general.save()} disabled={general.isPending}>
            {general.isPending ? 'Saving…' : 'Save live settings'}
          </Btn>
        </div>
        {general.formErrors.retentionDays ? <p data-testid="settings-retention-days-error" className="mt-2 text-[11px] text-[var(--red)]">{general.formErrors.retentionDays}</p> : null}
      </InputRow>

      <InputRow label="Sample rate (%)" description="The backend stores sample_rate as a 0–1 float; this shell edits the truthful percentage view." last>
        <div className="flex items-center gap-2">
          <input
            data-testid="settings-sample-rate-input"
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={general.form.sampleRatePercent}
            onChange={(event) => general.setSampleRatePercent(event.target.value)}
            className={cn(iCls, 'w-32')}
            disabled={general.isPending}
          />
          <span className="text-[11px] text-[var(--text-faint)]">raw sample_rate: {general.snapshot?.sampleRate ?? '—'}</span>
        </div>
        {general.formErrors.sampleRatePercent ? <p data-testid="settings-sample-rate-error" className="mt-2 text-[11px] text-[var(--red)]">{general.formErrors.sampleRatePercent}</p> : null}
      </InputRow>

      <SectionHead title="Live storage" action={<SourceBadge label={general.snapshot ? 'live' : 'pending'} tone={general.snapshot ? 'live' : 'neutral'} />} />

      <div className="grid grid-cols-2 gap-3 border-b border-[var(--line)] py-4">
        <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-4">
          <p className="text-[10.5px] uppercase tracking-[0.08em] text-[var(--text-faint)]">Stored events</p>
          <p data-testid="settings-storage-event-count" className="mt-1 text-[22px] font-bold tracking-tight text-[var(--text-primary)]">
            {general.snapshot?.storageEventCount.toLocaleString() ?? '—'}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-4">
          <p className="text-[10.5px] uppercase tracking-[0.08em] text-[var(--text-faint)]">Estimated storage</p>
          <p data-testid="settings-storage-estimated-bytes" className="mt-1 text-[22px] font-bold tracking-tight text-[var(--text-primary)]">
            {general.snapshot?.storageEstimatedBytesLabel ?? '—'}
          </p>
        </div>
      </div>

      <SectionHead title="Still mock-only" />
      <MockOnlyWrap testId="settings-general-mock-only" note="Project identity, visibility, and default environment controls stay visible here, but no backend route exists yet so there is no global save illusion anymore.">
        <InputRow label="Project name" description="Displayed in the dashboard and integrations">
          <input type="text" defaultValue={PROJECT_CONFIG.name} className={cn(iCls, 'w-full')} />
        </InputRow>
        <InputRow label="Description" description="Brief summary shown in exports and reports">
          <textarea defaultValue={PROJECT_CONFIG.description} rows={3} className={cn(iCls, 'h-auto w-full resize-none py-2 leading-relaxed')} />
        </InputRow>
        <SettingRow label="Default environment" description="Pre-selected when opening the dashboard.">
          <SelectWrap>
            <select defaultValue={PROJECT_CONFIG.defaultEnvironment} className={cn(sCls, 'w-40')}>
              <option value="production">Production</option>
              <option value="staging">Staging</option>
              <option value="development">Development</option>
            </select>
          </SelectWrap>
        </SettingRow>
        <SettingRow label="Public dashboard" description="Anyone with the link can view your dashboard.">
          <Toggle defaultChecked={PROJECT_CONFIG.publicDashboard} />
        </SettingRow>
        <SettingRow label="Anonymous issue submission" description="Allow users without accounts to report issues via the SDK." last>
          <Toggle defaultChecked={PROJECT_CONFIG.allowAnonymousIssues} />
        </SettingRow>
      </MockOnlyWrap>
    </div>
  )
}

function APIKeysTab({ live }: { live: SettingsLiveState }) {
  const apiKeys = live.apiKeys
  const statusTone = apiKeys.state === 'failed' ? 'error' : apiKeys.state === 'ready' ? 'live' : 'neutral'
  const keys = apiKeys.snapshot?.items ?? []

  return (
    <div
      data-testid="settings-api-keys-panel"
      data-state={apiKeys.state}
      data-source={apiKeys.source}
      data-mutation-phase={apiKeys.mutationPhase}
      data-mutation-error-code={apiKeys.mutationError?.code ?? 'none'}
      data-active-count={apiKeys.snapshot?.activeCount ?? 0}
      data-revoked-count={apiKeys.snapshot?.revokedCount ?? 0}
    >
      <PageTitle title="API Keys" subtitle="Real key list/create/revoke flows backed by Mesher, with one-time reveal staying local to this session." />

      <StatusBanner
        icon={Key}
        tone={statusTone}
        testId="settings-api-keys-status-banner"
        title={
          apiKeys.state === 'failed'
            ? 'API key reads failed'
            : apiKeys.state === 'ready'
              ? 'Live API keys active'
              : 'Loading same-origin API keys'
        }
        description={
          apiKeys.state === 'failed'
            ? 'The list stayed mounted, but key management is explicitly failed instead of faking a successful save.'
            : apiKeys.state === 'ready'
              ? 'Keys list, create, and revoke all go through same-origin /api/v1 routes. Newly created secrets appear once here and never in the list.'
              : 'The keys list is bootstrapping independently so the rest of Settings stays usable.'
        }
      />
      {apiKeys.error ? <SectionErrorCallout prefix="Last live key read failed" code={apiKeys.error.code} path={apiKeys.error.path} testId="settings-api-keys-error" /> : null}
      {apiKeys.mutationError ? <SectionErrorCallout prefix="Last live key write failed" code={apiKeys.mutationError.code} path={apiKeys.mutationError.path} testId="settings-api-keys-mutation-error" /> : null}

      {apiKeys.reveal ? (
        <div data-testid="settings-api-key-reveal" className="mt-4 rounded-lg border border-[var(--green)]/20 bg-[var(--green)]/[0.06] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[12px] font-medium text-[var(--text-primary)]">New key created</p>
              <p className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">Copy this secret now. The shell will not reveal it again after you dismiss or reload.</p>
            </div>
            <Btn ghost small icon={X} onClick={apiKeys.dismissReveal} testId="settings-api-key-reveal-dismiss">
              Dismiss
            </Btn>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2">
            <code data-testid="settings-api-key-reveal-secret" className="flex-1 break-all text-[11px] text-[var(--text-primary)]">
              {apiKeys.reveal.keyValue}
            </code>
            <Btn ghost small icon={Copy} onClick={() => void copyText(apiKeys.reveal?.keyValue ?? '')} testId="settings-api-key-reveal-copy">
              Copy
            </Btn>
          </div>
        </div>
      ) : null}

      {apiKeys.createFormOpen ? (
        <div data-testid="settings-api-key-create-form" className="mt-6 border-b border-[var(--line)] pb-6">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-[13px] font-semibold text-[var(--text-primary)]">Create live API key</p>
            <button type="button" onClick={() => apiKeys.setCreateFormOpen(false)} className="rounded p-1 text-[var(--text-faint)] hover:text-[var(--text-secondary)] transition-colors">
              <X size={13} />
            </button>
          </div>
          <InputRow label="Label" description="Stored by the backend and shown in the live key list." last>
            <input
              data-testid="settings-api-key-label-input"
              type="text"
              placeholder="e.g. Production App"
              value={apiKeys.createLabel}
              onChange={(event) => apiKeys.setCreateLabel(event.target.value)}
              className={cn(iCls, 'w-full')}
              disabled={apiKeys.isPending}
            />
            {apiKeys.createError ? <p data-testid="settings-api-key-label-error" className="mt-2 text-[11px] text-[var(--red)]">{apiKeys.createError}</p> : null}
          </InputRow>
          <div className="mt-3 flex gap-2">
            <Btn testId="settings-api-key-submit" icon={apiKeys.isPending ? RefreshCw : Plus} onClick={() => void apiKeys.create()} disabled={apiKeys.isPending}>
              {apiKeys.isPending ? 'Creating…' : 'Create live key'}
            </Btn>
            <Btn ghost onClick={() => apiKeys.setCreateFormOpen(false)} disabled={apiKeys.isPending}>Cancel</Btn>
          </div>
        </div>
      ) : null}

      <SectionHead title={`Keys · ${keys.length}`} action={!apiKeys.createFormOpen ? <Btn testId="settings-api-keys-open-create" icon={Plus} onClick={() => apiKeys.setCreateFormOpen(true)}>Create</Btn> : undefined} />

      {keys.length === 0 ? (
        <div data-testid="settings-api-keys-empty" className="rounded-lg border border-dashed border-[var(--line)] px-4 py-8 text-center text-[12px] text-[var(--text-faint)]">
          No live API keys found.
        </div>
      ) : (
        keys.map((key, index) => (
          <Row key={key.id} last={index === keys.length - 1}>
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--surface-2)]">
              <Key size={12} className="text-[var(--text-faint)]" />
            </div>
            <div className="mx-3 min-w-0 flex-1" data-testid={`settings-api-key-row-${key.id}`}>
              <div className="flex items-center gap-2">
                <p className="text-[13px] font-medium text-[var(--text-primary)]">{key.label}</p>
                <SourceBadge label={key.status} tone={key.status === 'active' ? 'live' : 'mock'} />
              </div>
              <p className="font-mono text-[10.5px] text-[var(--text-faint)]">{key.maskedValue}</p>
            </div>
            <span className="mr-3 hidden text-[11px] text-[var(--text-faint)] sm:block">{key.createdAtLabel}</span>
            <Btn
              testId={`settings-api-key-revoke-${key.id}`}
              ghost
              danger={key.status === 'active'}
              icon={Trash2}
              onClick={() => void apiKeys.revoke(key.id)}
              disabled={key.status === 'revoked' || apiKeys.isPending}
            >
              {key.status === 'revoked' ? 'Revoked' : 'Revoke'}
            </Btn>
          </Row>
        ))
      )}
    </div>
  )
}

function AlertRulesTab({ live }: { live: SettingsLiveState }) {
  const alertRules = live.alertRules
  const rules = alertRules.snapshot?.items ?? []
  const statusTone = alertRules.state === 'failed' ? 'error' : alertRules.state === 'ready' ? 'live' : 'neutral'

  return (
    <div
      data-testid="settings-alert-rules-panel"
      data-state={alertRules.state}
      data-source={alertRules.source}
      data-mutation-phase={alertRules.mutationPhase}
      data-mutation-error-code={alertRules.mutationError?.code ?? 'none'}
      data-active-count={alertRules.snapshot?.activeCount ?? 0}
      data-disabled-count={alertRules.snapshot?.disabledCount ?? 0}
    >
      <PageTitle title="Alerts" subtitle="Real alert-rule reads and writes are live here; notification channels stay visibly non-live until those routes exist." />

      <StatusBanner
        icon={AlertTriangle}
        tone={statusTone}
        testId="settings-alert-rules-status-banner"
        title={
          alertRules.state === 'failed'
            ? 'Alert-rule reads failed'
            : alertRules.state === 'ready'
              ? 'Live alert rules active'
              : 'Loading same-origin alert rules'
        }
        description={
          alertRules.state === 'failed'
            ? 'The rules list stays mounted with explicit failure markers instead of falling back to fake channels or pretend saves.'
            : alertRules.state === 'ready'
              ? 'Rules list, create, toggle, and delete all use same-origin /api/v1 routes. Notification-channel controls stay shell-only and clearly marked.'
              : 'Rules bootstrap is independent so General and API keys can stay usable if this section stalls.'
        }
      />
      {alertRules.error ? <SectionErrorCallout prefix="Last live rule read failed" code={alertRules.error.code} path={alertRules.error.path} testId="settings-alert-rules-error" /> : null}
      {alertRules.mutationError ? <SectionErrorCallout prefix="Last live rule write failed" code={alertRules.mutationError.code} path={alertRules.mutationError.path} testId="settings-alert-rules-mutation-error" /> : null}

      {alertRules.createFormOpen ? (
        <div data-testid="settings-alert-rule-create-form" className="mt-6 border-b border-[var(--line)] pb-6">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-[13px] font-semibold text-[var(--text-primary)]">Create live alert rule</p>
            <button type="button" onClick={() => alertRules.setCreateFormOpen(false)} className="rounded p-1 text-[var(--text-faint)] hover:text-[var(--text-secondary)] transition-colors">
              <X size={13} />
            </button>
          </div>
          <InputRow label="Rule name" description="Stored as-is by the backend.">
            <input
              data-testid="settings-alert-rule-name-input"
              type="text"
              value={alertRules.createName}
              onChange={(event) => alertRules.setCreateName(event.target.value)}
              className={cn(iCls, 'w-full')}
              disabled={alertRules.isPending}
            />
            {alertRules.createErrors.name ? <p data-testid="settings-alert-rule-name-error" className="mt-2 text-[11px] text-[var(--red)]">{alertRules.createErrors.name}</p> : null}
          </InputRow>
          <InputRow label="Condition JSON" description="Must be a JSON object; malformed JSON is blocked before the write request.">
            <textarea
              data-testid="settings-alert-rule-condition-input"
              rows={6}
              value={alertRules.createConditionJson}
              onChange={(event) => alertRules.setCreateConditionJson(event.target.value)}
              className={cn(iCls, 'h-auto w-full resize-none py-2 font-mono text-[11px] leading-relaxed')}
              disabled={alertRules.isPending}
            />
            {alertRules.createErrors.conditionJson ? <p data-testid="settings-alert-rule-condition-error" className="mt-2 text-[11px] text-[var(--red)]">{alertRules.createErrors.conditionJson}</p> : null}
          </InputRow>
          <InputRow label="Action JSON" description="Notification destinations remain shell-only, but the backend-backed action payload is real for supported alert rules.">
            <textarea
              data-testid="settings-alert-rule-action-input"
              rows={4}
              value={alertRules.createActionJson}
              onChange={(event) => alertRules.setCreateActionJson(event.target.value)}
              className={cn(iCls, 'h-auto w-full resize-none py-2 font-mono text-[11px] leading-relaxed')}
              disabled={alertRules.isPending}
            />
            {alertRules.createErrors.actionJson ? <p data-testid="settings-alert-rule-action-error" className="mt-2 text-[11px] text-[var(--red)]">{alertRules.createErrors.actionJson}</p> : null}
          </InputRow>
          <InputRow label="Cooldown (minutes)" last>
            <input
              data-testid="settings-alert-rule-cooldown-input"
              type="number"
              min={1}
              step={1}
              value={alertRules.createCooldownMinutes}
              onChange={(event) => alertRules.setCreateCooldownMinutes(event.target.value)}
              className={cn(iCls, 'w-32')}
              disabled={alertRules.isPending}
            />
            {alertRules.createErrors.cooldownMinutes ? <p data-testid="settings-alert-rule-cooldown-error" className="mt-2 text-[11px] text-[var(--red)]">{alertRules.createErrors.cooldownMinutes}</p> : null}
          </InputRow>
          <div className="mt-3 flex gap-2">
            <Btn testId="settings-alert-rule-submit" icon={alertRules.isPending ? RefreshCw : Plus} onClick={() => void alertRules.create()} disabled={alertRules.isPending}>
              {alertRules.isPending ? 'Creating…' : 'Create live rule'}
            </Btn>
            <Btn ghost onClick={() => alertRules.setCreateFormOpen(false)} disabled={alertRules.isPending}>Cancel</Btn>
          </div>
        </div>
      ) : null}

      <SectionHead title={`Rules · ${alertRules.snapshot?.activeCount ?? 0} active`} action={!alertRules.createFormOpen ? <Btn testId="settings-alert-rules-open-create" icon={Plus} onClick={() => alertRules.setCreateFormOpen(true)}>Create</Btn> : undefined} />

      {rules.length === 0 ? (
        <div data-testid="settings-alert-rules-empty" className="rounded-lg border border-dashed border-[var(--line)] px-4 py-8 text-center text-[12px] text-[var(--text-faint)]">
          No live alert rules found.
        </div>
      ) : (
        rules.map((rule, index) => (
          <Row key={rule.id} last={index === rules.length - 1}>
            <span className={cn('mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full', rule.enabled ? 'bg-[var(--green)]' : 'bg-[var(--surface-3)]')} />
            <div className="mx-3 min-w-0 flex-1" data-testid={`settings-alert-rule-row-${rule.id}`}>
              <div className="flex items-center gap-2">
                <p className="text-[13px] font-medium text-[var(--text-primary)]">{rule.name}</p>
                <SevBadge s={rule.severity} />
                {!rule.enabled ? <SourceBadge label="disabled" tone="mock" /> : null}
              </div>
              <p className="font-mono text-[11px] text-[var(--text-faint)]">{rule.conditionSummary}</p>
              <p className="mt-1 text-[10.5px] text-[var(--text-faint)]">last fired: {rule.lastFiredLabel} · cooldown {rule.cooldownMinutes}m</p>
            </div>
            <div className="mr-3 flex items-center gap-1">
              {rule.channels.map((channel) => (
                <span key={channel} className="rounded bg-[var(--surface-3)] px-1.5 py-0.5 text-[9.5px] capitalize text-[var(--text-tertiary)]">
                  {channel}
                </span>
              ))}
            </div>
            <Btn testId={`settings-alert-rule-toggle-${rule.id}`} ghost icon={RefreshCw} onClick={() => void alertRules.toggleEnabled(rule.id, !rule.enabled)} disabled={alertRules.isPending}>
              {rule.enabled ? 'Disable' : 'Enable'}
            </Btn>
            <Btn testId={`settings-alert-rule-delete-${rule.id}`} danger icon={Trash2} onClick={() => void alertRules.remove(rule.id)} disabled={alertRules.isPending}>
              Delete
            </Btn>
          </Row>
        ))
      )}

      <SectionHead title="Notification channels" action={<SourceBadge label="mock-only" tone="mock" testId="settings-alert-channels-source-badge" />} />
      <MockOnlyWrap testId="settings-alert-channels-mock-only" note="Email, Slack, and PagerDuty controls remain visibly present, but this slice does not fake backend writes for unsupported channel management.">
        {[
          { name: 'Email', detail: 'alex@hyperpush.dev', on: true },
          { name: 'Slack', detail: '#alerts', on: true },
          { name: 'PagerDuty', detail: 'Not configured', on: false },
        ].map((channel, index, array) => (
          <Row key={channel.name} last={index === array.length - 1}>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-[var(--text-primary)]">{channel.name}</p>
              <p className="text-[11px] text-[var(--text-tertiary)]">{channel.detail}</p>
            </div>
            <Btn ghost>{channel.on ? 'Configure' : 'Connect'}</Btn>
          </Row>
        ))}
      </MockOnlyWrap>
    </div>
  )
}

function TeamTab({ live }: { live: SettingsLiveState }) {
  const team = live.team
  const members = team.snapshot?.items ?? []
  const statusTone = team.state === 'failed' ? 'error' : team.state === 'ready' ? 'live' : 'neutral'

  return (
    <div
      data-testid="settings-team-panel"
      data-state={team.state}
      data-source={team.source}
      data-mutation-phase={team.mutationPhase}
      data-mutation-error-code={team.mutationError?.code ?? 'none'}
      data-member-count={members.length}
      data-owner-count={team.snapshot?.ownerCount ?? 0}
      data-admin-count={team.snapshot?.adminCount ?? 0}
      data-member-role-count={team.snapshot?.memberCount ?? 0}
    >
      <PageTitle title="Team" subtitle="Real org-member reads and writes now run through same-origin /api/v1/orgs/default/members without hardcoding the org UUID." />

      <StatusBanner
        icon={Users}
        tone={statusTone}
        testId="settings-team-status-banner"
        title={
          team.state === 'failed'
            ? 'Team reads failed'
            : team.state === 'ready'
              ? 'Live team membership active'
              : 'Loading same-origin team membership'
        }
        description={
          team.state === 'failed'
            ? 'The Team tab stayed mounted with explicit failure markers instead of falling back to a fake invite list.'
            : team.state === 'ready'
              ? 'List, add, role, and remove all target /api/v1/orgs/default/members. The add form is intentionally honest about requiring a raw user_id.'
              : 'The Team bootstrap runs independently so the rest of Settings stays usable while org membership loads.'
        }
      />
      {team.error ? <SectionErrorCallout prefix="Last live team read failed" code={team.error.code} path={team.error.path} testId="settings-team-error" /> : null}
      {team.mutationError ? <SectionErrorCallout prefix="Last live team write failed" code={team.mutationError.code} path={team.mutationError.path} testId="settings-team-mutation-error" /> : null}

      {team.createFormOpen ? (
        <div data-testid="settings-team-create-form" className="mt-6 border-b border-[var(--line)] pb-6">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-[13px] font-semibold text-[var(--text-primary)]">Add live team member</p>
            <button type="button" onClick={() => team.setCreateFormOpen(false)} className="rounded p-1 text-[var(--text-faint)] hover:text-[var(--text-secondary)] transition-colors">
              <X size={13} />
            </button>
          </div>
          <InputRow label="User ID" description="The backend contract requires a raw user_id. This shell does not pretend an email invite route exists yet.">
            <input
              data-testid="settings-team-user-id-input"
              type="text"
              placeholder="UUID user_id"
              value={team.createUserId}
              onChange={(event) => team.setCreateUserId(event.target.value)}
              className={cn(iCls, 'w-full font-mono text-[11px]')}
              disabled={team.isPending}
            />
          </InputRow>
          <InputRow label="Role" description="owner, admin, or member" last>
            <SelectWrap>
              <select
                data-testid="settings-team-role-select"
                value={team.createRole}
                onChange={(event) => team.setCreateRole(event.target.value)}
                className={cn(sCls, 'w-40')}
                disabled={team.isPending}
              >
                <option value="member">member</option>
                <option value="admin">admin</option>
                <option value="owner">owner</option>
              </select>
            </SelectWrap>
            {team.createError ? <p data-testid="settings-team-create-error" className="mt-2 text-[11px] text-[var(--red)]">{team.createError}</p> : null}
          </InputRow>
          <div className="mt-3 flex gap-2">
            <Btn testId="settings-team-submit" icon={team.isPending ? RefreshCw : Plus} onClick={() => void team.create()} disabled={team.isPending}>
              {team.isPending ? 'Adding…' : 'Add live member'}
            </Btn>
            <Btn ghost onClick={() => team.setCreateFormOpen(false)} disabled={team.isPending}>Cancel</Btn>
          </div>
        </div>
      ) : null}

      <SectionHead
        title={`Members · ${members.length}`}
        action={!team.createFormOpen ? <Btn testId="settings-team-open-create" icon={Plus} onClick={() => team.setCreateFormOpen(true)}>Add member</Btn> : undefined}
      />
      <div className="mb-4 flex items-center gap-2">
        <SourceBadge label={team.source} tone={statusTone} testId="settings-team-source-badge" />
        <span className="text-[11px] text-[var(--text-faint)]">Org slug: <code>/api/v1/orgs/default/members</code></span>
      </div>

      {members.length === 0 ? (
        <div data-testid="settings-team-empty" className="rounded-lg border border-dashed border-[var(--line)] px-4 py-8 text-center text-[12px] text-[var(--text-faint)]">
          No live team members found.
        </div>
      ) : (
        members.map((member, index) => (
          <Row key={member.id} last={index === members.length - 1}>
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface-3)] text-[10px] font-bold text-[var(--text-secondary)]">
              {member.initials}
            </div>
            <div className="mx-3 min-w-0 flex-1" data-testid={`settings-team-row-${member.id}`}>
              <div className="flex items-center gap-2">
                <p className="text-[13px] font-medium text-[var(--text-primary)]">{member.displayName}</p>
                <RoleBadge r={member.role} />
              </div>
              <p className="truncate text-[11px] text-[var(--text-tertiary)]">{member.email}</p>
              <p className="truncate font-mono text-[10.5px] text-[var(--text-faint)]">user_id: {member.userId}</p>
            </div>
            <span className="mr-3 hidden text-[11px] text-[var(--text-faint)] sm:block">joined {member.joinedAtLabel}</span>
            <SelectWrap>
              <select
                data-testid={`settings-team-row-role-${member.id}`}
                value={member.role}
                onChange={(event) => void team.updateRole(member.id, event.target.value)}
                className={cn(sCls, 'w-32')}
                disabled={team.isPending || member.role === 'owner'}
              >
                <option value="member">member</option>
                <option value="admin">admin</option>
                <option value="owner">owner</option>
              </select>
            </SelectWrap>
            {member.canRemove ? (
              <Btn
                testId={`settings-team-row-remove-${member.id}`}
                danger
                icon={Trash2}
                onClick={() => void team.remove(member.id)}
                disabled={team.isPending}
              >
                Remove
              </Btn>
            ) : (
              <span data-testid={`settings-team-row-owner-${member.id}`} className="ml-2 text-[11px] text-[var(--text-faint)]">Owner locked</span>
            )}
          </Row>
        ))
      )}
    </div>
  )
}

function IntegrationsTab() {
  return (
    <div>
      <PageTitle title="Integrations" subtitle="Third-party wiring stays present, but the tab is explicitly mock-only right now." />
      <MockOnlyWrap testId="settings-integrations-mock-only" note="Connected-service controls remain visually stable but intentionally non-live until dedicated backend routes exist.">
        <SectionHead title="Connections" />
        {INTEGRATIONS.map((integration, index) => (
          <Row key={integration.id} last={index === INTEGRATIONS.length - 1}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface-2)]">
              <integration.icon size={14} className={integration.connected ? 'text-[var(--text-secondary)]' : 'text-[var(--text-faint)]'} />
            </div>
            <div className="mx-3 min-w-0 flex-1">
              <p className="text-[13px] font-medium text-[var(--text-primary)]">{integration.name}</p>
              <p className="text-[11px] text-[var(--text-faint)]">{integration.detail}</p>
            </div>
            <Btn ghost>{integration.connected ? 'Configure' : 'Connect'}</Btn>
          </Row>
        ))}
      </MockOnlyWrap>
    </div>
  )
}

function BillingTab() {
  return (
    <div>
      <PageTitle title="Billing" subtitle="Plan and usage remain stable, but the management actions are not live from this shell." />
      <MockOnlyWrap testId="settings-billing-mock-only" note="Billing remains visually present without implying backend writes from this page.">
        <SectionHead title="Plan" />
        <SettingRow label="Current plan" description={`Renews ${BILLING_INFO.nextBillingDate}`}>
          <span className="text-[13px] font-semibold text-[var(--text-primary)]">{BILLING_INFO.plan} · ${BILLING_INFO.monthlyPrice}/month</span>
        </SettingRow>
        <SettingRow label="Events this month" description={`${BILLING_INFO.eventsUsed.toLocaleString()} of ${BILLING_INFO.eventsIncluded.toLocaleString()} used`} last>
          <div className="w-40">
            <ProgressBar value={BILLING_INFO.eventsUsed} max={BILLING_INFO.eventsIncluded} color="var(--blue)" />
          </div>
        </SettingRow>
      </MockOnlyWrap>
    </div>
  )
}

function SecurityTab() {
  return (
    <div>
      <PageTitle title="Security" subtitle="Account-protection controls remain visible but non-live in this slice." />
      <MockOnlyWrap testId="settings-security-mock-only" note="2FA, session revocation, and destructive account actions remain shell-only so the page does not imply unsupported writes.">
        <SectionHead title="Authentication" />
        <Row>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--green)]/[0.20] bg-[var(--green)]/[0.08]">
            <Shield size={14} className="text-[var(--green)]" />
          </div>
          <div className="mx-3 flex-1">
            <p className="text-[13px] font-medium text-[var(--text-primary)]">2FA enabled</p>
            <p className="text-[11px] text-[var(--text-tertiary)]">Authenticator app · Set up 14 days ago</p>
          </div>
          <Btn ghost>Manage</Btn>
        </Row>
        <SectionHead title={`Sessions · ${ACTIVE_SESSIONS.length}`} />
        {ACTIVE_SESSIONS.map((session, index) => (
          <Row key={session.id} last={index === ACTIVE_SESSIONS.length - 1}>
            <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md border', session.current ? 'border-[var(--green)]/[0.20] bg-[var(--green)]/[0.08]' : 'border-[var(--line)] bg-[var(--surface-2)]')}>
              <Monitor size={12} className={session.current ? 'text-[var(--green)]' : 'text-[var(--text-faint)]'} />
            </div>
            <div className="mx-3 flex-1">
              <p className="text-[12.5px] font-medium text-[var(--text-primary)]">{session.device}</p>
              <p className="text-[10.5px] text-[var(--text-faint)]">{session.location} · {session.ip}</p>
            </div>
            <span className="text-[11px] text-[var(--text-faint)]">{session.current ? 'this session' : session.lastActive}</span>
          </Row>
        ))}
      </MockOnlyWrap>
    </div>
  )
}

function NotificationsTab() {
  return (
    <div>
      <PageTitle title="Notifications" subtitle="Preference toggles are present, but they no longer pretend to save globally." />
      <MockOnlyWrap testId="settings-notifications-mock-only" note="Notification preferences stay visibly present and disabled until a real backend route exists.">
        <SectionHead title="Channels" />
        {[
          { label: 'Email', key: 'email' as const, detail: 'alex@hyperpush.dev' },
          { label: 'Slack', key: 'slack' as const, detail: '#alerts' },
        ].map((channel, index, array) => (
          <SettingRow key={channel.label} label={channel.label} description={channel.detail} last={index === array.length - 1}>
            <Toggle defaultChecked={NOTIF_PREFS[channel.key]} />
          </SettingRow>
        ))}
      </MockOnlyWrap>
    </div>
  )
}

function ProfileTab() {
  const profile = USER_PROFILE

  return (
    <div>
      <PageTitle title="Profile" subtitle="Identity details stay present, but remain shell-only from Settings." />
      <MockOnlyWrap testId="settings-profile-mock-only" note="Profile edits are intentionally non-live in this slice.">
        <div className="mb-1 flex items-center gap-3.5 border-b border-[var(--line)] py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface-3)] text-[14px] font-bold text-[var(--text-secondary)]">
            {profile.avatar}
          </div>
          <div>
            <p className="text-[14px] font-semibold text-[var(--text-primary)]">{profile.name}</p>
            <p className="text-[11.5px] text-[var(--text-tertiary)]">{profile.email}</p>
          </div>
        </div>
        <InputRow label="Display name">
          <input type="text" defaultValue={profile.name} className={cn(iCls, 'w-full')} />
        </InputRow>
        <InputRow label="Username" last>
          <input type="text" defaultValue={profile.username} className={cn(iCls, 'w-full')} />
        </InputRow>
      </MockOnlyWrap>
    </div>
  )
}

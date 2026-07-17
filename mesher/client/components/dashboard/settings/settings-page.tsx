'use client'

import { useState } from 'react'
import { Copy, KeyRound, RefreshCw, Settings, ShieldCheck, Users } from 'lucide-react'
import { Header } from '@/components/dashboard/header'
import { useSettingsLiveState } from '@/components/dashboard/settings/settings-live-state'
import { cn } from '@/lib/utils'

type Tab = 'general' | 'team' | 'api-keys' | 'alert-rules'

const tabs: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
  { id: 'general', label: 'General', icon: Settings },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'api-keys', label: 'API Keys', icon: KeyRound },
  { id: 'alert-rules', label: 'Alert Rules', icon: ShieldCheck },
]

function SectionState({ state, error, onRetry }: { state: string; error: { code: string } | null; onRetry: () => void }) {
  if (state === 'loading') return <p className="p-5 text-sm text-[var(--text-secondary)]">Loading live settings…</p>
  if (state === 'failed') return <div className="m-5 rounded border border-[var(--red)]/30 bg-[var(--red)]/5 p-4 text-sm text-[var(--red)]" role="alert">Settings unavailable ({error?.code ?? 'unknown'}). <button className="underline" onClick={onRetry} type="button">Try again</button></div>
  return null
}

export function SettingsPage() {
  const state = useSettingsLiveState()
  const [tab, setTab] = useState<Tab>('general')

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden" data-shell-state={state.shellState} data-shell-source="live" data-testid="settings-shell">
      <Header title="Settings" />
      <div className="flex min-h-0 flex-1">
        <nav className="w-44 shrink-0 border-r border-[var(--line)] bg-[var(--surface)] p-2" aria-label="Settings sections">
          {tabs.map((item) => <button key={item.id} className={cn('mb-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs', tab === item.id ? 'bg-[var(--surface-3)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-2)]')} onClick={() => setTab(item.id)} type="button"><item.icon size={14} />{item.label}</button>)}
        </nav>
        <main className="min-w-0 flex-1 overflow-y-auto bg-[var(--background)] p-4 sm:p-6">
          {tab === 'general' ? <General state={state.general} /> : null}
          {tab === 'team' ? <Team state={state.team} /> : null}
          {tab === 'api-keys' ? <ApiKeys state={state.apiKeys} /> : null}
          {tab === 'alert-rules' ? <AlertRules state={state.alertRules} /> : null}
        </main>
      </div>
    </div>
  )
}

function Card({ title, children, testId }: { title: string; children: React.ReactNode; testId: string }) {
  return <section className="mx-auto max-w-3xl rounded-xl border border-[var(--line)] bg-[var(--surface)]" data-source="live" data-testid={testId}><div className="border-b border-[var(--line)] px-5 py-4"><h2 className="font-semibold">{title}</h2></div>{children}</section>
}

function General({ state }: { state: ReturnType<typeof useSettingsLiveState>['general'] }) {
  return <Card title="Project data policy" testId="settings-general-panel"><SectionState error={state.error} onRetry={() => void state.refresh()} state={state.state} />{state.snapshot ? <form className="space-y-5 p-5" onSubmit={(event) => { event.preventDefault(); void state.save() }}>
    <label className="block text-sm">Retention days<input className="mt-1 block w-full rounded border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2" inputMode="numeric" onChange={(event) => state.setRetentionDays(event.target.value)} value={state.form.retentionDays} /></label>{state.formErrors.retentionDays ? <p className="text-xs text-[var(--red)]">{state.formErrors.retentionDays}</p> : null}
    <label className="block text-sm">Sample rate (%)<input className="mt-1 block w-full rounded border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2" inputMode="decimal" onChange={(event) => state.setSampleRatePercent(event.target.value)} value={state.form.sampleRatePercent} /></label>{state.formErrors.sampleRatePercent ? <p className="text-xs text-[var(--red)]">{state.formErrors.sampleRatePercent}</p> : null}
    <div className="grid grid-cols-2 gap-3 rounded bg-[var(--surface-2)] p-3 text-sm"><div><p className="text-[var(--text-faint)]">Stored events</p><p className="font-semibold">{state.snapshot.storageEventCount.toLocaleString()}</p></div><div><p className="text-[var(--text-faint)]">Estimated storage</p><p className="font-semibold">{state.snapshot.storageEstimatedBytesLabel}</p></div></div>
    <button className="rounded bg-[var(--green)] px-4 py-2 text-sm font-semibold text-black disabled:opacity-50" disabled={state.isPending} type="submit">{state.isPending ? 'Saving…' : 'Save live settings'}</button>
  </form> : null}</Card>
}

function Team({ state }: { state: ReturnType<typeof useSettingsLiveState>['team'] }) {
  return <Card title="Organization members" testId="settings-team-panel"><SectionState error={state.error} onRetry={() => void state.refresh()} state={state.state} />{state.snapshot ? <div className="divide-y divide-[var(--line)]">{state.snapshot.items.map((member) => <div key={member.id} className="flex flex-wrap items-center gap-3 px-5 py-4"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-3)] text-xs font-bold">{member.initials}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{member.displayName || member.email}</p><p className="truncate text-xs text-[var(--text-tertiary)]">{member.email} · joined {member.joinedAtLabel}</p></div><select aria-label={`Role for ${member.email}`} className="rounded border border-[var(--line)] bg-[var(--surface-2)] px-2 py-1.5 text-xs" disabled={state.isPending} onChange={(event) => void state.updateRole(member.id, event.target.value)} value={member.role}><option value="owner">Owner</option><option value="admin">Admin</option><option value="member">Member</option></select>{member.canRemove ? <button className="text-xs text-[var(--red)]" disabled={state.isPending} onClick={() => void state.remove(member.id)} type="button">Remove</button> : null}</div>)}{state.snapshot.items.length === 0 ? <p className="p-5 text-sm text-[var(--text-secondary)]">No members.</p> : null}<p className="p-5 text-xs text-[var(--text-tertiary)]">Invitations are not available in this release, so no raw-user-ID or fake invite control is shown.</p></div> : null}</Card>
}

function ApiKeys({ state }: { state: ReturnType<typeof useSettingsLiveState>['apiKeys'] }) {
  return <Card title="Ingestion API keys" testId="settings-api-keys-panel"><SectionState error={state.error} onRetry={() => void state.refresh()} state={state.state} />{state.reveal ? <div className="m-5 rounded border border-[var(--yellow)]/30 bg-[var(--yellow)]/5 p-4" data-testid="settings-api-key-reveal"><p className="text-xs font-semibold">Copy this key now. It will not be shown again.</p><code className="mt-2 block break-all text-xs">{state.reveal.keyValue}</code><div className="mt-3 flex gap-2"><button className="flex items-center gap-1 rounded bg-[var(--surface-3)] px-3 py-2 text-xs" onClick={() => void navigator.clipboard.writeText(state.reveal!.keyValue)} type="button"><Copy size={12} />Copy</button><button className="text-xs underline" onClick={state.dismissReveal} type="button">I saved it</button></div></div> : null}{state.snapshot ? <div><div className="flex justify-end p-5"><button className="rounded bg-[var(--green)] px-3 py-2 text-xs font-semibold text-black" onClick={() => state.setCreateFormOpen(true)} type="button">Create key</button></div>{state.createFormOpen ? <form className="mx-5 mb-5 flex gap-2" onSubmit={(event) => { event.preventDefault(); void state.create() }}><input aria-label="API key label" className="flex-1 rounded border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-xs" onChange={(event) => state.setCreateLabel(event.target.value)} placeholder="Key label" value={state.createLabel} /><button className="rounded bg-[var(--surface-3)] px-3 text-xs" type="submit">Create</button><button className="text-xs" onClick={() => state.setCreateFormOpen(false)} type="button">Cancel</button></form> : null}{state.createError ? <p className="mx-5 mb-4 text-xs text-[var(--red)]">{state.createError}</p> : null}<div className="divide-y divide-[var(--line)]">{state.snapshot.items.map((key) => <div key={key.id} className="flex items-center gap-3 px-5 py-4"><div className="flex-1"><p className="text-sm font-medium">{key.label}</p><p className="font-mono text-xs text-[var(--text-tertiary)]">{key.maskedValue} · {key.status}</p></div>{key.status === 'active' ? <button className="text-xs text-[var(--red)]" disabled={state.isPending} onClick={() => void state.revoke(key.id)} type="button">Revoke</button> : null}</div>)}</div></div> : null}</Card>
}

function AlertRules({ state }: { state: ReturnType<typeof useSettingsLiveState>['alertRules'] }) {
  return <Card title="Alert rules" testId="settings-alert-rules-panel"><SectionState error={state.error} onRetry={() => void state.refresh()} state={state.state} />{state.snapshot ? <div className="divide-y divide-[var(--line)]">{state.snapshot.items.map((rule) => <div key={rule.id} className="flex items-center gap-3 px-5 py-4"><div className="min-w-0 flex-1"><p className="text-sm font-medium">{rule.name}</p><p className="truncate text-xs text-[var(--text-tertiary)]">{rule.conditionSummary} · cooldown {rule.cooldownMinutes}m</p></div><label className="flex items-center gap-1 text-xs"><input checked={rule.enabled} disabled={state.isPending} onChange={(event) => void state.toggleEnabled(rule.id, event.target.checked)} type="checkbox" />Enabled</label><button className="text-xs text-[var(--red)]" disabled={state.isPending} onClick={() => void state.remove(rule.id)} type="button">Delete</button></div>)}{state.snapshot.items.length === 0 ? <p className="p-5 text-sm text-[var(--text-secondary)]">No alert rules.</p> : null}<p className="flex items-center gap-1 p-5 text-xs text-[var(--text-tertiary)]"><RefreshCw size={12} />Rule creation is hidden until the typed builder ships; free-form JSON is no longer a production control.</p></div> : null}</Card>
}

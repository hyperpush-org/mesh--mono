import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/$')({
  ssr: false,
  component: DashboardCatchAllRoute,
})

function DashboardCatchAllRoute() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4 text-[var(--text-primary)]">
      <section className="max-w-md rounded-xl border border-[var(--line)] bg-[var(--surface)] p-7 text-center">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-[var(--green)]">Capability unavailable</p>
        <h1 className="mt-3 text-2xl font-semibold">This route is not part of the launch surface.</h1>
        <p className="mt-3 text-sm text-[var(--text-secondary)]">Only Issues, Alerts, and backed Settings are available in this release.</p>
        <a className="mt-5 inline-flex rounded-md bg-[var(--green)] px-4 py-2 text-sm font-semibold text-black" href="/">Open Issues</a>
      </section>
    </main>
  )
}

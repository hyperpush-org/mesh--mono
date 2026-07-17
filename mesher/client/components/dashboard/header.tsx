interface HeaderProps {
  title: string
}

export function Header({ title }: HeaderProps) {
  return (
    <header className="sticky top-0 z-20 flex items-center border-b border-[var(--line)] bg-[var(--surface)] px-3 sm:px-6" style={{ height: 'var(--header-height)' }}>
      <h1 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h1>
    </header>
  )
}

interface FilterBarProps {
  search: string
  statusFilter: string
  severityFilter: string
  onSearch: (value: string) => void
  onStatusFilter: (value: string) => void
  onSeverityFilter: (value: string) => void
}

export function FilterBar({ search, statusFilter, severityFilter, onSearch, onStatusFilter, onSeverityFilter }: FilterBarProps) {
  return (
    <div className="flex flex-wrap gap-2 border-b border-[var(--line)] bg-[var(--surface)] px-4 py-2.5">
      <input aria-label="Search issues" className="min-w-48 flex-1 rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-3 py-1.5 text-xs" onChange={(event) => onSearch(event.target.value)} placeholder="Search live issues…" value={search} />
      <select aria-label="Issue status" className="rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-2 text-xs" onChange={(event) => onStatusFilter(event.target.value)} value={statusFilter}>
        <option value="all">All statuses</option><option value="open">Open</option><option value="resolved">Resolved</option><option value="ignored">Ignored</option>
      </select>
      <select aria-label="Issue severity" className="rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-2 text-xs" onChange={(event) => onSeverityFilter(event.target.value)} value={severityFilter}>
        <option value="all">All severities</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
      </select>
    </div>
  )
}

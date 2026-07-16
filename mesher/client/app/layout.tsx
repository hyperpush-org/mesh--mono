import type { ReactNode } from 'react'

export const metadata = {
  title: 'hyperpush — Error Tracking Dashboard',
  description:
    'Production error tracking for web and backend applications, with fast triage, performance insights, releases, and alerts.',
}

export default function LegacyAppLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  return <>{children}</>
}

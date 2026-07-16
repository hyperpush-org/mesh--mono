import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Documentation",
  description:
    "Comprehensive hyperpush documentation for error tracking, performance monitoring, releases, alerts, and SDK integration.",
}

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return children
}

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Documentation",
  description:
    "Documentation for hyperpush error ingestion, issue tracking, alerts, API keys, and project settings.",
}

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return children
}

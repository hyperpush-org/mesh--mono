import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Documentation",
  description:
    "Comprehensive documentation for hyperpush — coming soon. Error tracking, Solana program monitoring, token economics, and public bug boards.",
}

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return children
}

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "License - hyperpush",
  description: "hyperpush core-platform license information under GNU AGPL version 3.",
}

export default function LicenseLayout({ children }: { children: React.ReactNode }) {
  return children
}

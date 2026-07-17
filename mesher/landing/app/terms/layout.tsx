import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Terms of Service - hyperpush",
  description: "Terms and conditions for using the hyperpush platform and related services.",
}

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children
}

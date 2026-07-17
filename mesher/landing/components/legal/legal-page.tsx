"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRight } from "lucide-react"
import { motion } from "framer-motion"
import { Header } from "@/components/landing/header"
import { Footer } from "@/components/landing/footer"

const legalNav = [
  { title: "Privacy Policy", href: "/privacy" },
  { title: "Terms of Service", href: "/terms" },
  { title: "License", href: "/license" },
]

export function LegalPage({
  title,
  lastUpdated,
  children,
}: {
  title: string
  lastUpdated: string
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Header section="/legal" />

      {/* Content */}
      <div className="flex-1 max-w-7xl mx-auto px-6 pt-8 pb-24 w-full">
        <div className="flex gap-0">
          {/* Sidebar */}
          <div className="hidden md:block w-56 shrink-0">
            <div className="sticky top-16 pr-4">
              <p className="text-xs font-mono text-accent uppercase tracking-wider mb-3 px-3">Legal</p>
              <ul className="space-y-0.5">
                {legalNav.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`block px-3 py-1.5 text-sm rounded-md transition-colors ${
                        pathname === item.href
                          ? "text-foreground bg-muted font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      }`}
                    >
                      {item.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Main */}
          <div className="flex-1 min-w-0 md:pl-8">
            <article className="max-w-3xl">
              {/* Breadcrumb */}
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-8">
                <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
                <ChevronRight className="w-3.5 h-3.5" />
                <span className="text-foreground">{title}</span>
              </div>

              {/* Title */}
              <motion.div
                initial={{ y: 20 }}
                animate={{ y: 0 }}
                transition={{ duration: 0.4 }}
              >
                <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
                  {title}
                </h1>
                <p className="text-sm text-muted-foreground mb-8 font-mono">
                  Last updated: {lastUpdated}
                </p>
              </motion.div>

              <div className="h-px bg-border mb-10" />

              {/* Mobile legal nav */}
              <div className="md:hidden flex gap-2 mb-10 overflow-x-auto pb-2">
                {legalNav.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`shrink-0 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                      pathname === item.href
                        ? "border-accent/30 bg-accent/5 text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {item.title}
                  </Link>
                ))}
              </div>

              {/* Content */}
              <div className="legal-content space-y-8">
                {children}
              </div>
            </article>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Reusable building blocks for legal content                        */
/* ------------------------------------------------------------------ */

export function Section({ id, number, title, children }: { id?: string; number?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-16">
      <h2 className="text-2xl font-bold tracking-tight mb-4 flex items-baseline gap-3">
        {number && <span className="text-accent font-mono text-lg">{number}</span>}
        {title}
      </h2>
      <div className="space-y-4 text-muted-foreground leading-relaxed">{children}</div>
    </section>
  )
}

export function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <h3 className="text-lg font-semibold text-foreground mb-3">{title}</h3>
      <div className="space-y-3 text-muted-foreground leading-relaxed">{children}</div>
    </div>
  )
}

export function LegalList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2 pl-1">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-3 text-muted-foreground">
          <span className="w-1.5 h-1.5 rounded-full bg-accent/60 mt-2 shrink-0" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

export function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-accent/20 bg-accent/5 p-5 text-sm text-muted-foreground leading-relaxed">
      {children}
    </div>
  )
}

"use client"

import { BellRing, Bug, ListChecks, Search } from "lucide-react"
import { motion } from "framer-motion"
import { WaitlistButton } from "@/components/landing/waitlist-dialog"

const workflow = [
  { icon: Bug, label: "Capture", detail: "Typed error event" },
  { icon: ListChecks, label: "Group", detail: "Fingerprint into issues" },
  { icon: Search, label: "Inspect", detail: "Stack and breadcrumbs" },
  { icon: BellRing, label: "Act", detail: "Issue and alert lifecycle" },
]

export function Hero() {
  return (
    <section className="relative flex items-start justify-center overflow-hidden sm:min-h-screen sm:items-center">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
      <div className="absolute top-1/2 left-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/5 blur-[120px] pointer-events-none sm:h-[800px] sm:w-[800px]" />

      <div className="relative z-10 mx-auto w-full max-w-5xl px-4 pt-8 pb-10 text-center sm:px-6 sm:pt-20 md:pt-24 sm:pb-24">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="mb-4 flex items-center justify-center gap-2 sm:mb-8">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm sm:px-4 sm:py-2 sm:text-sm">
            <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent" />
            Private beta opening soon
          </span>
        </motion.div>

        <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }} className="mx-auto mb-4 max-w-[11ch] text-4xl leading-[0.98] font-bold tracking-tight text-balance sm:mb-6 sm:max-w-none sm:text-5xl md:text-6xl lg:text-7xl">
          See what broke.
          <br className="hidden sm:block" />
          <span className="sm:hidden"> </span>
          <span className="text-accent">Work the issue from evidence.</span>
        </motion.h1>

        <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }} className="mx-auto mb-6 max-w-3xl text-[15px] leading-7 text-muted-foreground text-pretty sm:mb-10 sm:text-lg md:text-xl">
          Production error tracking with live issue grouping, recorded stack traces and breadcrumbs,
          in-product alerts, and project-scoped controls.
        </motion.p>

        <motion.div initial={{ y: 20 }} animate={{ y: 0 }} transition={{ duration: 0.5, delay: 0.3 }} className="mb-8 flex items-center justify-center sm:mb-16">
          <WaitlistButton size="lg" className="h-11 w-full gap-2 px-6 sm:h-12 sm:w-auto sm:px-8">
            Join Waitlist
          </WaitlistButton>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.4 }} className="relative overflow-hidden rounded-2xl border border-border bg-card/80 text-left shadow-2xl backdrop-blur-sm">
          <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-3">
            <span className="text-xs font-mono text-muted-foreground">live product workflow</span>
            <span className="rounded border border-accent/20 bg-accent/10 px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-accent">Capability-backed</span>
          </div>
          <div className="grid divide-y divide-border/40 sm:grid-cols-4 sm:divide-x sm:divide-y-0">
            {workflow.map((step, index) => (
              <motion.div key={step.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.65 + index * 0.1 }} className="p-5 sm:p-6">
                <step.icon className="mb-4 h-5 w-5 text-accent" />
                <p className="mb-1 text-sm font-semibold">{step.label}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">{step.detail}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}

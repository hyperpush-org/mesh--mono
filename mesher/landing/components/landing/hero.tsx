"use client"

import { Button } from "@/components/ui/button"
import { Github, AlertCircle, AlertTriangle, Info } from "lucide-react"
import { motion } from "framer-motion"
import { WaitlistButton } from "@/components/landing/waitlist-dialog"

const events = [
  {
    type: "TypeError",
    message: "Cannot read properties of undefined (reading 'map')",
    file: "src/components/Feed.tsx:47",
    env: "Chrome 121",
    severity: "high" as const,
    time: "just now",
    count: 14,
  },
  {
    type: "NetworkError",
    message: "Failed to fetch /api/v1/events — timeout after 10s",
    file: "src/lib/api.ts:112",
    env: "Firefox 123",
    severity: "medium" as const,
    time: "12s ago",
    count: 3,
  },
  {
    type: "ReferenceError",
    message: "analytics is not defined",
    file: "src/utils/tracking.ts:23",
    env: "Safari 17",
    severity: "low" as const,
    time: "1m ago",
    count: 1,
  },
]

const severityConfig = {
  high: {
    icon: AlertCircle,
    badge: "bg-destructive/10 text-destructive border-destructive/20",
    iconClass: "text-destructive",
  },
  medium: {
    icon: AlertTriangle,
    badge: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    iconClass: "text-amber-400",
  },
  low: {
    icon: Info,
    badge: "bg-accent/10 text-accent border-accent/20",
    iconClass: "text-accent",
  },
}

// Simple sparkline path — errors over 30 min
const SPARKLINE = "M 0 42 C 15 38, 25 28, 40 32 S 60 24, 75 18 S 95 28, 110 14 S 130 8, 145 12 S 165 20, 180 10"

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Grid background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />

      {/* Gradient orb */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] sm:w-[800px] h-[600px] sm:h-[800px] bg-accent/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-5xl mx-auto px-4 sm:px-6 text-center pt-28 sm:pt-32 pb-16 sm:pb-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center justify-center gap-2 mb-6 sm:mb-8"
        >
          <span className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full border border-border bg-card/50 backdrop-blur-sm text-xs sm:text-sm text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse shrink-0" />
            Built on Solana
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-balance mb-4 sm:mb-6"
        >
          Open-source error tracking
          <br className="hidden sm:block" />
          <span className="sm:hidden"> </span>
          <span className="text-accent">that funds itself</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8 sm:mb-10 text-pretty"
        >
          Full error tracking for web apps — free, open source, and self-hostable.
          Ship a project token that earns revenue for your treasury and pays developers who squash bugs.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mb-12 sm:mb-16"
        >
          <WaitlistButton size="lg" className="h-11 sm:h-12 px-6 sm:px-8 gap-2 w-full sm:w-auto">
            Join Waitlist
          </WaitlistButton>
          <Button
            size="lg"
            variant="outline"
            className="h-11 sm:h-12 px-6 sm:px-8 gap-2 w-full sm:w-auto"
            asChild
          >
            <a href="https://github.com/hyperpush-dev/hyperpush" target="_blank" rel="noopener noreferrer">
              <Github className="w-4 h-4" />
              View on GitHub
            </a>
          </Button>
        </motion.div>

        {/* Live error feed dashboard */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="relative rounded-xl border border-border bg-card/80 backdrop-blur-sm overflow-hidden shadow-2xl text-left"
        >
          {/* Header bar */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2.5">
              <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
              <span className="text-xs font-mono text-muted-foreground">live error feed</span>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono">
              <span className="text-muted-foreground/70">18 events/min</span>
              <span className="w-px h-3 bg-border" />
              <span className="text-accent">99.8% uptime</span>
            </div>
          </div>

          {/* Error event rows */}
          <div className="divide-y divide-border/40">
            {events.map((event, i) => {
              const cfg = severityConfig[event.severity]
              const Icon = cfg.icon
              return (
                <motion.div
                  key={event.type + i}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: 0.65 + i * 0.12 }}
                  className="flex items-start gap-3 px-4 py-3 sm:py-3.5 hover:bg-muted/20 transition-colors"
                >
                  <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${cfg.iconClass}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="text-xs font-mono font-semibold text-foreground">{event.type}</span>
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${cfg.badge}`}>
                        {event.severity}
                      </span>
                      {event.count > 1 && (
                        <span className="text-[10px] font-mono text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">
                          ×{event.count}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{event.message}</p>
                    <p className="text-[10px] text-muted-foreground/50 font-mono mt-0.5">{event.file}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground/40 font-mono whitespace-nowrap shrink-0 pt-0.5">
                    {event.time}
                  </span>
                </motion.div>
              )
            })}
          </div>

          {/* Sparkline footer */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 1.1 }}
            className="flex items-end gap-4 px-4 py-3 border-t border-border bg-muted/20"
          >
            <div className="flex-1">
              <p className="text-[10px] font-mono text-muted-foreground/40 mb-1.5">errors — last 30 min</p>
              <svg
                viewBox="0 0 180 50"
                className="w-full h-8"
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgb(89,193,132)" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="rgb(89,193,132)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={`${SPARKLINE} V 50 H 0 Z`} fill="url(#sparkGrad)" />
                <path
                  d={SPARKLINE}
                  fill="none"
                  stroke="rgb(89,193,132)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div className="flex flex-col items-end gap-0.5 shrink-0">
              <span className="text-sm font-mono font-bold text-foreground tabular-nums">247</span>
              <span className="text-[10px] font-mono text-muted-foreground/40">total events</span>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}

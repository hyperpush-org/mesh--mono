"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { motion } from "framer-motion"

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden">
      {/* ── Blurred preview layer (decorative, not interactive) ── */}
      <div
        className="absolute inset-0 pointer-events-none select-none overflow-hidden"
        aria-hidden="true"
      >
        {/* Simulated sidebar */}
        <div className="absolute left-0 top-0 bottom-0 w-64 border-r border-border bg-card/50 p-8 space-y-6 opacity-40">
          <div className="h-6 w-24 rounded bg-muted/60" />
          {["Getting Started", "SDKs", "Solana", "Token Economics", "Bug Board", "Platform"].map((s) => (
            <div key={s} className="space-y-2">
              <div className="h-3 w-20 rounded bg-accent/20" />
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-3 rounded bg-muted/40" style={{ width: `${55 + i * 15}%` }} />
              ))}
            </div>
          ))}
        </div>

        {/* Simulated content */}
        <div className="ml-64 p-16 space-y-6 opacity-40">
          <div className="h-4 w-40 rounded bg-accent/20" />
          <div className="h-12 w-96 rounded bg-muted/40" />
          <div className="space-y-2 max-w-2xl">
            {[90, 85, 70, 85, 60].map((w, i) => (
              <div key={i} className="h-3 rounded bg-muted/30" style={{ width: `${w}%` }} />
            ))}
          </div>
          <div className="mt-8 h-40 max-w-2xl rounded-xl border border-border bg-card/30" />
          <div className="space-y-2 max-w-2xl mt-4">
            {[80, 75, 65].map((w, i) => (
              <div key={i} className="h-3 rounded bg-muted/30" style={{ width: `${w}%` }} />
            ))}
          </div>
        </div>
      </div>

      {/* ── Backdrop blur overlay ── */}
      <div className="absolute inset-0 backdrop-blur-[6px] bg-background/70" />

      {/* ── Coming soon card ── */}
      <div className="relative z-10 flex min-h-screen items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-sm sm:max-w-md rounded-2xl border border-border bg-card/90 backdrop-blur-sm p-8 sm:p-10 text-center shadow-2xl"
        >
          {/* Icon */}
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full border border-accent/20 bg-accent/5">
            <span className="text-2xl">📖</span>
          </div>

          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-accent/20 bg-accent/5 text-xs font-mono text-accent uppercase tracking-wider mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            Coming Soon
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
            Docs are on their way
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base mb-8 text-pretty">
            We're writing comprehensive documentation for hyperpush. Sign up for the waitlist and we'll let you
            know when it's ready.
          </p>

          <div className="flex flex-col gap-3">
            <Button size="lg" className="w-full gap-2" asChild>
              <Link href="/">
                <ArrowLeft className="w-4 h-4" />
                Back to home
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="w-full" asChild>
              <a
                href={process.env.NEXT_PUBLIC_DISCORD_URL ?? "https://discord.gg/hyperpush"}
                target="_blank"
                rel="noopener noreferrer"
              >
                Join our Discord
              </a>
            </Button>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

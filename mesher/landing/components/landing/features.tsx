"use client"

import { motion } from "framer-motion"
import { BellRing, Bug, KeyRound, Settings2, ShieldCheck, Users } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { livePublicCapabilities, type CapabilityKey } from "@/lib/capabilities"

const iconByCapability: Partial<Record<CapabilityKey, LucideIcon>> = {
  issues: Bug,
  alerts: BellRing,
  "project-settings": Settings2,
  "team-membership": Users,
  "api-keys": KeyRound,
  "alert-rules": ShieldCheck,
}

const featuredCapabilities = livePublicCapabilities().filter(
  (capability) => capability.key in iconByCapability,
)

export function Features() {
  return (
    <section id="features" className="relative py-20 sm:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="max-w-2xl mb-10 sm:mb-16"
        >
          <p className="text-sm font-mono text-accent mb-3 sm:mb-4 uppercase tracking-wider">Live in private beta</p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4 sm:mb-6 text-balance">
            Production error tracking.
            <br />
            <span className="text-muted-foreground">A focused workflow that is real today.</span>
          </h2>
          <p className="text-base sm:text-lg text-muted-foreground text-pretty">
            Capture errors, group them into issues, inspect the evidence, manage lifecycle state,
            and configure the project from an authenticated dashboard.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border rounded-xl overflow-hidden">
          {featuredCapabilities.map((capability) => {
            const Icon = iconByCapability[capability.key] ?? Bug
            return (
              <div
                key={capability.key}
                className="relative bg-background p-6 sm:p-8 group hover:bg-card transition-colors"
              >
                <span className="absolute top-4 right-4 text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded border border-accent/20 bg-accent/10 text-accent">
                  Live
                </span>
                <div className="w-11 sm:w-12 h-11 sm:h-12 rounded-lg bg-muted flex items-center justify-center mb-5 sm:mb-6 group-hover:bg-accent/10 transition-colors">
                  <Icon className="w-5 sm:w-6 h-5 sm:h-6 text-accent" />
                </div>
                <h3 className="text-lg sm:text-xl font-semibold mb-2 sm:mb-3">{capability.label}</h3>
                <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                  Backed by the same capability catalog and release proof used by the product.
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

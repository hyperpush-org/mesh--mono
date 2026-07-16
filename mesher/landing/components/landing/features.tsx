"use client"

import { motion } from "framer-motion"
import { Activity, BellRing, Bug, Gauge, GitBranch, Sparkles } from "lucide-react"

const features = [
  {
    icon: Bug,
    title: "Full Error Tracking",
    description: "Group errors by root cause, inspect stack traces and breadcrumbs, and understand exactly which users and releases are affected.",
    comingSoon: false,
  },
  {
    icon: Gauge,
    title: "Performance Monitoring",
    description: "Track slow routes, latency percentiles, throughput, Apdex, and Web Vitals alongside the errors they cause.",
    comingSoon: false,
  },
  {
    icon: GitBranch,
    title: "Release Health",
    description: "Compare error rate and latency across deployments, identify regressions quickly, and keep release context attached to every incident.",
    comingSoon: false,
  },
  {
    icon: BellRing,
    title: "Actionable Alerts",
    description: "Route high-signal alerts to the right team with severity, thresholds, history, and lifecycle actions in one place.",
    comingSoon: false,
  },
  {
    icon: Activity,
    title: "Operational Context",
    description: "Connect events, projects, environments, ownership, and recent activity without piecing together separate monitoring tools.",
    comingSoon: false,
  },
  {
    icon: Sparkles,
    title: "AI Root-Cause Analysis",
    description: "Paid tiers include AI-powered error grouping, root-cause suggestions, and fix recommendations. Cuts triage time from hours to minutes.",
    comingSoon: false,
  },
]

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
          <p className="text-sm font-mono text-accent mb-3 sm:mb-4 uppercase tracking-wider">Features</p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4 sm:mb-6 text-balance">
            Production error tracking.
            <br />
            <span className="text-muted-foreground">Without the noise.</span>
          </h2>
          <p className="text-base sm:text-lg text-muted-foreground text-pretty">
            One focused workflow for triage, performance, releases, and alerts, with AI analysis available on paid tiers.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border rounded-xl overflow-hidden">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="relative bg-background p-6 sm:p-8 group hover:bg-card transition-colors"
            >
              {feature.comingSoon && (
                <span className="absolute top-4 right-4 text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded border border-border bg-muted/60 text-muted-foreground">
                  Coming soon
                </span>
              )}
              <div className="w-11 sm:w-12 h-11 sm:h-12 rounded-lg bg-muted flex items-center justify-center mb-5 sm:mb-6 group-hover:bg-accent/10 transition-colors">
                <feature.icon className="w-5 sm:w-6 h-5 sm:h-6 text-accent" />
              </div>
              <h3 className="text-lg sm:text-xl font-semibold mb-2 sm:mb-3">{feature.title}</h3>
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

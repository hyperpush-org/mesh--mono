"use client"

import { useState } from "react"
import { motion } from "framer-motion"

const steps = [
  {
    number: "01",
    title: "Capture typed events",
    description: "Send error events over the authenticated ingestion API with stack traces, breadcrumbs, tags, and environment context.",
  },
  {
    number: "02",
    title: "Group related failures",
    description: "Fingerprint related events into issues and use live severity, status, and occurrence counts to prioritize the queue.",
  },
  {
    number: "03",
    title: "Inspect the evidence",
    description: "Review the recorded exception, stack trace, breadcrumbs, tags, environment, SDK, and session context without invented fallbacks.",
  },
  {
    number: "04",
    title: "Manage lifecycle state",
    description: "Resolve, reopen, or archive issues and acknowledge or resolve in-product alerts from the same project-scoped dashboard.",
  },
]

export function Flywheel() {
  const [activeIndex, setActiveIndex] = useState(0)

  return (
    <section id="workflow" className="relative py-20 sm:py-32 border-t border-border overflow-hidden">
      <div className="absolute top-0 right-0 w-1/2 h-full bg-accent/[0.02]" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-center">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <p className="text-sm font-mono text-accent mb-4 uppercase tracking-wider">How it works</p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-6 text-balance">
              From first event
              <br />
              to a managed issue.
            </h2>
            <p className="text-lg text-muted-foreground mb-4 text-pretty">
              hyperpush keeps recorded evidence and lifecycle state together so a team can move
              from detection to resolution without substituting sample data for missing backend facts.
            </p>
          </motion.div>

          <div className="relative">
            <div className="space-y-6">
              {steps.map((step, index) => {
                const isActive = activeIndex === index
                return (
                  <motion.div
                    key={step.number}
                    initial={{ opacity: 0, x: 20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                    onMouseEnter={() => setActiveIndex(index)}
                    onFocus={() => setActiveIndex(index)}
                    tabIndex={0}
                    className={`relative flex gap-4 sm:gap-6 p-4 sm:p-6 rounded-xl border backdrop-blur-sm transition-colors ${
                      isActive ? "border-accent/30 bg-card/50" : "border-border bg-card/50"
                    }`}
                  >
                    <span className={`text-3xl sm:text-5xl font-bold transition-colors shrink-0 ${isActive ? "text-accent/30" : "text-muted-foreground/20"}`}>
                      {step.number}
                    </span>
                    <div>
                      <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
                      <p className="text-muted-foreground">{step.description}</p>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

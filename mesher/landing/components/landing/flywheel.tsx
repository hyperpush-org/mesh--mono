"use client"

import { useState } from "react"
import { motion } from "framer-motion"

const steps = [
  {
    number: "01",
    title: "Capture the Full Context",
    description: "Add the SDK, then collect errors, stack traces, breadcrumbs, environment data, and performance signals from day one.",
  },
  {
    number: "02",
    title: "Group and Prioritize",
    description: "Fingerprint related events, rank issues by severity and user impact, and keep noisy duplicates out of the way.",
  },
  {
    number: "03",
    title: "Assign the Right Owner",
    description: "Route incidents to the responsible team with release, project, environment, and recent activity already attached.",
  },
  {
    number: "04",
    title: "Verify the Recovery",
    description: "Resolve the issue, monitor the next release, and confirm error rate and latency return to their expected baseline.",
  },
]

export function Flywheel() {
  const [activeIndex, setActiveIndex] = useState(0)

  function handleMouseEnter(index: number) {
    setActiveIndex(index)
  }

  function handleMouseLeave() {
    // keep the last hovered card active
  }

  return (
    <section id="workflow" className="relative py-20 sm:py-32 border-t border-border overflow-hidden">
      {/* Background accent */}
      <div className="absolute top-0 right-0 w-1/2 h-full bg-accent/[0.02]" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-center">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <p className="text-sm font-mono text-accent mb-4 uppercase tracking-wider">How It Works</p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-6 text-balance">
              From first signal
              <br />
              to verified recovery.
            </h2>
            <p className="text-lg text-muted-foreground mb-4 text-pretty">
              hyperpush keeps the evidence, ownership, and release context together so teams can move from detection to resolution without losing the thread.
            </p>
            <p className="text-muted-foreground mb-8 text-pretty">
              Every stage is built for operators: fewer duplicate alerts, clearer priorities, and a measurable path back to healthy software.
            </p>
          </motion.div>

          <div className="relative" onMouseLeave={handleMouseLeave}>
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
                    onMouseEnter={() => handleMouseEnter(index)}
                    className={`relative flex gap-4 sm:gap-6 p-4 sm:p-6 rounded-xl border backdrop-blur-sm transition-colors ${
                      isActive
                        ? "border-accent/30 bg-card/50"
                        : "border-border bg-card/50"
                    }`}
                  >
                    <span className={`text-3xl sm:text-5xl font-bold transition-colors shrink-0 ${
                      isActive ? "text-accent/30" : "text-muted-foreground/20"
                    }`}>
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

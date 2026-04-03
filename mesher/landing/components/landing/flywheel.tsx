"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { ArrowRight } from "lucide-react"

const steps = [
  {
    number: "01",
    title: "Install SDK & Track Errors",
    description: "Add hyperpush to your project with one command. Full error tracking, stack traces, performance monitoring, and session context from day one.",
  },
  {
    number: "02",
    title: "Earn From Your Token",
    description: "Launch a project token at no cost. A portion of trading activity flows into your project treasury automatically — funding bounties and development without spending a dime.",
  },
  {
    number: "03",
    title: "Surface Bugs Publicly",
    description: "Opt in to the public bug board. Errors are listed with bounties attached, giving community developers clear incentive to contribute fixes.",
  },
  {
    number: "04",
    title: "Contributors Fix & Earn",
    description: "A developer picks a bug, submits a PR, your team verifies the fix, and hyperpush distributes the bounty automatically. The project gets healthier, the developer gets paid.",
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
    <section id="flywheel" className="relative py-20 sm:py-32 border-t border-border overflow-hidden">
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
              Projects get funded.
              <br />
              Developers get paid.
            </h2>
            <p className="text-lg text-muted-foreground mb-4 text-pretty">
              More projects adopt hyperpush → more bugs surfaced → more developers fix them → 
              healthier software → more adoption. A cycle where every participant benefits.
            </p>
            <p className="text-muted-foreground mb-8 text-pretty">
              Projects build a sustainable treasury through their token. Developers earn bounties for every 
              verified fix. Open-source maintenance becomes financially viable for both sides.
            </p>
            <div className="flex items-center gap-2 text-accent font-medium">
              <span>Learn how payouts work</span>
              <ArrowRight className="w-4 h-4" />
            </div>
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

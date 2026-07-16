"use client"

import { motion } from "framer-motion"
import { Check } from "lucide-react"
import { WaitlistButton } from "@/components/landing/waitlist-dialog"

const tiers = [
  {
    name: "Starter",
    price: "Free",
    description: "Essential error tracking for evaluating hyperpush on a real application.",
    features: [
      "10K events/month",
      "One project",
      "30-day data retention",
      "Error grouping and stack traces",
      "Email alerts",
      "JavaScript, Node.js, Rust, Python, and Mesh SDKs",
    ],
    cta: "Join Waitlist",
    popular: false,
  },
  {
    name: "Pro",
    price: "$29",
    period: "/month",
    description: "Deeper analysis and release context for small production teams.",
    features: [
      "100K events/month",
      "60-day data retention",
      "AI root-cause analysis",
      "Performance monitoring",
      "Release health",
      "Five team members",
      "Priority email support",
    ],
    cta: "Join Waitlist",
    popular: true,
  },
  {
    name: "Pro+",
    price: "$100",
    period: "/month",
    description: "Higher limits, longer retention, and controls for larger teams.",
    features: [
      "1M events/month",
      "90-day data retention",
      "Higher AI analysis limits",
      "Unlimited team members",
      "Unlimited projects",
      "Audit logs and SSO",
      "Dedicated support",
    ],
    cta: "Join Waitlist",
    popular: false,
  },
]

export function Pricing() {
  return (
    <section id="pricing" className="relative border-t border-border py-20 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mx-auto mb-12 max-w-2xl text-center sm:mb-16"
        >
          <p className="mb-3 text-sm font-mono uppercase tracking-wider text-accent sm:mb-4">Pricing</p>
          <h2 className="mb-4 text-balance text-3xl font-bold tracking-tight sm:mb-6 sm:text-4xl md:text-5xl">
            Free to start.
            <br />
            <span className="text-muted-foreground">Scale when you need to.</span>
          </h2>
          <p className="text-pretty text-base text-muted-foreground sm:text-lg">
            Start with the core production workflow, then add volume, retention, and advanced
            analysis as your team grows.
          </p>
        </motion.div>

        <div className="flex flex-col gap-4 sm:grid sm:grid-cols-2 sm:gap-px sm:overflow-hidden sm:rounded-xl sm:bg-border lg:grid-cols-3">
          {tiers.map((tier, index) => (
            <motion.div
              key={tier.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className={`relative rounded-xl border p-6 sm:rounded-none sm:border-0 sm:p-8 ${
                tier.popular
                  ? "border-accent/30 bg-card sm:border-t-2 sm:border-t-accent"
                  : "border-border bg-background"
              }`}
            >
              {tier.popular && (
                <span className="absolute right-4 top-4 rounded bg-accent/10 px-2 py-1 text-xs font-mono text-accent">
                  Popular
                </span>
              )}

              <div className="mb-6 sm:mb-8">
                <h3 className="mb-2 text-xl font-semibold">{tier.name}</h3>
                <div className="mb-3 flex items-baseline gap-1">
                  <span className="text-3xl font-bold sm:text-4xl">{tier.price}</span>
                  {tier.period && <span className="text-muted-foreground">{tier.period}</span>}
                </div>
                <p className="text-sm text-muted-foreground">{tier.description}</p>
              </div>

              <ul className="mb-6 space-y-2.5 sm:mb-8 sm:space-y-3">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>

              <WaitlistButton className="w-full" variant={tier.popular ? "default" : "outline"}>
                {tier.cta}
              </WaitlistButton>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

"use client"

import { motion } from "framer-motion"
import { Check } from "lucide-react"
import { WaitlistButton } from "@/components/landing/waitlist-dialog"
import { livePublicCapabilities } from "@/lib/capabilities"

const includedCapabilities = livePublicCapabilities().filter(
  (capability) => !["authenticated-session", "project-context"].includes(capability.key),
)

export function Pricing() {
  return (
    <section id="pricing" className="relative border-t border-border py-20 sm:py-32">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mx-auto mb-12 max-w-2xl text-center sm:mb-16"
        >
          <p className="mb-3 text-sm font-mono uppercase tracking-wider text-accent sm:mb-4">Access</p>
          <h2 className="mb-4 text-balance text-3xl font-bold tracking-tight sm:mb-6 sm:text-4xl md:text-5xl">
            Private beta.
            <br />
            <span className="text-muted-foreground">No paid plans yet.</span>
          </h2>
          <p className="text-pretty text-base text-muted-foreground sm:text-lg">
            We have not published prices, usage allowances, or paid-plan entitlements. Join the
            waitlist for access to the capabilities that are live today.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-2xl rounded-xl border border-border bg-card p-6 sm:p-8"
        >
          <div className="mb-6 sm:mb-8">
            <span className="mb-4 inline-flex rounded border border-accent/20 bg-accent/10 px-2 py-1 text-xs font-mono uppercase tracking-wider text-accent">
              Current offer
            </span>
            <h3 className="mb-2 text-2xl font-semibold">Private beta access</h3>
            <p className="text-sm text-muted-foreground">
              Access is reviewed individually while the launch surface is validated.
            </p>
          </div>

          <ul className="mb-7 grid gap-3 sm:grid-cols-2 sm:mb-8">
            {includedCapabilities.map((capability) => (
              <li key={capability.key} className="flex items-start gap-3 text-sm">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <span className="text-muted-foreground">{capability.label}</span>
              </li>
            ))}
          </ul>

          <WaitlistButton className="w-full">Join Waitlist</WaitlistButton>
        </motion.div>
      </div>
    </section>
  )
}

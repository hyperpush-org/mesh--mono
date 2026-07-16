/* Business model slide — pricing tiers + product motion */
'use client'

import { motion } from 'framer-motion'
import type { SlideData } from '@/lib/pitch/deck-data'

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
}
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
}

interface Tier {
  name: string
  price: string
  detail: string
}

interface FlywheelStep {
  step: string
  text: string
}

export function BusinessModelSlide({ slide }: { slide: SlideData }) {
  const tiers = (slide.extra?.tiers ?? []) as Tier[]
  const flywheel = (slide.extra?.flywheel ?? []) as FlywheelStep[]

  return (
    <div className="flex h-full w-full items-center px-[120px]">
      <div className="pointer-events-none absolute right-[10%] bottom-[10%] h-[520px] w-[520px] rounded-full bg-accent/6 blur-[160px]" />

      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="relative z-10 w-full space-y-12"
      >
        <div className="space-y-5">
          <motion.div variants={fadeUp}>
            <span className="font-mono text-[16px] uppercase tracking-[0.3em] text-accent">
              {slide.eyebrow}
            </span>
          </motion.div>

          <motion.h2
            variants={fadeUp}
            className="text-[64px] font-semibold leading-[1.08] tracking-[-0.02em] text-foreground"
          >
            {slide.title}
          </motion.h2>
        </div>

        <div className="grid grid-cols-[1fr_1fr] items-start gap-16">
          {/* Pricing tiers */}
          <motion.div variants={fadeUp} className="space-y-6">
            <p className="font-mono text-[14px] uppercase tracking-[0.24em] text-muted-foreground">
              Pricing tiers
            </p>
            <div className="space-y-4">
              {tiers.map((t, i) => (
                <motion.div
                  key={t.name}
                  variants={fadeUp}
                  className={`flex items-center gap-6 rounded-xl border px-7 py-6 ${
                    i === 1
                      ? 'border-accent/25 bg-accent/[0.06]'
                      : 'border-border/80 bg-card/60'
                  }`}
                >
                  <div className="min-w-[110px]">
                    <p className="text-[16px] font-medium text-muted-foreground">{t.name}</p>
                    <p className="text-[32px] font-semibold tabular-nums text-foreground">
                      {t.price}
                    </p>
                  </div>
                  <p className="text-[18px] leading-[1.5] text-muted-foreground">{t.detail}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>

          <motion.div variants={fadeUp} className="space-y-6">
            <p className="font-mono text-[14px] uppercase tracking-[0.24em] text-muted-foreground">
              Product motion
            </p>

            <div className="space-y-5">
              {flywheel.map((step, index) => (
                <div key={step.step} className="flex items-start gap-5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 font-mono text-[16px] font-semibold text-accent">
                    {index + 1}
                  </div>
                  <div>
                    <p className="text-[20px] font-medium text-foreground">{step.step}</p>
                    <p className="mt-1 text-[18px] leading-[1.5] text-muted-foreground">{step.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  )
}

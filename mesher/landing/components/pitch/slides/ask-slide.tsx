/* Ask / CTA slide — the close */
'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { SlideData } from '@/lib/pitch/deck-data'

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
}
const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
}

interface Ask {
  label: string
  detail: string
}

export function AskSlide({ slide }: { slide: SlideData }) {
  const asks = (slide.extra?.asks ?? []) as Ask[]
  const close = (slide.extra?.close ?? '') as string

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-[140px]">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[700px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/10 blur-[200px]" />

      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="relative z-10 flex w-full max-w-[1400px] flex-col items-center gap-12 text-center"
      >
        <motion.div variants={fadeUp}>
          <span className="font-mono text-[16px] uppercase tracking-[0.3em] text-accent">
            {slide.eyebrow}
          </span>
        </motion.div>

        <motion.h2
          variants={fadeUp}
          className="max-w-[900px] text-[72px] font-semibold leading-[1.06] tracking-[-0.025em] text-foreground"
        >
          {slide.title}
        </motion.h2>

        {slide.subtitle && (
          <motion.p
            variants={fadeUp}
            className="max-w-[680px] text-[26px] leading-[1.5] text-muted-foreground"
          >
            {slide.subtitle}
          </motion.p>
        )}

        <motion.div variants={fadeUp} className="grid w-full max-w-[1300px] grid-cols-3 gap-7 pt-4">
          {asks.map((a) => (
            <div
              key={a.label}
              className="rounded-2xl border border-accent/15 bg-accent/[0.04] px-8 py-8 text-left"
            >
              <p className="text-[24px] font-semibold text-foreground">{a.label}</p>
              <p className="mt-3 text-[19px] leading-[1.5] text-muted-foreground">{a.detail}</p>
            </div>
          ))}
        </motion.div>

        {close && (
          <motion.p
            variants={fadeUp}
            className="max-w-[720px] text-[22px] font-medium italic leading-[1.5] text-muted-foreground"
          >
            &ldquo;{close}&rdquo;
          </motion.p>
        )}

        <motion.div variants={fadeUp} className="flex gap-5 pt-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 rounded-xl bg-accent px-8 py-4 text-[18px] font-medium text-accent-foreground transition-colors hover:bg-accent/90"
          >
            Explore hyperpush
            <ArrowRight className="h-5 w-5" />
          </Link>
        </motion.div>
      </motion.div>
    </div>
  )
}

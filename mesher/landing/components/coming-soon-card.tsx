"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"

type ComingSoonCardProps = {
  emoji: string
  title: string
  description: string
  titleTag?: "h1" | "h2" | "h3"
  primaryHref?: string
  primaryLabel?: string
}

export function ComingSoonCard({
  emoji,
  title,
  description,
  titleTag: TitleTag = "h1",
  primaryHref = "/",
  primaryLabel = "Back to home",
}: ComingSoonCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="w-full max-w-sm rounded-2xl border border-border bg-card/90 p-8 text-center shadow-2xl backdrop-blur-sm sm:max-w-md sm:p-10"
    >
      <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full border border-accent/20 bg-accent/5">
        <span className="text-2xl">{emoji}</span>
      </div>

      <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/5 px-3 py-1 text-xs font-mono uppercase tracking-wider text-accent">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
        Coming Soon
      </div>

      <TitleTag className="mb-3 text-2xl font-bold tracking-tight sm:text-3xl">{title}</TitleTag>
      <p className="mb-8 text-sm text-muted-foreground text-pretty sm:text-base">{description}</p>

      <div className="flex flex-col gap-3">
        <Button size="lg" className="w-full gap-2" asChild>
          <Link href={primaryHref}>
            <ArrowLeft className="h-4 w-4" />
            {primaryLabel}
          </Link>
        </Button>
      </div>
    </motion.div>
  )
}

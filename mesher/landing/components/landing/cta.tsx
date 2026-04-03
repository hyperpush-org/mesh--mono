"use client"

import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Github } from "lucide-react"
import { WaitlistButton } from "@/components/landing/waitlist-dialog"

export function CTA() {
  return (
    <section className="relative py-20 sm:py-32 border-t border-border overflow-hidden">
      {/* Grid background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
      
      {/* Gradient orb */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[400px] sm:w-[600px] h-[300px] sm:h-[400px] bg-accent/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-4 sm:mb-6 text-balance">
            Track errors. Fund your project.
            <br className="hidden sm:block" />
            <span className="sm:hidden"> </span>
            Reward the people who help.
          </h2>
          <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8 sm:mb-10 text-pretty">
            Open-source error tracking with built-in token economics for Solana and beyond. 
            Your project gets funded, contributors get paid, software gets healthier.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
            <WaitlistButton size="lg" className="h-11 sm:h-12 px-6 sm:px-8 gap-2 w-full sm:w-auto">
              Join Waitlist
            </WaitlistButton>
            <Button
              size="lg"
              variant="outline"
              className="h-11 sm:h-12 px-6 sm:px-8 gap-2 w-full sm:w-auto"
              asChild
            >
              <a href="https://github.com/hyperpush-dev/hyperpush" target="_blank" rel="noopener noreferrer">
                <Github className="w-4 h-4" />
                Star on GitHub
              </a>
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

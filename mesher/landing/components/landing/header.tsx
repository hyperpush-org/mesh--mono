"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Menu, X } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { WaitlistDialog } from "@/components/landing/waitlist-dialog"

const navigation = [
  { name: "Features", href: "#features" },
  { name: "Workflow", href: "#workflow" },
  { name: "Pricing", href: "#pricing" },
  { name: "Docs", href: "/docs" },
]

interface HeaderProps {
  /** Optional section label shown next to logo, e.g. "/docs" */
  section?: string
  /** Override the default max-width container class */
  maxWidth?: string
  /** Extra elements to render before the CTA button (desktop only) */
  extraActions?: React.ReactNode
}

export function Header({ section, maxWidth = "max-w-7xl", extraActions }: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [waitlistOpen, setWaitlistOpen] = useState(false)
  const waitlistTriggerRef = useRef<HTMLButtonElement | null>(null)

  function openWaitlist(event: React.MouseEvent<HTMLButtonElement>) {
    waitlistTriggerRef.current = event.currentTarget
    setWaitlistOpen(true)
  }

  function handleWaitlistOpenChange(next: boolean) {
    setWaitlistOpen(next)
    if (!next) setTimeout(() => waitlistTriggerRef.current?.focus(), 350)
  }

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <nav className={`mx-auto ${maxWidth} px-4 sm:px-6`}>
          <div className="flex items-center justify-between py-3">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-3 shrink-0">
              <Image
                src="/logo-light.svg"
                alt="hyperpush"
                width={132}
                height={28}
                loading="eager"
                fetchPriority="high"
                className="h-7"
              />
              {section && (
                <span className="text-sm text-muted-foreground font-mono hidden sm:inline">{section}</span>
              )}
            </Link>

            {/* Desktop navigation */}
            <div className="hidden md:flex items-center gap-6 lg:gap-8">
              {navigation.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {item.name}
                </Link>
              ))}
            </div>

            {/* Desktop CTA */}
            <div className="hidden md:flex items-center gap-3 lg:gap-4">
              {extraActions}
              <Button size="sm" onClick={openWaitlist}>
                Join Waitlist
              </Button>
            </div>

            {/* Mobile menu button */}
            <button
              type="button"
              className="md:hidden p-2 text-muted-foreground hover:text-foreground rounded-md"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>

          {/* Mobile menu */}
          <AnimatePresence>
            {mobileMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="md:hidden border-t border-border bg-background/95 backdrop-blur-md px-0 py-4"
              >
                <div className="space-y-1">
                  {navigation.map((item) => (
                    <Link
                      key={item.name}
                      href={item.href}
                      className="block px-2 py-3 text-base text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted/50"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {item.name}
                    </Link>
                  ))}
                  <div className="pt-3 border-t border-border">
                    <Button
                      className="w-full"
                      onClick={(event) => {
                        waitlistTriggerRef.current = event.currentTarget
                        setMobileMenuOpen(false)
                        setWaitlistOpen(true)
                      }}
                    >
                      Join Waitlist
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </nav>
      </header>

      <WaitlistDialog open={waitlistOpen} onOpenChange={handleWaitlistOpenChange} />
    </>
  )
}

"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react"
import type { SVGProps } from "react"

function DiscordIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface WaitlistDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Status = "idle" | "loading" | "success" | "error"

/* ------------------------------------------------------------------ */
/*  Form logic                                                         */
/* ------------------------------------------------------------------ */

const FORMSPREE_ID = process.env.NEXT_PUBLIC_FORMSPREE_ID

async function submitToFormspree(name: string, email: string): Promise<void> {
  const res = await fetch(`https://formspree.io/f/${FORMSPREE_ID}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ name, email, _subject: "New waitlist signup — hyperpush" }),
  })
  if (!res.ok) throw new Error("Submission failed")
}

async function submitMailto(name: string, email: string): Promise<void> {
  // Fallback: open the user's mail client pre-filled
  const mailto = `mailto:${process.env.NEXT_PUBLIC_WAITLIST_EMAIL ?? "waitlist@hyperpush.dev"}?subject=Waitlist%20signup&body=Name%3A%20${encodeURIComponent(name)}%0AEmail%3A%20${encodeURIComponent(email)}`
  window.location.href = mailto
}

/* ------------------------------------------------------------------ */
/*  Dialog content                                                     */
/* ------------------------------------------------------------------ */

export function WaitlistDialog({ open, onOpenChange }: WaitlistDialogProps) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<Status>("idle")
  const [errorMsg, setErrorMsg] = useState("")

  const discordUrl = process.env.NEXT_PUBLIC_DISCORD_URL ?? "https://discord.gg/hyperpush"

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return

    setStatus("loading")
    setErrorMsg("")

    try {
      if (FORMSPREE_ID) {
        await submitToFormspree(name, email)
      } else {
        await submitMailto(name, email)
      }
      setStatus("success")
    } catch {
      setStatus("error")
      setErrorMsg("Something went wrong. Try again or join via Discord below.")
    }
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next)
    if (!next) {
      setTimeout(() => {
        setName("")
        setEmail("")
        setStatus("idle")
        setErrorMsg("")
      }, 300)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        {status === "success" ? (
          <div className="flex flex-col items-center text-center py-4 gap-4">
            <div className="w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center">
              <CheckCircle2 className="w-7 h-7 text-accent" />
            </div>
            <div>
              <h2 className="text-xl font-bold mb-2">You&apos;re on the list!</h2>
              <p className="text-muted-foreground text-sm">
                We&apos;ll reach out when hyperpush launches. In the meantime, join our community.
              </p>
            </div>
            <a
              href={discordUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full"
            >
              <Button className="w-full gap-2" variant="outline">
                <DiscordIcon className="w-4 h-4 text-[#5865F2]" />
                Join our Discord
                <ArrowRight className="w-4 h-4 ml-auto" />
              </Button>
            </a>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl">
                <span className="text-accent mr-1.5">✦</span> Join the Waitlist
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Be first when hyperpush launches. No spam — just a ping when you can get in.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <Label htmlFor="waitlist-name" className="text-sm">
                  Name <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                  id="waitlist-name"
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={status === "loading"}
                  className="bg-background border-border"
                  autoComplete="name"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="waitlist-email" className="text-sm">
                  Email <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="waitlist-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={status === "loading"}
                  className="bg-background border-border"
                  autoComplete="email"
                />
              </div>

              {errorMsg && (
                <p className="text-sm text-destructive">{errorMsg}</p>
              )}

              <Button
                type="submit"
                className="w-full gap-2"
                disabled={status === "loading" || !email}
              >
                {status === "loading" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    Join Waitlist
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </form>

            <div className="relative my-1">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">or</span>
              </div>
            </div>

            <a
              href={discordUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" className="w-full gap-2">
                <DiscordIcon className="w-4 h-4 text-[#5865F2]" />
                Join our Discord community
              </Button>
            </a>

            {!FORMSPREE_ID && (
              <p className="text-xs text-muted-foreground/50 text-center">
                Set NEXT_PUBLIC_FORMSPREE_ID to enable email capture
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/*  Convenience wrapper — drop-in replacement for any Button           */
/* ------------------------------------------------------------------ */

interface WaitlistButtonProps {
  size?: "default" | "sm" | "lg" | "icon"
  variant?: "default" | "outline" | "ghost" | "secondary"
  className?: string
  children?: React.ReactNode
}

export function WaitlistButton({ size, variant, className, children }: WaitlistButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        size={size}
        variant={variant}
        className={className}
        onClick={() => setOpen(true)}
      >
        {children ?? "Join Waitlist"}
      </Button>
      <WaitlistDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

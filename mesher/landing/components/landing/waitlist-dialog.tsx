"use client"

import { useState } from "react"
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface WaitlistDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Status = "idle" | "loading" | "success" | "error"

function resolveFormspreeTarget(value?: string): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  if (trimmed.startsWith("https://formspree.io/")) return trimmed.replace(/\/+$/, "")
  if (trimmed.startsWith("f/")) return `https://formspree.io/${trimmed}`
  return `https://formspree.io/f/${trimmed}`
}

const FORMSPREE_TARGET = resolveFormspreeTarget(process.env.NEXT_PUBLIC_FORMSPREE_ID)

async function submitToFormspree(name: string, email: string): Promise<void> {
  if (!FORMSPREE_TARGET) throw new Error("Formspree is not configured")

  const response = await fetch(FORMSPREE_TARGET, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ name, email, _subject: "New waitlist signup — hyperpush" }),
  })
  if (!response.ok) throw new Error("Submission failed")
}

async function submitMailto(name: string, email: string): Promise<void> {
  const recipient = process.env.NEXT_PUBLIC_WAITLIST_EMAIL ?? "yurlovandrew@gmail.com"
  const body = `Name%3A%20${encodeURIComponent(name)}%0AEmail%3A%20${encodeURIComponent(email)}`
  window.location.href = `mailto:${recipient}?subject=Waitlist%20signup&body=${body}`
}

export function WaitlistDialog({ open, onOpenChange }: WaitlistDialogProps) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<Status>("idle")
  const [errorMessage, setErrorMessage] = useState("")

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!email) return

    setStatus("loading")
    setErrorMessage("")

    try {
      if (FORMSPREE_TARGET) await submitToFormspree(name, email)
      else await submitMailto(name, email)
      setStatus("success")
    } catch {
      setStatus("error")
      setErrorMessage("Something went wrong. Please try again.")
    }
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next)
    if (!next) {
      setTimeout(() => {
        setName("")
        setEmail("")
        setStatus("idle")
        setErrorMessage("")
      }, 300)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="border-border bg-card sm:max-w-md">
        {status === "success" ? (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/10">
              <CheckCircle2 className="h-7 w-7 text-accent" />
            </div>
            <div>
              <h2 className="mb-2 text-xl font-bold">You&apos;re on the list!</h2>
              <p className="text-sm text-muted-foreground">
                We&apos;ll email you as soon as access is ready.
              </p>
            </div>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl">
                <span className="mr-1.5 text-accent">✦</span> Join the Waitlist
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Be first when hyperpush launches. No spam — just a note when you can get in.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="mt-2 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="waitlist-name" className="text-sm">
                  Name <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="waitlist-name"
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={status === "loading"}
                  className="border-border bg-background"
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
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  disabled={status === "loading"}
                  className="border-border bg-background"
                  autoComplete="email"
                />
              </div>

              {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}

              <Button type="submit" className="w-full gap-2" disabled={status === "loading" || !email}>
                {status === "loading" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    Join Waitlist
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </form>

            {!FORMSPREE_TARGET && (
              <p className="text-center text-xs text-muted-foreground/50">
                Set NEXT_PUBLIC_FORMSPREE_ID to enable email capture
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

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
      <Button size={size} variant={variant} className={className} onClick={() => setOpen(true)}>
        {children ?? "Join Waitlist"}
      </Button>
      <WaitlistDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

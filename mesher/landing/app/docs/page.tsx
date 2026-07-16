"use client"

import { ComingSoonCard } from "@/components/coming-soon-card"

export default function DocsPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div
        className="pointer-events-none absolute inset-0 select-none overflow-hidden"
        aria-hidden="true"
      >
        <div className="absolute left-0 top-0 bottom-0 w-64 space-y-6 border-r border-border bg-card/50 p-8 opacity-40">
          <div className="h-6 w-24 rounded bg-muted/60" />
          {[
            "Getting Started",
            "SDKs",
            "Error Tracking",
            "Performance",
            "Releases",
            "Alerts",
            "Platform",
          ].map((section) => (
            <div key={section} className="space-y-2">
              <div className="h-3 w-20 rounded bg-accent/20" />
              {[1, 2, 3].map((index) => (
                <div
                  key={index}
                  className="h-3 rounded bg-muted/40"
                  style={{ width: `${55 + index * 15}%` }}
                />
              ))}
            </div>
          ))}
        </div>

        <div className="ml-64 space-y-6 p-16 opacity-40">
          <div className="h-4 w-40 rounded bg-accent/20" />
          <div className="h-12 w-96 rounded bg-muted/40" />
          <div className="max-w-2xl space-y-2">
            {[90, 85, 70, 85, 60].map((width, index) => (
              <div
                key={index}
                className="h-3 rounded bg-muted/30"
                style={{ width: `${width}%` }}
              />
            ))}
          </div>
          <div className="mt-8 h-40 max-w-2xl rounded-xl border border-border bg-card/30" />
          <div className="mt-4 max-w-2xl space-y-2">
            {[80, 75, 65].map((width, index) => (
              <div
                key={index}
                className="h-3 rounded bg-muted/30"
                style={{ width: `${width}%` }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="absolute inset-0 bg-background/70 backdrop-blur-[6px]" />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4">
        <ComingSoonCard
          emoji="📖"
          title="Docs are on their way"
          description="We're writing comprehensive documentation for hyperpush. Join the waitlist and we'll let you know when it's ready."
        />
      </div>
    </div>
  )
}

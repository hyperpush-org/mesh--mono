"use client"

import { motion } from "framer-motion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowUpRight, Clock } from "lucide-react"

const bugs = [
  {
    id: "MSH-1024",
    title: "Transaction signature verification failed on mainnet",
    project: "solana-dex",
    severity: "critical",
    bounty: "$250",
    timeOpen: "2h 14m",
  },
  {
    id: "MSH-1023",
    title: "RPC connection timeout after priority fee spike",
    project: "defi-aggregator",
    severity: "high",
    bounty: "$150",
    timeOpen: "4h 32m",
  },
  {
    id: "MSH-1022",
    title: "Priority fee calculation returns negative value",
    project: "nft-marketplace",
    severity: "medium",
    bounty: "$75",
    timeOpen: "8h 15m",
  },
  {
    id: "MSH-1021",
    title: "Session replay missing mouse events on wallet connect",
    project: "trading-platform",
    severity: "low",
    bounty: "$25",
    timeOpen: "1d 3h",
  },
]

const severityColors: Record<string, string> = {
  critical: "bg-destructive/20 text-destructive border-destructive/30",
  high: "bg-chart-5/20 text-chart-5 border-chart-5/30",
  medium: "bg-chart-4/20 text-chart-4 border-chart-4/30",
  low: "bg-muted text-muted-foreground border-border",
}

export function BugBoard() {
  return (
    <section id="board" className="relative py-20 sm:py-32 border-t border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-2xl mx-auto mb-16"
        >
          <p className="text-sm font-mono text-accent mb-4 uppercase tracking-wider">Public Bug Board</p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-6 text-balance">
            Browse bugs. Pick one. Get paid.
          </h2>
          <p className="text-lg text-muted-foreground text-pretty">
            Live issues from opt-in projects with bounties attached. Find a bug you can fix, 
            submit a PR, and earn when it&apos;s verified — projects get healthier, you get paid.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="rounded-xl border border-border bg-card overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-3 sm:p-4 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2 sm:gap-4">
              <h3 className="font-semibold text-sm sm:text-base">Live Issues</h3>
              <Badge variant="outline" className="font-mono text-xs text-accent border-accent/30">
                47 Open
              </Badge>
            </div>
            <Button variant="ghost" size="sm" className="gap-1.5 sm:gap-2 text-muted-foreground text-xs sm:text-sm px-2 sm:px-3">
              View All
              <ArrowUpRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </Button>
          </div>

          {/* Table */}
          <div className="divide-y divide-border">
            {bugs.map((bug, index) => (
              <motion.div
                key={bug.id}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 hover:bg-muted/20 transition-colors cursor-pointer group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 sm:gap-3 mb-1 flex-wrap">
                    <span className="text-xs font-mono text-muted-foreground">{bug.id}</span>
                    <Badge className={`text-xs ${severityColors[bug.severity]}`}>
                      {bug.severity}
                    </Badge>
                  </div>
                  <p className="font-medium text-sm sm:text-base truncate group-hover:text-accent transition-colors">
                    {bug.title}
                  </p>
                  <p className="text-xs sm:text-sm text-muted-foreground font-mono">{bug.project}</p>
                </div>

                <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  {bug.timeOpen}
                </div>

                <div className="text-right shrink-0">
                  <p className="font-semibold text-sm sm:text-base text-foreground">{bug.bounty}</p>
                  <p className="text-xs text-muted-foreground">Bounty</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}

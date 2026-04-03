"use client"

import { useEffect, useRef } from "react"
import { motion, useInView } from "framer-motion"

function MeshBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(containerRef, { once: false, amount: 0.1 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !containerRef.current) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let width = 0
    let height = 0
    let dpr = 1

    interface Node {
      x: number; y: number; vx: number; vy: number
      baseX: number; baseY: number
      radius: number; pulse: number; pulseSpeed: number
      tier: number // 0=core, 1=inner, 2=outer, 3=fringe
    }

    interface Particle {
      fromIdx: number; toIdx: number; progress: number; speed: number
    }

    let nodes: Node[] = []
    let particles: Particle[] = []
    let time = 0

    function initNodes() {
      nodes = []
      particles = []

      // Cluster center — right half, aligned with text content
      const cx = width * 0.75
      const cy = height * 0.38 + 80

      const layers = [
        { count: 6,  radius: 60,  tier: 0 },  // core
        { count: 12, radius: 140, tier: 1 },  // inner ring
        { count: 18, radius: 260, tier: 2 },  // outer ring
        { count: 14, radius: 400, tier: 3 },  // fringe — sparse, fading
      ]

      for (const layer of layers) {
        for (let i = 0; i < layer.count; i++) {
          const angle = (Math.PI * 2 * i) / layer.count + (Math.random() - 0.5) * 0.8
          const dist = layer.radius * (0.7 + Math.random() * 0.6)
          const x = cx + Math.cos(angle) * dist
          const y = cy + Math.sin(angle) * dist

          nodes.push({
            x, y,
            baseX: x, baseY: y,
            vx: (Math.random() - 0.5) * 0.15,
            vy: (Math.random() - 0.5) * 0.15,
            radius: layer.tier === 0 ? 3.5 : layer.tier === 1 ? 3 : layer.tier === 2 ? 2.5 : 2,
            pulse: Math.random() * Math.PI * 2,
            pulseSpeed: 0.015 + Math.random() * 0.02,
            tier: layer.tier,
          })
        }
      }
    }

    function resize() {
      if (!canvas || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      dpr = window.devicePixelRatio || 1
      width = rect.width
      height = rect.height
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      initNodes()
    }

    resize()
    window.addEventListener("resize", resize)

    function spawnParticle() {
      if (particles.length > 8) return
      // Prefer connections through inner nodes
      const candidates = nodes.map((_, i) => i).filter(i => nodes[i].tier <= 2)
      const fromIdx = candidates[Math.floor(Math.random() * candidates.length)]
      let toIdx = candidates[Math.floor(Math.random() * candidates.length)]
      if (toIdx === fromIdx) return

      const dx = nodes[toIdx].x - nodes[fromIdx].x
      const dy = nodes[toIdx].y - nodes[fromIdx].y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < 320) {
        particles.push({
          fromIdx, toIdx,
          progress: 0,
          speed: 0.005 + Math.random() * 0.01,
        })
      }
    }

    function draw() {
      if (!ctx) return
      ctx.clearRect(0, 0, width, height)
      time++

      // Drift nodes gently around their base position
      for (const node of nodes) {
        node.pulse += node.pulseSpeed
        node.x = node.baseX + Math.sin(time * 0.008 + node.pulse) * (8 + node.tier * 4)
        node.y = node.baseY + Math.cos(time * 0.006 + node.pulse * 1.3) * (6 + node.tier * 3)
      }

      // Draw connections — closer & more central = brighter
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i]
          const b = nodes[j]
          const dx = b.x - a.x
          const dy = b.y - a.y
          const dist = Math.sqrt(dx * dx + dy * dy)

          const maxDist = a.tier <= 1 && b.tier <= 1 ? 220 : a.tier <= 2 && b.tier <= 2 ? 200 : 160
          if (dist > maxDist) continue

          // Fade by distance and tier
          const distFade = 1 - dist / maxDist
          const tierFade = 1 - (Math.max(a.tier, b.tier) * 0.22)
          const alpha = distFade * tierFade * 0.18

          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
          ctx.strokeStyle = `rgba(89, 193, 132, ${alpha})`
          ctx.lineWidth = a.tier <= 1 && b.tier <= 1 ? 1.2 : 0.8
          ctx.stroke()
        }
      }

      // Message particles
      if (Math.random() < 0.03) spawnParticle()

      for (let p = particles.length - 1; p >= 0; p--) {
        const particle = particles[p]
        particle.progress += particle.speed
        if (particle.progress >= 1) { particles.splice(p, 1); continue }

        const from = nodes[particle.fromIdx]
        const to = nodes[particle.toIdx]
        const px = from.x + (to.x - from.x) * particle.progress
        const py = from.y + (to.y - from.y) * particle.progress
        const alpha = Math.sin(particle.progress * Math.PI)

        // Glow
        const grad = ctx.createRadialGradient(px, py, 0, px, py, 12)
        grad.addColorStop(0, `rgba(89, 193, 132, ${alpha * 0.3})`)
        grad.addColorStop(1, "rgba(89, 193, 132, 0)")
        ctx.beginPath()
        ctx.arc(px, py, 12, 0, Math.PI * 2)
        ctx.fillStyle = grad
        ctx.fill()

        // Dot
        ctx.beginPath()
        ctx.arc(px, py, 2.5, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(89, 193, 132, ${alpha * 0.9})`
        ctx.fill()

        // Trail
        const tp = Math.max(0, particle.progress - 0.06)
        ctx.beginPath()
        ctx.moveTo(from.x + (to.x - from.x) * tp, from.y + (to.y - from.y) * tp)
        ctx.lineTo(px, py)
        ctx.strokeStyle = `rgba(89, 193, 132, ${alpha * 0.3})`
        ctx.lineWidth = 1.5
        ctx.stroke()
      }

      // Draw nodes
      for (const node of nodes) {
        const pulseScale = 1 + Math.sin(node.pulse) * 0.2
        const r = node.radius * pulseScale

        // All nodes get a subtle glow, stronger for inner tiers
        if (node.tier <= 2) {
          const glowSize = node.tier === 0 ? 20 : node.tier === 1 ? 14 : 8
          const glowAlpha = node.tier === 0 ? 0.08 : node.tier === 1 ? 0.05 : 0.03
          const grad = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, glowSize)
          grad.addColorStop(0, `rgba(89, 193, 132, ${glowAlpha})`)
          grad.addColorStop(1, "rgba(89, 193, 132, 0)")
          ctx.beginPath()
          ctx.arc(node.x, node.y, glowSize, 0, Math.PI * 2)
          ctx.fillStyle = grad
          ctx.fill()
        }

        // Node dot
        const tierAlpha = node.tier === 0 ? 0.85 : node.tier === 1 ? 0.6 : node.tier === 2 ? 0.35 : 0.15
        ctx.beginPath()
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2)
        ctx.fillStyle = node.tier <= 1
          ? `rgba(89, 193, 132, ${tierAlpha + Math.sin(node.pulse) * 0.15})`
          : `rgba(255, 255, 255, ${tierAlpha})`
        ctx.fill()
      }

      animationRef.current = requestAnimationFrame(draw)
    }

    if (isInView) {
      draw()
    }

    return () => {
      cancelAnimationFrame(animationRef.current)
      window.removeEventListener("resize", resize)
    }
  }, [isInView])

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none">
      <canvas ref={canvasRef} className="absolute inset-0" />
      {/* Radial fade so the cluster dissolves at edges */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_60%_at_75%_45%,transparent_0%,var(--background)_70%)]" />
    </div>
  )
}

export function Infrastructure() {
  return (
    <section className="relative py-20 sm:py-32 border-t border-border overflow-hidden">
      {/* Full-bleed mesh background */}
      <MeshBackground />

      {/* Soft ambient glow behind the cluster center */}
      <div className="absolute top-[38%] right-[12%] -translate-y-1/2 w-[500px] h-[500px] bg-accent/[0.04] rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-center">
          {/* Left — copy */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <p className="text-sm font-mono text-accent mb-4 uppercase tracking-wider">Infrastructure</p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-6 text-balance">
              Powered by Mesh.
              <br />
              <span className="text-muted-foreground">Built for millions of events.</span>
            </h2>
            <p className="text-lg text-muted-foreground mb-4 text-pretty">
              hyperpush runs on <strong className="text-foreground">Mesh</strong> — a systems language with 
              Elixir&apos;s fault-tolerant actor model and the raw speed of compiled code. Every error event 
              is handled by its own lightweight process that can&apos;t take down the system.
            </p>
            <p className="text-muted-foreground mb-8 text-pretty">
              The same concurrency model that makes Erlang/Elixir legendary for uptime, but 
              <strong className="text-foreground"> 140% faster</strong> on equivalent workloads. Millions 
              of concurrent processes, sub-millisecond spawn times, and automatic supervision trees 
              that self-heal on failure.
            </p>
          </motion.div>

          {/* Right — empty space where the mesh renders through */}
          <div className="hidden lg:block" aria-hidden="true" />
        </div>
      </div>
    </section>
  )
}

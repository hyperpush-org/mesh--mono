import { Header } from "@/components/landing/header"
import { Hero } from "@/components/landing/hero"
import { Features } from "@/components/landing/features"
import { Infrastructure } from "@/components/landing/infrastructure"
import { Flywheel } from "@/components/landing/flywheel"
import { Pricing } from "@/components/landing/pricing"
import { CTA } from "@/components/landing/cta"
import { Footer } from "@/components/landing/footer"

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <Header />
      <Hero />
      <Features />
      <Infrastructure />
      <Flywheel />
      <Pricing />
      <CTA />
      <Footer />
    </main>
  )
}

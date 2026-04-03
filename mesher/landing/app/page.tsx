import { Header } from "@/components/landing/header"
import { Hero } from "@/components/landing/hero"
import { OSSProgram } from "@/components/landing/oss-program"
import { Features } from "@/components/landing/features"
import { Infrastructure } from "@/components/landing/infrastructure"
import { Flywheel } from "@/components/landing/flywheel"
import { BugBoard } from "@/components/landing/bug-board"
import { Pricing } from "@/components/landing/pricing"
import { CTA } from "@/components/landing/cta"
import { Footer } from "@/components/landing/footer"

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <Header />
      <Hero />
      {/* <OSSProgram /> */}
      <Features />
      <Infrastructure />
      <Flywheel />
      <BugBoard />
      <Pricing />
      <CTA />
      <Footer />
    </main>
  )
}

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Droplets, Zap, Gauge } from 'lucide-vue-next'
import { useScrollReveal } from '@/composables/useScrollReveal'

const { observe } = useScrollReveal()
const cards = ref<HTMLElement[]>([])

const comparisons = [
  {
    icon: Droplets,
    label: 'vs Elixir',
    tagline: 'Static types, native speed',
    description:
      'Mesh shares Elixir\'s actor model and let-it-crash philosophy, adding static type inference. No runtime type surprises, no Dialyzer setup, and code compiles to native binaries instead of running on the BEAM VM.',
    pros: ['Type inference', 'Native binaries', 'Same actor model'],
    featured: true,
  },
  {
    icon: Gauge,
    label: 'vs Go',
    tagline: 'Distribution built-in',
    description:
      'Go\'s goroutines are fast but distribution still requires Redis, queues, or external systems. In Mesh, @cluster and HTTP.clustered(...) are built in — failover, load balancing, and exactly-once semantics with zero infrastructure.',
    pros: ['@cluster decorator', 'Auto-failover', 'No external queue'],
    featured: false,
  },
  {
    icon: Zap,
    label: 'vs Node.js',
    tagline: 'True multi-node concurrency',
    description:
      'Node.js is single-threaded and requires cluster modules, Redis, and worker_threads just to scale. Mesh has native multi-core actors, multi-node distribution, and type safety without the TypeScript toolchain overhead.',
    pros: ['True parallelism', 'Native distribution', 'No build step'],
    featured: false,
  },
]

onMounted(() => {
  cards.value.forEach((el) => {
    if (el) observe(el)
  })
})
</script>

<template>
  <section class="relative border-t border-border py-20 md:py-28">
    <div class="mx-auto max-w-5xl px-4">
      <!-- Section header -->
      <div class="text-center">
        <div class="text-sm font-mono uppercase tracking-widest text-muted-foreground">Comparison</div>
        <h2 class="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
          Why Mesh?
        </h2>
        <p class="mx-auto mt-4 max-w-lg text-lg text-muted-foreground">
          Distribution as a first-class language feature changes how you build servers.
        </p>
      </div>

      <!-- Elixir callout removed per feedback -->

      <div class="mt-10 grid gap-5 md:grid-cols-3">
        <div
          v-for="(comparison, index) in comparisons"
          :key="comparison.label"
          :ref="(el) => { if (el) cards[index] = el as HTMLElement }"
          class="reveal group rounded-xl border bg-card p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
          :class="[
            comparison.featured
              ? 'border-foreground/25 ring-1 ring-foreground/10 hover:border-foreground/40'
              : 'border-border hover:border-foreground/20',
            `reveal-delay-${index + 1}`,
          ]"
        >
          <!-- Icon + featured badge inline -->
          <div class="mb-5 flex items-center gap-3">
            <div class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-foreground/[0.06] dark:bg-foreground/[0.08] text-foreground transition-colors group-hover:bg-foreground/[0.1]">
              <component :is="comparison.icon" class="size-5" :stroke-width="1.75" />
            </div>
            <span v-if="comparison.featured" class="inline-flex items-center gap-1.5 rounded-md border border-foreground/15 bg-foreground/[0.06] px-2 py-0.5 text-[11px] font-medium text-foreground/70">
              <span class="inline-block size-1.5 rounded-full bg-foreground/50" />
              Closest architecture
            </span>
          </div>

          <div class="inline-flex items-center rounded-md bg-foreground text-background px-3 py-1.5 text-sm font-bold">
            {{ comparison.label }}
          </div>
          <p class="mt-1.5 text-xs font-medium text-muted-foreground">{{ comparison.tagline }}</p>

          <p class="mt-4 text-sm leading-relaxed text-muted-foreground">
            {{ comparison.description }}
          </p>

          <!-- Advantage tags -->
          <div class="mt-5 flex flex-wrap gap-1.5">
            <span
              v-for="pro in comparison.pros"
              :key="pro"
              class="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
            >
              {{ pro }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

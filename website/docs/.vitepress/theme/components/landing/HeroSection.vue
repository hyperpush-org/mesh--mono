<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useData } from 'vitepress'
import { Button } from '@/components/ui/button'
import { getHighlighter, highlightCode } from '@/composables/useShiki'
import { ArrowRight, Github } from 'lucide-vue-next'

const { theme } = useData()

const highlightedHtml = ref('')

const heroCode = `# work.mpl
@cluster pub fn add() -> Int do
  1 + 1
end

# api/router.mpl
from Api.Todos import handle_get_todo, handle_list_todos

pub fn build_router() do
  HTTP.router()
    |> HTTP.on_get("/todos", HTTP.clustered(handle_list_todos))
    |> HTTP.on_get("/todos/:id", HTTP.clustered(handle_get_todo))
end`

onMounted(async () => {
  try {
    const hl = await getHighlighter()
    highlightedHtml.value = highlightCode(hl, heroCode)
  } catch {
    // Highlighting failed -- raw code fallback remains visible
  }
})
</script>

<template>
  <section class="relative overflow-x-clip">
    <!-- Layered background: radial vignette + subtle grid -->
    <div class="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,var(--border),transparent_70%)] opacity-60" />
    <div class="absolute inset-0 opacity-[0.02] dark:opacity-[0.04]" style="background-image: linear-gradient(var(--foreground) 1px, transparent 1px), linear-gradient(90deg, var(--foreground) 1px, transparent 1px); background-size: 48px 48px;" />

    <div class="relative mx-auto max-w-6xl px-6 pt-16 pb-20 md:pt-20 lg:pt-28 md:pb-28">
      <div class="grid items-center gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
        <!-- Left column: text -->
        <div class="text-center lg:text-left animate-fade-in-up">
          <!-- Version badge -->
          <div class="mb-8 inline-flex items-center gap-2 rounded-full border border-border bg-card/80 backdrop-blur-sm px-3.5 py-1.5 text-xs font-medium text-muted-foreground shadow-sm">
            <span class="relative inline-flex size-2">
              <span class="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500/50" />
              <span class="relative inline-block size-2 rounded-full bg-emerald-500" />
            </span>
            Now in development &mdash; v{{ theme.meshVersion }}
          </div>

          <h1 class="text-[1.75rem] font-extrabold tracking-tight text-foreground sm:text-5xl lg:text-[4.25rem]" style="line-height: 1.1;">
            The language built for
            <span class="relative inline-block">
              distributed systems.
              <svg class="absolute -bottom-1 left-0 w-full h-3 text-foreground/15" viewBox="0 0 200 12" preserveAspectRatio="none">
                <path d="M0 9 Q50 0 100 7 Q150 14 200 5" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/>
              </svg>
            </span>
          </h1>

          <p class="mx-auto mt-6 max-w-lg text-lg text-muted-foreground sm:text-xl lg:mx-0" style="line-height: 1.7;">
            One annotation to distribute work across a fleet. Built-in failover, load balancing, and everything a server needs — no orchestration layer required.
          </p>

          <div class="mt-10 flex items-center justify-center gap-3 lg:justify-start">
            <Button as="a" href="/docs/getting-started/" size="lg" class="h-12 px-8 rounded-lg text-base font-semibold shadow-md hover:shadow-lg transition-shadow">
              Get Started
              <ArrowRight class="ml-1.5 size-4" />
            </Button>
            <Button as="a" href="https://github.com/snowdamiz/mesh-lang" variant="outline" size="lg" class="h-12 px-8 rounded-lg text-base font-semibold">
              <Github class="mr-1.5 size-4" />
              GitHub
            </Button>
          </div>
        </div>

        <!-- Right column: code block -->
        <div class="relative animate-fade-in-up" style="animation-delay: 200ms;">
          <!-- Terminal -->
          <div class="relative overflow-hidden rounded-xl border border-border bg-card shadow-2xl ring-1 ring-foreground/[0.05]">
            <!-- Terminal header -->
            <div class="flex items-center gap-2 border-b border-border px-4 py-3 bg-muted/30">
              <div class="flex gap-1.5">
                <div class="size-3 rounded-full bg-[#ff5f57] shadow-[inset_0_-1px_0_rgba(0,0,0,0.12)]" />
                <div class="size-3 rounded-full bg-[#febc2e] shadow-[inset_0_-1px_0_rgba(0,0,0,0.12)]" />
                <div class="size-3 rounded-full bg-[#28c840] shadow-[inset_0_-1px_0_rgba(0,0,0,0.12)]" />
              </div>
              <span class="ml-2 text-xs text-muted-foreground font-medium">clustered starter</span>
            </div>
            <!-- Code content -->
            <div v-if="highlightedHtml" v-html="highlightedHtml" class="vp-code [&_pre]:px-5 [&_pre]:py-4 [&_pre]:!bg-transparent" />
            <pre v-else class="overflow-x-auto px-5 py-4 text-sm leading-relaxed text-foreground font-mono"><code>{{ heroCode }}</code></pre>
          </div>

          <!-- Floating language tag -->
          <div class="absolute -bottom-3 -right-3 md:-bottom-4 md:-right-4 rounded-lg border border-border bg-card px-3 py-1.5 shadow-lg text-xs font-mono text-muted-foreground animate-float" style="animation-delay: 1s;">
            .mpl
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

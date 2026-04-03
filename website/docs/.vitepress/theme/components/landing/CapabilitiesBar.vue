<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Network, Cpu, Shield, Package } from 'lucide-vue-next'
import { useScrollReveal } from '@/composables/useScrollReveal'

const { observe } = useScrollReveal()
const items = ref<HTMLElement[]>([])

const capabilities = [
  { icon: Network, stat: 'Auto-Failover', description: 'Runtime-owned recovery', detail: 'No manual retries' },
  { icon: Cpu, stat: 'LLVM Native', description: 'Compiled binaries', detail: 'No VM overhead' },
  { icon: Shield, stat: 'Type-Safe', description: 'Full inference', detail: 'Hindley-Milner' },
  { icon: Package, stat: 'Batteries Included', description: 'HTTP, Postgres, WS', detail: 'Full server stdlib' },
]

onMounted(() => {
  items.value.forEach((el) => {
    if (el) observe(el)
  })
})
</script>

<template>
  <section class="border-y border-border bg-muted/30 py-14 md:py-18">
    <div class="mx-auto max-w-5xl px-4">
      <div class="grid grid-cols-2 gap-6 md:grid-cols-4 md:gap-8">
        <div
          v-for="(cap, index) in capabilities"
          :key="cap.stat"
          :ref="(el) => { if (el) items[index] = el as HTMLElement }"
          class="reveal group relative flex flex-col items-center text-center rounded-xl p-5 transition-all duration-300 hover:bg-card hover:shadow-md hover:border-border border border-transparent"
          :class="`reveal-delay-${index + 1}`"
        >
          <div class="mb-3 flex size-11 items-center justify-center rounded-xl bg-foreground/[0.06] dark:bg-foreground/[0.08] text-foreground transition-colors group-hover:bg-foreground/[0.1]">
            <component :is="cap.icon" class="size-5" :stroke-width="1.75" />
          </div>
          <div class="text-lg font-bold text-foreground sm:text-xl tracking-tight">{{ cap.stat }}</div>
          <div class="mt-0.5 text-sm text-muted-foreground">{{ cap.description }}</div>
          <div class="mt-1 text-[11px] font-mono text-muted-foreground/60 uppercase tracking-wider">{{ cap.detail }}</div>
        </div>
      </div>
    </div>
  </section>
</template>

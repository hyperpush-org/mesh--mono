<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getHighlighter, highlightCode } from '@/composables/useShiki'
import { useScrollReveal } from '@/composables/useScrollReveal'

interface Feature {
  number: string
  title: string
  description: string
  filename: string
  badge: string
  code: string
  visual?: boolean
}

const features: Feature[] = [
  {
    number: '01',
    title: 'Cluster-Native Distribution',
    description:
      'Keep clustered work source-first with @cluster, wrap the routes you want with HTTP.clustered(...), and let the runtime handle placement and failover. No manual submit/status plumbing in app code.',
    filename: 'api/router.mpl',
    badge: 'Distribution',
    code: `from Api.Health import handle_health
from Api.Todos import handle_create_todo, handle_get_todo, handle_list_todos

pub fn build_router() do
  HTTP.router()
    |> HTTP.on_get("/health", handle_health)
    |> HTTP.on_get("/todos", HTTP.clustered(handle_list_todos))
    |> HTTP.on_get("/todos/:id", HTTP.clustered(handle_get_todo))
    |> HTTP.on_post("/todos", handle_create_todo)
end`,
  },
  {
    number: '02',
    title: 'Runtime-Owned Failover',
    description:
      'Boot through Node.start_from_env() and let the runtime handle discovery, promotion, and recovery across the same app code. No package-owned cluster control plane or external coordinator.',
    filename: 'main.mpl',
    badge: 'Resilience',
    code: `fn main() do
  let _ = Node.start_from_env()
  HTTP.serve(build_router(), 8080)
end

# same app on every node
# primary executes the work
# standby mirrors and resumes if the primary disappears`,
  },
  {
    number: '03',
    title: 'Full Server Stdlib',
    description:
      'HTTP, PostgreSQL, SQLite, WebSockets, migrations, rate limiting, background workers — all in the standard library. No package hunting, no driver setup, no glue code. Ship a production server with zero external dependencies.',
    filename: 'server.mpl',
    badge: 'Batteries Included',
    code: `fn main() do
  let pool = Postgres.open(Env.get("DATABASE_URL"))

  HTTP.serve(HTTP.router()
    |> HTTP.on_get("/users", fn(req) do
      let users = Repo.all(pool, Query.select(User)
        |> Query.where(fn(u) do u.active end)
        |> Query.limit(100))
      HTTP.response(200, Json.encode(users))
    end)
    # WebSockets on the same server, same process
    |> HTTP.on_websocket("/live", fn(ws) do
      let _ = Ws.send(ws, Json.encode({status: "connected"}))
      Ws.loop(ws)
    end), 8080)
end`,
  },
  {
    number: '04',
    title: 'Built-in Observatory',
    description:
      'A visual monitoring layer is coming built directly into Mesh — no Prometheus, no Grafana, no sidecar containers. See your nodes, watch actors spawn and die, observe data flowing across your cluster in real time.',
    filename: 'mesh observatory',
    badge: 'Coming Soon',
    code: '',
    visual: true,
  },
]

const highlighted = ref<Record<number, string>>({})
const { observe } = useScrollReveal()
const rows = ref<HTMLElement[]>([])

onMounted(async () => {
  rows.value.forEach((el) => {
    if (el) observe(el)
  })

  try {
    const hl = await getHighlighter()
    features.forEach((feature, index) => {
      if (!feature.visual) {
        highlighted.value[index] = highlightCode(hl, feature.code)
      }
    })
  } catch {
    // Highlighting failed -- raw code fallback remains visible
  }
})
</script>

<template>
  <section class="relative border-t border-border py-20 md:py-28">
    <div class="mx-auto max-w-6xl px-4">
      <!-- Section header -->
      <div class="text-center">
        <div class="text-sm font-mono uppercase tracking-widest text-muted-foreground">Features</div>
        <h2 class="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
          Distributed systems, simplified
        </h2>
        <p class="mx-auto mt-4 max-w-lg text-lg text-muted-foreground">
          The primitives for building reliable, scalable server infrastructure are built into the language itself.
        </p>
      </div>

      <!-- Feature rows -->
      <div class="mt-16 space-y-20 md:space-y-28">
        <div
          v-for="(feature, index) in features"
          :key="feature.title"
          :ref="(el) => { if (el) rows[index] = el as HTMLElement }"
          class="reveal grid items-center gap-10 lg:grid-cols-2 lg:gap-16"
        >
          <!-- Text -->
          <div :class="{ 'lg:order-last': index % 2 === 1 }">
            <div class="flex items-center gap-3">
              <div class="font-mono text-sm font-bold text-muted-foreground/50">{{ feature.number }}</div>
              <div
                class="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider"
                :class="feature.visual
                  ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-300/50 dark:border-amber-700/40'
                  : 'bg-muted text-muted-foreground'"
              >
                {{ feature.badge }}
              </div>
            </div>
            <h3 class="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {{ feature.title }}
            </h3>
            <p class="mt-3 max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
              {{ feature.description }}
            </p>
          </div>

          <!-- Code block -->
          <div v-if="!feature.visual" class="group overflow-hidden rounded-xl border border-border bg-card shadow-lg transition-shadow duration-300 hover:shadow-xl ring-1 ring-foreground/[0.03]">
            <!-- Terminal chrome -->
            <div class="flex items-center gap-2 border-b border-border px-4 py-3 bg-muted/30">
              <div class="flex gap-1.5">
                <div class="size-3 rounded-full bg-[#ff5f57] shadow-[inset_0_-1px_0_rgba(0,0,0,0.12)]" />
                <div class="size-3 rounded-full bg-[#febc2e] shadow-[inset_0_-1px_0_rgba(0,0,0,0.12)]" />
                <div class="size-3 rounded-full bg-[#28c840] shadow-[inset_0_-1px_0_rgba(0,0,0,0.12)]" />
              </div>
              <span class="ml-2 text-xs text-muted-foreground font-medium">{{ feature.filename }}</span>
            </div>
            <div
              v-if="highlighted[index]"
              v-html="highlighted[index]"
              class="vp-code [&_pre]:p-5 [&_pre]:!bg-transparent [&_pre]:text-sm [&_pre]:leading-relaxed"
            />
            <pre
              v-else
              class="overflow-x-auto p-5 text-sm leading-relaxed text-foreground font-mono"
            ><code>{{ feature.code }}</code></pre>
          </div>

          <!-- Observatory visual preview -->
          <div v-else class="overflow-hidden rounded-xl border border-border bg-card shadow-lg ring-1 ring-foreground/[0.03]">
            <!-- Terminal chrome -->
            <div class="flex items-center justify-between border-b border-border px-4 py-3 bg-muted/30">
              <div class="flex items-center gap-2">
                <div class="flex gap-1.5">
                  <div class="size-3 rounded-full bg-[#ff5f57] shadow-[inset_0_-1px_0_rgba(0,0,0,0.12)]" />
                  <div class="size-3 rounded-full bg-[#febc2e] shadow-[inset_0_-1px_0_rgba(0,0,0,0.12)]" />
                  <div class="size-3 rounded-full bg-[#28c840] shadow-[inset_0_-1px_0_rgba(0,0,0,0.12)]" />
                </div>
                <span class="ml-2 text-xs text-muted-foreground font-medium">mesh observatory</span>
              </div>
              <span class="text-[10px] font-mono px-2 py-0.5 rounded-full border border-amber-400/40 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30">
                Coming Soon
              </span>
            </div>

            <!-- Visual content -->
            <div class="p-6">
              <!-- Node topology SVG -->
              <div class="relative flex items-center justify-center py-4">
                <svg viewBox="0 0 320 180" class="w-full max-w-xs" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <!-- Connection lines -->
                  <line x1="160" y1="50" x2="68" y2="138" stroke="currentColor" stroke-width="1" class="text-border" stroke-dasharray="5 4"/>
                  <line x1="160" y1="50" x2="252" y2="138" stroke="currentColor" stroke-width="1" class="text-border" stroke-dasharray="5 4"/>
                  <line x1="68" y1="138" x2="252" y2="138" stroke="currentColor" stroke-width="1" class="text-border" stroke-dasharray="5 4"/>

                  <!-- Traveling data dots — primary to worker-1 -->
                  <circle r="3.5" class="fill-foreground/70">
                    <animateMotion dur="2.4s" repeatCount="indefinite" begin="0s">
                      <mpath>
                        <path d="M160,50 L68,138"/>
                      </mpath>
                    </animateMotion>
                  </circle>
                  <!-- worker-1 to worker-2 -->
                  <circle r="3.5" class="fill-foreground/50">
                    <animateMotion dur="2.8s" repeatCount="indefinite" begin="0.9s">
                      <mpath>
                        <path d="M68,138 L252,138"/>
                      </mpath>
                    </animateMotion>
                  </circle>
                  <!-- worker-2 to primary -->
                  <circle r="3.5" class="fill-foreground/60">
                    <animateMotion dur="2.2s" repeatCount="indefinite" begin="1.6s">
                      <mpath>
                        <path d="M252,138 L160,50"/>
                      </mpath>
                    </animateMotion>
                  </circle>

                  <!-- Primary node -->
                  <circle cx="160" cy="50" r="26" class="fill-card stroke-foreground/30" stroke-width="1.5"/>
                  <circle cx="160" cy="50" r="26" class="fill-foreground/[0.04]"/>
                  <text x="160" y="46" text-anchor="middle" font-size="8" class="fill-foreground/80" font-family="monospace" font-weight="600">primary</text>
                  <text x="160" y="58" text-anchor="middle" font-size="7" class="fill-muted-foreground/70" font-family="monospace">node-1</text>
                  <!-- health dot -->
                  <circle cx="179" cy="31" r="4" class="fill-emerald-500/80"/>

                  <!-- Worker 1 node -->
                  <circle cx="68" cy="138" r="22" class="fill-card stroke-foreground/20" stroke-width="1.5"/>
                  <text x="68" y="134" text-anchor="middle" font-size="7.5" class="fill-foreground/70" font-family="monospace">worker</text>
                  <text x="68" y="145" text-anchor="middle" font-size="7" class="fill-muted-foreground/60" font-family="monospace">node-2</text>
                  <circle cx="84" cy="121" r="3.5" class="fill-emerald-500/70"/>

                  <!-- Worker 2 node -->
                  <circle cx="252" cy="138" r="22" class="fill-card stroke-foreground/20" stroke-width="1.5"/>
                  <text x="252" y="134" text-anchor="middle" font-size="7.5" class="fill-foreground/70" font-family="monospace">worker</text>
                  <text x="252" y="145" text-anchor="middle" font-size="7" class="fill-muted-foreground/60" font-family="monospace">node-3</text>
                  <circle cx="268" cy="121" r="3.5" class="fill-emerald-500/70"/>
                </svg>
              </div>

              <!-- Feature tags -->
              <div class="mt-2 flex flex-wrap gap-2 justify-center">
                <span v-for="tag in ['Node Health', 'Actor Traces', 'Live Data Flow', 'Request Waterfall', 'Actor Mailboxes', 'Cluster Topology']"
                  :key="tag"
                  class="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
                >
                  {{ tag }}
                </span>
              </div>
              <p class="mt-4 text-center text-xs text-muted-foreground/60 font-mono">
                See your entire infrastructure as it operates — built in.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'

const REGISTRY_URL = 'https://registry.meshlang.dev'

// Read package name from URL query param: ?name=owner/package-name
function getPackageName(): string {
  if (typeof window === 'undefined') return ''
  const params = new URLSearchParams(window.location.search)
  return params.get('name') ?? ''
}

interface VersionInfo {
  version: string
  sha256: string
  published_at?: string
  size_bytes?: number
  download_count?: number
}

interface PackageData {
  name: string
  description: string
  owner: string
  download_count: number
  latest: { version: string; sha256: string } | null
  readme?: string
  versions?: VersionInfo[]
}

const packageName = ref(getPackageName())
const pkg = ref<PackageData | null>(null)
const versions = ref<VersionInfo[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const versionsExpanded = ref(false)
const copySuccess = ref(false)

const installCommand = computed(() => {
  if (!pkg.value?.latest) return ''
  return `meshpkg install ${pkg.value.name}@${pkg.value.latest.version}`
})

async function copyInstallCommand() {
  try {
    await navigator.clipboard.writeText(installCommand.value)
    copySuccess.value = true
    setTimeout(() => { copySuccess.value = false }, 2000)
  } catch {
    // Fallback: select all in a temporary input
  }
}

// Simple markdown renderer for common formatting.
function renderMarkdown(text: string): string {
  if (!text) return '<p class="text-zinc-400">No README available.</p>'
  // Escape HTML first, then apply basic markdown transforms
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  return escaped
    // Code blocks (``` ... ```)
    .replace(/```[\w]*\n([\s\S]*?)```/g, '<pre class="bg-zinc-100 dark:bg-zinc-800 rounded p-4 overflow-x-auto text-sm my-4"><code>$1</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="bg-zinc-100 dark:bg-zinc-800 rounded px-1.5 py-0.5 text-sm font-mono">$1</code>')
    // Headers
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold mt-6 mb-2 text-zinc-900 dark:text-zinc-100">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-semibold mt-8 mb-3 text-zinc-900 dark:text-zinc-100">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold mt-8 mb-4 text-zinc-900 dark:text-zinc-100">$1</h1>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Paragraphs (double newlines)
    .replace(/\n\n/g, '</p><p class="mb-4 text-zinc-600 dark:text-zinc-400">')
    // Wrap in paragraph
    .replace(/^/, '<p class="mb-4 text-zinc-600 dark:text-zinc-400">')
    .replace(/$/, '</p>')
}

function formatDate(iso?: string): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}

function formatBytes(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

async function loadPackage() {
  const name = packageName.value
  if (!name) {
    error.value = 'No package name specified.'
    loading.value = false
    return
  }

  loading.value = true
  error.value = null

  try {
    const resp = await fetch(`${REGISTRY_URL}/api/v1/packages/${encodeURIComponent(name)}`)
    if (resp.status === 404) throw new Error(`Package "${name}" not found.`)
    if (!resp.ok) throw new Error(`Registry returned ${resp.status}`)
    const data = await resp.json()
    pkg.value = data

    // If the API returns versions list, use it; otherwise fetch separately
    if (data.versions) {
      versions.value = data.versions
    }
  } catch (e: any) {
    error.value = e.message ?? 'Failed to load package'
  } finally {
    loading.value = false
  }
}

onMounted(loadPackage)
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-10">
    <!-- Back link -->
    <a href="/packages" class="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-violet-600 mb-6 no-underline">
      ← All packages
    </a>

    <!-- Loading -->
    <div v-if="loading" class="py-16 text-center text-zinc-400">Loading...</div>

    <!-- Error -->
    <div v-else-if="error" class="py-12 text-center">
      <p class="text-zinc-500">{{ error }}</p>
      <a href="/packages" class="mt-3 inline-block text-sm text-violet-500 hover:underline">Browse packages</a>
    </div>

    <!-- Package content -->
    <template v-else-if="pkg">
      <!-- Metadata card -->
      <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 mb-8">
        <!-- Package name + latest version badge -->
        <div class="flex items-start justify-between gap-4 mb-4">
          <div>
            <h1 class="font-mono text-2xl font-bold text-zinc-900 dark:text-zinc-100 break-all">{{ pkg.name }}</h1>
            <p class="text-zinc-500 dark:text-zinc-400 mt-1">{{ pkg.description || 'No description.' }}</p>
          </div>
          <div class="text-right shrink-0">
            <span class="inline-block text-xs font-mono font-semibold px-2.5 py-1 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300">
              v{{ pkg.latest?.version ?? 'unknown' }}
            </span>
            <p class="text-xs text-zinc-400 mt-1">{{ pkg.download_count?.toLocaleString() }} downloads</p>
          </div>
        </div>

        <!-- Install command (prominent, copy-to-clipboard) -->
        <div v-if="installCommand" class="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-800 rounded-lg px-4 py-3 mb-4 font-mono text-sm">
          <code class="flex-1 text-zinc-800 dark:text-zinc-200 break-all">{{ installCommand }}</code>
          <button
            @click="copyInstallCommand"
            class="shrink-0 text-xs px-2.5 py-1 rounded border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-violet-600 hover:border-violet-400 transition-colors"
          >
            {{ copySuccess ? 'Copied!' : 'Copy' }}
          </button>
        </div>

        <!-- Author -->
        <div class="flex items-center gap-4 text-sm text-zinc-500">
          <span>by <a :href="`https://github.com/${pkg.owner}`" class="text-violet-600 dark:text-violet-400 hover:underline" target="_blank">{{ pkg.owner }}</a></span>
        </div>
      </div>

      <!-- Version history (expandable) -->
      <div v-if="versions.length > 0" class="mb-8">
        <button
          @click="versionsExpanded = !versionsExpanded"
          class="flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
        >
          <span>Version History ({{ versions.length }})</span>
          <span class="text-xs">{{ versionsExpanded ? '▲' : '▼' }}</span>
        </button>

        <div v-show="versionsExpanded" class="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div
            v-for="ver in versions"
            :key="ver.version"
            class="flex items-center gap-4 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 last:border-b-0 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
          >
            <span class="font-mono text-sm font-semibold text-zinc-800 dark:text-zinc-200 w-24 shrink-0">v{{ ver.version }}</span>
            <span class="text-xs text-zinc-400 flex-1">{{ formatDate(ver.published_at) }}</span>
            <span v-if="ver.size_bytes" class="text-xs text-zinc-400">{{ formatBytes(ver.size_bytes) }}</span>
            <code class="text-xs font-mono text-zinc-500 dark:text-zinc-400 hidden sm:block">
              meshpkg install {{ pkg!.name }}@{{ ver.version }}
            </code>
          </div>
        </div>
      </div>

      <!-- README -->
      <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
        <h2 class="text-lg font-semibold text-zinc-800 dark:text-zinc-200 mb-4">README</h2>
        <div class="prose prose-zinc dark:prose-invert max-w-none" v-html="renderMarkdown(pkg.readme ?? '')"></div>
      </div>
    </template>
  </div>
</template>

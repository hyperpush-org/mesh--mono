# Phase 145: Packages Page Redesign - Research

**Researched:** 2026-03-01
**Domain:** SvelteKit UI redesign — packages registry website matching landing page design system
**Confidence:** HIGH

## Summary

The current packages-website (`packages-website/`) is a bare-minimum SvelteKit 2 + Svelte 5 app using no CSS framework — only inline styles. Every page (`+layout.svelte`, `+page.svelte`, `packages/[name]/+page.svelte`, `search/+page.svelte`) uses raw `style=""` attributes with hardcoded hex colors and no design tokens. The app renders functionally but has no visual relationship to the main site (meshlang.dev).

The landing page at `website/` is built on VitePress + Vue 3, Tailwind CSS v4, shadcn-vue ("new-york" style), lucide-vue-next icons, Inter + JetBrains Mono fonts, and a monochrome OKLCH token design system. It has polished landing sections: hero, capabilities bar, feature showcase with code blocks, comparison cards, CTA, and a sticky navbar with backdrop blur. The packages-website must adopt the same visual language — same tokens, same typography, same card patterns, same animations — without touching the VitePress site.

The redesign approach is: install Tailwind CSS v4 + shadcn-svelte (Svelte-native shadcn, not the Vue version) into the packages-website, replicate the exact OKLCH CSS variable design system from `main.css`, and build proper page components for the home/browse page, the per-package detail page, and the search results page, all matching the landing page's card and layout patterns. No new API routes are needed — the existing registry endpoints provide all required data.

**Primary recommendation:** Install Tailwind CSS v4 + shadcn-svelte into packages-website, copy the OKLCH token design system verbatim from the landing page, and rewrite all four Svelte routes using the same component patterns (cards, terminal chrome, mono fonts, `reveal` scroll animations, sticky navbar).

---

## Current State Audit

### packages-website current tech stack
- **Framework:** SvelteKit 2 + Svelte 5 (ESM, adapter-node)
- **Styling:** Zero CSS framework — all inline `style=""` attributes
- **Icons:** None
- **Fonts:** Browser default (no Inter, no JetBrains Mono)
- **Color system:** Hardcoded hex values (`#eee`, `#666`, `#444`, `#999`)
- **Deployment:** Fly.io `mesh-packages` (iad), port 3000, node:20-slim Docker

### Files to completely rewrite
| File | Current state | Redesign needed |
|------|--------------|-----------------|
| `src/app.html` | Bare HTML, no fonts, no theme class | Add font links, dark class support |
| `src/routes/+layout.svelte` | 12 lines inline styled nav | Full sticky navbar + footer |
| `src/routes/+page.svelte` | 19 lines basic list | Hero section + package grid |
| `src/routes/packages/[name]/+page.svelte` | 33 lines raw display | Full detail page with README |
| `src/routes/search/+page.svelte` | 19 lines basic list | Styled search results |

### Registry API shape (confirmed from source)
**GET /api/v1/packages** (list/search with ?search=query)
```json
[{ "name": "...", "version": "1.0.0", "description": "..." }]
```
Note: list endpoint returns `version` (not `latest_version`). Current page.server.js references `pkg.latest_version` — this is a data mapping bug to fix.

**GET /api/v1/packages/{name}** (package detail)
```json
{
  "name": "...",
  "description": "...",
  "owner": "github_login",
  "download_count": 42,
  "latest": { "version": "1.0.0", "sha256": "..." },
  "readme": "# markdown string or null"
}
```
Note: `readme` is raw Markdown — needs client-side rendering (marked or markdown-it).

**GET /api/v1/packages/{name}/{version}** — only returns `{ "sha256": "..." }`, not useful for website display.

Note: The per-package server route fetches versions list separately — but the current metadata API doesn't expose a versions list. The `data.pkg.versions` used in the current `[name]/+page.svelte` doesn't exist in the API response. This is a bug that the redesign should address — either add a versions endpoint to the registry, or drop the versions table from the UI, or fetch versions another way.

---

## Standard Stack

### Core (what to add to packages-website)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| tailwindcss | ^4.x | Utility CSS framework | Matches landing page stack exactly |
| @tailwindcss/vite | ^4.x | Vite plugin for Tailwind v4 | Required for Vite-based builds (no config file needed) |
| lucide-svelte | ^0.x | Icon library | Svelte port of lucide used by landing page (lucide-vue-next) |
| marked | ^13.x | Markdown to HTML for README | Lightweight, widely used, no deps |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @tailwindcss/typography | ^0.5.x | Prose styles for rendered README | Required for README markdown rendering to look good |

### What NOT to add
- shadcn-svelte: overkill for 4 pages, adds complexity; Tailwind utilities + custom components are sufficient
- svelte-markdown: heavier alternative to marked; marked is simpler
- Any animation library: CSS animations from landing page are copy-pasteable

### Installation
```bash
npm install -D tailwindcss @tailwindcss/vite @tailwindcss/typography
npm install lucide-svelte marked
```

### Vite config update
```js
// vite.config.js
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()]
});
```

### Global CSS file (new: src/app.css)
This file must be imported in `+layout.svelte` and must replicate the OKLCH token system from the landing page exactly.

---

## Architecture Patterns

### Recommended Project Structure
```
packages-website/src/
├── app.css              # Tailwind import + OKLCH tokens + animations (new)
├── app.html             # Add font preloads, link to app.css handled by layout
├── lib/
│   └── markdown.js      # marked renderer helper (new)
├── routes/
│   ├── +layout.svelte   # Full navbar + footer wrapping all pages
│   ├── +page.svelte     # Browse/home page (hero + package grid)
│   ├── +page.server.js  # Unchanged (fetch packages list)
│   ├── packages/
│   │   └── [name]/
│   │       ├── +page.svelte       # Package detail (README + metadata)
│   │       └── +page.server.js    # Unchanged (fetch package by name)
│   └── search/
│       ├── +page.svelte           # Search results grid
│       └── +page.server.js        # Unchanged (search packages)
```

### Pattern 1: OKLCH Token Design System (copy verbatim from landing page)
**What:** CSS custom properties matching the landing page's monochrome OKLCH palette
**When to use:** In `src/app.css`, imported globally
```css
/* src/app.css */
@import "tailwindcss";
@plugin "@tailwindcss/typography";

@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url('https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7W0Q5nw.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}

@font-face {
  font-family: 'JetBrains Mono';
  font-style: normal;
  font-weight: 400 700;
  font-display: swap;
  src: url('https://fonts.gstatic.com/s/jetbrainsmono/v24/tDbv2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKwBNntkaToggR7BYRbKPxDcwgknk-4.woff2') format('woff2');
  unicode-range: U+0000-00FF, ...;
}

:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.098 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.098 0 0);
  --muted: oklch(0.955 0 0);
  --muted-foreground: oklch(0.45 0 0);
  --border: oklch(0.905 0 0);
  --radius: 0.5rem;
}
.dark {
  --background: oklch(0.115 0 0);
  --foreground: oklch(0.955 0 0);
  --card: oklch(0.145 0 0);
  --muted: oklch(0.2 0 0);
  --muted-foreground: oklch(0.58 0 0);
  --border: oklch(0.22 0 0);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-border: var(--border);
  --font-sans: 'Inter', ui-sans-serif, system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
}
```

### Pattern 2: Sticky Navbar (mirrors landing page NavBar.vue)
**What:** Full-width sticky header with logo, nav links, search input
**Example structure (Svelte):**
```svelte
<!-- +layout.svelte -->
<script>
  import '../app.css';
  import { page } from '$app/stores';
</script>

<header class="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
  <div class="relative mx-auto flex h-14 max-w-6xl items-center px-4 lg:px-6">
    <a href="/" class="flex items-center gap-2">
      <span class="text-base font-semibold text-foreground">Mesh Packages</span>
    </a>
    <form action="/search" method="GET" class="flex items-center ml-auto gap-2">
      <input
        name="q"
        placeholder="Search packages..."
        class="h-9 rounded-md border border-border bg-muted px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-border"
      />
      <button type="submit" class="h-9 rounded-md bg-foreground px-4 text-sm font-medium text-background">Search</button>
    </form>
  </div>
</header>
<main class="min-h-screen bg-background">
  <slot />
</main>
```

### Pattern 3: Package Card (mirrors landing page WhyMesh cards)
**What:** Card with hover elevation, border softening on hover
**Key classes from landing page:**
```
rounded-xl border border-foreground/10 bg-card p-6
transition-all duration-300 hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-lg
```

### Pattern 4: Home Page Layout
**What:** Hero banner (package count + search CTA) + responsive grid of package cards
**Structure:**
- Section header with mono label ("Packages") + large title + subtitle
- Real-time search input that navigates to `/search?q=...`
- 3-column responsive grid (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`)
- Each card: name (bold, linked), version badge, description, owner, download count, date
- Empty state: centered message with CTA to publish

### Pattern 5: Package Detail Page
**What:** Two-column layout — main content (README) + sidebar (metadata)
**Structure:**
- Page header: package name (h1), description, install command terminal
- Install command: styled terminal block with copy button (`navigator.clipboard`)
  ```
  rounded-lg border border-border bg-card px-5 py-4 font-mono text-sm
  ```
- Main column: rendered README markdown with prose typography
- Sidebar: version badge, download count, owner, published date, all versions list
- README rendering: `{@html marked(data.pkg.readme)}` wrapped in `prose` class

### Pattern 6: Scroll Reveal Animation (copy from landing page)
**What:** CSS-only reveal on scroll using IntersectionObserver
```svelte
<script>
  import { onMount } from 'svelte';

  let cards = [];
  onMount(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('is-visible') }),
      { threshold: 0.1 }
    );
    cards.forEach(el => { if (el) observer.observe(el); });
    return () => observer.disconnect();
  });
</script>
```
CSS (in app.css):
```css
.reveal { opacity: 0; transform: translateY(24px); transition: opacity 0.7s ease-out, transform 0.7s ease-out; }
.reveal.is-visible { opacity: 1; transform: translateY(0); }
.reveal-delay-1 { transition-delay: 0.1s; }
.reveal-delay-2 { transition-delay: 0.2s; }
.reveal-delay-3 { transition-delay: 0.3s; }
```

### Anti-Patterns to Avoid
- **Using `style=""` inline attributes:** All styling must use Tailwind utility classes or CSS variables
- **Hardcoded hex colors:** All colors must use CSS variable tokens (`text-foreground`, `bg-card`, etc.)
- **Raw `<pre>` for README:** README is Markdown — must be rendered with marked and wrapped in `prose`
- **Accessing `pkg.versions` from API:** The current API doesn't return a versions list — don't attempt to render it without verifying the endpoint exists
- **Accessing `pkg.latest_version` on list items:** The list API returns `version` not `latest_version`

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Markdown rendering | Custom regex parser | `marked` library | CommonMark-compliant, handles edge cases |
| Markdown prose styles | Custom CSS rules | `@tailwindcss/typography` prose class | Handles h1-h6, code, tables, blockquote, etc. |
| Icon SVGs | Inline SVG strings | `lucide-svelte` | Tree-shakeable, consistent with landing page's lucide-vue-next |
| Copy-to-clipboard | Custom `document.execCommand` | `navigator.clipboard.writeText()` | Modern API, matches landing page GetStartedCTA.vue pattern |
| Scroll animations | GSAP/framer | CSS + IntersectionObserver | Matches landing page pattern exactly, zero deps |
| Tailwind v4 configuration | `tailwind.config.js` | `@theme inline` in CSS | Tailwind v4 is config-file-free (uses CSS-based config) |

**Key insight:** Tailwind CSS v4 in Vite requires NO `tailwind.config.js` — configuration is entirely in CSS using `@import "tailwindcss"` and `@theme inline`. The `@tailwindcss/vite` plugin handles everything automatically.

---

## Common Pitfalls

### Pitfall 1: Tailwind v4 Vite Plugin Order
**What goes wrong:** Styles don't apply or build fails
**Why it happens:** `tailwindcss()` plugin must come BEFORE `sveltekit()` in the Vite plugins array
**How to avoid:** `plugins: [tailwindcss(), sveltekit()]` — tailwindcss first
**Warning signs:** CSS classes appear in DOM but have no effect

### Pitfall 2: API Data Shape Mismatch
**What goes wrong:** Package list shows undefined version, detail page crashes on `data.pkg.versions`
**Why it happens:** Current Svelte pages were written against an assumed API shape that doesn't match actual registry responses
- List API: `{ name, version, description }` (not `latest_version`)
- Detail API: `{ name, description, owner, download_count, latest: {version, sha256}, readme }` (no `versions` array)
**How to avoid:** Map data in `+page.server.js` or reference correct field names; drop versions table from UI or add registry API endpoint
**Warning signs:** Version shows as blank, console errors on undefined `.map`

### Pitfall 3: Dark Mode in SvelteKit vs VitePress
**What goes wrong:** Dark mode toggle doesn't work or styles apply incorrectly
**Why it happens:** VitePress adds/removes `.dark` class on `<html>`. SvelteKit has no built-in dark mode toggle. The OKLCH tokens use `.dark` class selector.
**How to avoid:** Implement a simple dark mode toggle that adds/removes `class="dark"` on `<html>`. Store preference in localStorage. Or default to system preference via `prefers-color-scheme` media query.
**Warning signs:** Dark mode tokens never activate

### Pitfall 4: README XSS from `{@html marked(readme)}`
**What goes wrong:** Package README contains malicious script tags that execute
**Why it happens:** `marked` by default doesn't sanitize HTML in markdown
**How to avoid:** Use `marked` with `DOMPurify` for sanitization, OR use `marked`'s built-in `sanitize` option (deprecated), OR configure `renderer` to strip dangerous tags. For a language registry with controlled packages, basic trust level is acceptable short-term — document this tradeoff.
**Warning signs:** README renders `<script>` tags

### Pitfall 5: Svelte 5 Runes vs Legacy `export let data`
**What goes wrong:** Props don't update, compiler warnings
**Why it happens:** Svelte 5 uses `$props()` rune but is backward-compatible with `export let`
**How to avoid:** Keep `export let data` (Svelte 4 compatibility mode works in Svelte 5 for page data) OR migrate to `let { data } = $props()`. Consistency matters — pick one pattern.
**Warning signs:** Yellow compiler warnings about deprecated prop syntax

### Pitfall 6: `@tailwindcss/typography` Plugin Registration in v4
**What goes wrong:** `prose` class has no effect
**Why it happens:** Tailwind v4 uses `@plugin` directive instead of the `plugins` array in config
**How to avoid:** In `app.css`, add `@plugin "@tailwindcss/typography";` after `@import "tailwindcss";`
**Warning signs:** Markdown HTML renders unstyled

---

## Code Examples

### +layout.svelte (full redesign skeleton)
```svelte
<script>
  import '../app.css';
  import { Search, Package } from 'lucide-svelte';
</script>

<header class="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
  <div class="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 lg:px-6">
    <a href="/" class="flex items-center gap-2 shrink-0">
      <Package class="size-5 text-foreground" />
      <span class="text-sm font-semibold text-foreground">Mesh Packages</span>
    </a>
    <form action="/search" method="GET" class="flex items-center ml-auto gap-2">
      <div class="relative">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <input
          name="q"
          placeholder="Search packages..."
          class="h-9 w-48 rounded-md border border-border bg-muted pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground/30 md:w-64"
        />
      </div>
    </form>
  </div>
</header>

<main class="min-h-screen bg-background">
  <slot />
</main>

<footer class="border-t border-border py-8">
  <div class="mx-auto max-w-6xl px-4 text-center text-sm text-muted-foreground">
    <a href="https://meshlang.dev" class="hover:text-foreground transition-colors">meshlang.dev</a>
    &nbsp;&middot;&nbsp;
    <a href="https://github.com/snowdamiz/mesh-lang" class="hover:text-foreground transition-colors">GitHub</a>
  </div>
</footer>
```

### Package Card Component (Svelte)
```svelte
<!-- src/lib/components/PackageCard.svelte -->
<script>
  export let pkg; // { name, version, description }
</script>

<a
  href="/packages/{pkg.name}"
  class="block rounded-xl border border-foreground/10 bg-card p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-lg no-underline"
>
  <div class="flex items-start justify-between gap-2">
    <span class="text-base font-bold text-foreground">{pkg.name}</span>
    <span class="shrink-0 rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
      v{pkg.version}
    </span>
  </div>
  <p class="mt-2 text-sm leading-relaxed text-muted-foreground line-clamp-2">
    {pkg.description || 'No description provided.'}
  </p>
</a>
```

### Install Command with Copy Button
```svelte
<script>
  let copied = false;
  async function copy(text) {
    await navigator.clipboard.writeText(text);
    copied = true;
    setTimeout(() => { copied = false; }, 2000);
  }
</script>

<div class="flex items-center gap-3 rounded-lg border border-border bg-card px-5 py-4">
  <span class="text-muted-foreground font-mono text-sm select-none">$</span>
  <code class="flex-1 font-mono text-sm text-foreground">meshpkg install {data.pkg.name}</code>
  <button
    on:click={() => copy(`meshpkg install ${data.pkg.name}`)}
    class="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
  >
    {#if copied}
      <Check class="size-4" />
    {:else}
      <Copy class="size-4" />
    {/if}
  </button>
</div>
```

### Markdown README rendering
```svelte
<script>
  import { marked } from 'marked';
  export let data;
  $: readmeHtml = data.pkg.readme ? marked.parse(data.pkg.readme) : null;
</script>

{#if readmeHtml}
  <div class="prose prose-neutral max-w-none dark:prose-invert">
    {@html readmeHtml}
  </div>
{/if}
```

### Home page section header (matches landing page pattern)
```svelte
<div class="text-center">
  <div class="text-sm font-mono uppercase tracking-widest text-muted-foreground">Registry</div>
  <h1 class="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
    Mesh Packages
  </h1>
  <p class="mx-auto mt-4 max-w-lg text-lg text-muted-foreground">
    Community packages for the Mesh programming language.
  </p>
</div>
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Tailwind config file (tailwind.config.js) | `@theme inline` in CSS + `@import "tailwindcss"` | Tailwind v4 is config-file-free — don't create config file |
| `@tailwindcss/vite` in devDeps only | Must also register in vite.config.js | Plugin required in both |
| `sanitize` option in marked | DOMPurify for HTML sanitization | `marked` removed built-in sanitize — use DOMPurify if needed |

**Deprecated/outdated:**
- `export let data` syntax: works in Svelte 5 compat mode but `let { data } = $props()` is preferred in new code
- Inline `style=""` attributes: replaced by Tailwind utility classes throughout

---

## Data Gaps to Address in Planning

### Gap 1: Version history on package detail page
The current `packages/[name]/+page.svelte` attempts to render `data.pkg.versions` as an array, but the registry API `GET /api/v1/packages/{name}` does NOT return a versions array. The `metadata.rs` `package_handler` only returns: `name, description, owner, download_count, latest, readme`.

**Options:**
1. Add a `GET /api/v1/packages/{name}/versions` endpoint to the registry (requires registry code change)
2. Drop the versions table from the UI (show only latest version)
3. Show only the `latest` version from the existing API response

Option 3 is simplest and avoids touching the registry. Option 1 is most complete.

### Gap 2: Dark mode toggle in SvelteKit
The landing page uses VitePress's built-in dark mode (class-based on `<html>`). The packages-website needs its own toggle mechanism.

**Recommended approach:** CSS `prefers-color-scheme` media query as fallback + `localStorage` toggle stored in `<script>` in `app.html` to prevent flash of unstyled content.

### Gap 3: API query param mismatch
The current search route fetches `?q=...` but the registry search handler accepts `?search=...` (confirmed from `search.rs` `SearchParams` struct). Current `+page.server.js` uses `?q=` — this is a bug that needs fixing OR the registry needs a `q` alias.

Confirmed: registry `search.rs` uses `params.search`, not `params.q`. The frontend must send `?search=query` not `?q=query`.

---

## Open Questions

1. **Version history endpoint**
   - What we know: Registry has `list_versions()` DB function but no HTTP route exposes it
   - What's unclear: Whether Phase 145 should add that route or skip version history
   - Recommendation: Add `GET /api/v1/packages/{name}/versions` to registry in this phase (small addition, big UX win)

2. **Dark mode persistence**
   - What we know: Tokens are ready (OKLCH `.dark` class), SvelteKit has no built-in toggle
   - What's unclear: Whether to default dark, default light, or follow system
   - Recommendation: Follow system preference with a manual toggle stored in localStorage; add inline script to `app.html` to avoid FOUC

3. **README sanitization**
   - What we know: `marked.parse()` renders raw HTML from Markdown; packages are published by authenticated GitHub users
   - What's unclear: Risk tolerance for XSS in registry context
   - Recommendation: Add `dompurify` (or `isomorphic-dompurify` for SSR) since this is a public package registry

---

## Sources

### Primary (HIGH confidence)
- Direct source code inspection — `packages-website/src/**` (all 8 source files read)
- Direct source code inspection — `website/docs/.vitepress/theme/**` (landing page components, CSS tokens)
- Direct source code inspection — `registry/src/**` (API shapes, data models)

### Secondary (MEDIUM confidence)
- Tailwind CSS v4 Vite plugin usage — verified via `website/package.json` (`@tailwindcss/vite: ^4.1.18`) and `main.css` (`@import "tailwindcss"` pattern)
- shadcn-vue components.json — confirms "new-york" style, OKLCH neutral tokens, lucide icon library
- SvelteKit 2 + Svelte 5 compatibility — confirmed from `packages-website/package.json`

### Tertiary (LOW confidence — validate before use)
- `lucide-svelte` package name — Svelte port of Lucide icons; verify exact package name on npm
- `marked` v13.x API — `marked.parse()` — verify current API hasn't changed
- `isomorphic-dompurify` SSR compatibility with SvelteKit — verify SSR behavior in adapter-node context

---

## Metadata

**Confidence breakdown:**
- Current state audit: HIGH — read all source files directly
- Standard stack: HIGH — matches existing landing page deps; only lucide-svelte and marked need version check
- Architecture patterns: HIGH — derived directly from landing page component patterns
- Data gaps: HIGH — verified against actual registry Rust source code
- Pitfalls: MEDIUM — some from direct inspection, some from Tailwind v4 docs knowledge

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (Tailwind v4 and Svelte 5 are fast-moving; recheck if delayed)

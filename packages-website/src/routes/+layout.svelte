<script>
  import '../app.css';
  import { Package, Search, Sun, Moon } from 'lucide-svelte';
  import { onMount } from 'svelte';

  export let data;

  let dark = false;
  onMount(() => {
    dark = document.documentElement.classList.contains('dark');
  });
  function toggleDark() {
    dark = !dark;
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }
</script>

<header class="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
  <div class="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 lg:px-6">
    <!-- Logo -->
    <a href="/" class="flex items-center gap-2 shrink-0 no-underline">
      <Package class="size-5 text-foreground" />
      <span class="text-sm font-semibold text-foreground">Mesh Packages</span>
    </a>

    <!-- Search form (right side) -->
    <form action="/search" method="GET" class="flex items-center ml-auto gap-3">
      <div class="relative hidden sm:block">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
        <input
          name="q"
          placeholder="Search packages..."
          class="h-9 w-48 rounded-md border border-border bg-muted pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground/30 md:w-64 transition-colors"
        />
      </div>
      <!-- Dark mode toggle button -->
      <button
        type="button"
        on:click={toggleDark}
        class="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
        aria-label="Toggle dark mode"
      >
        {#if dark}
          <Sun class="size-4" />
        {:else}
          <Moon class="size-4" />
        {/if}
      </button>
      <!-- Docs link -->
      <a
        href="https://meshlang.dev"
        target="_blank"
        class="hidden text-sm text-muted-foreground transition-colors hover:text-foreground md:block no-underline"
      >Docs</a>
    </form>
  </div>
</header>

<main class="min-h-screen bg-background">
  <slot />
</main>

<footer class="border-t border-border py-10">
  <div class="mx-auto max-w-6xl px-4 text-center text-sm text-muted-foreground">
    <p>
      <a href="https://meshlang.dev" class="transition-colors hover:text-foreground">meshlang.dev</a>
      &nbsp;&middot;&nbsp;
      <a href="https://github.com/snowdamiz/mesh-lang" class="transition-colors hover:text-foreground">GitHub</a>
      &nbsp;&middot;&nbsp;
      <a href="https://meshlang.dev/docs/tooling" class="transition-colors hover:text-foreground">meshpkg docs</a>
    </p>
    <p class="mt-2 text-xs">The Mesh package registry. Publish with <code class="font-mono">meshpkg publish</code>.</p>
  </div>
</footer>

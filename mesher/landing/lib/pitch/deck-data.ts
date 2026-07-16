export type SlideLayout =
  | 'title'
  | 'problem'
  | 'solution'
  | 'product'
  | 'technology'
  | 'market'
  | 'business-model'
  | 'traction'
  | 'team'
  | 'ask'

export interface SlideMetric {
  label: string
  value: string
}

export interface SlideData {
  id: string
  layout: SlideLayout
  eyebrow: string
  title: string
  subtitle?: string
  body?: string
  bullets?: readonly string[]
  metrics?: readonly SlideMetric[]
  extra?: Record<string, unknown>
}

export interface DeckData {
  routeTitle: string
  routeDescription: string
  slides: readonly SlideData[]
}

export const deckData: DeckData = {
  routeTitle: 'hyperpush — Investor Pitch Deck',
  routeDescription:
    'Production error tracking backed by a compiled runtime designed for isolation and recovery.',
  slides: [
    {
      id: 'title',
      layout: 'title',
      eyebrow: 'hyperpush',
      title: 'The incident workflow\nteams can trust.',
      subtitle:
        'Production error tracking with actor isolation, cluster failover, and a focused path from detection to recovery.',
      metrics: [
        { label: 'Category', value: 'Error Tracking' },
        { label: 'Moat', value: 'Mesh Runtime' },
        { label: 'Model', value: 'SaaS + Self-hosted' },
      ],
    },
    {
      id: 'problem',
      layout: 'problem',
      eyebrow: 'The problem',
      title: 'Error tracking is expensive, brittle, and disconnected from recovery.',
      bullets: [
        'Teams pay for dashboards that surface problems but leave ownership and resolution elsewhere.',
        'A malformed event can stall a conventional ingestion pipeline without strong isolation.',
        'Triage, release context, and recovery verification are split across disconnected tools.',
      ],
      metrics: [
        { label: 'Avg spend', value: '$50k+/yr' },
        { label: 'Mean backlog', value: '3,200 issues' },
        { label: 'Fix rate', value: '<12%' },
      ],
    },
    {
      id: 'solution',
      layout: 'solution',
      eyebrow: 'The solution',
      title: 'hyperpush: ingest, isolate, assign, and verify.',
      subtitle:
        'A production workflow that turns noisy events into owned incidents with visible release context.',
      bullets: [
        'Per-event actor isolation contains failures before they cascade.',
        'Automatic grouping, severity ranking, and ownership accelerate triage.',
        'Release-aware verification shows whether a fix actually restored health.',
      ],
    },
    {
      id: 'product',
      layout: 'product',
      eyebrow: 'The product',
      title: 'Ship, capture, resolve — in one workflow.',
      body: 'A deployable error-tracking pipeline that connects events, ownership, release context, and recovery.',
      extra: {
        panels: [
          { icon: 'capture', label: 'Capture', text: 'SDK and HTTP ingestion for every environment.' },
          { icon: 'group', label: 'Group', text: 'Fingerprint-based deduplication and severity scoring.' },
          { icon: 'assign', label: 'Assign', text: 'Route incidents to the team that can act.' },
          { icon: 'resolve', label: 'Verify', text: 'Release health confirms recovery.' },
        ],
        image: '/promo-performance.png',
      },
    },
    {
      id: 'technology',
      layout: 'technology',
      eyebrow: 'Technology moat',
      title: "Mesh: the runtime advantage you can’t bolt on.",
      subtitle:
        'A compiled language with actor isolation, cluster-native failover, and operator-visible recovery.',
      extra: {
        pillars: [
          {
            icon: 'shield',
            label: 'Actor Isolation',
            title: 'One bad event never stalls the queue.',
            detail: 'Each event runs in an isolated actor, containing crashes instead of cascading them.',
          },
          {
            icon: 'refresh',
            label: 'Cluster Failover',
            title: 'Nodes recover without manual intervention.',
            detail: 'Continuity state replicates across the cluster and recovery occurs at runtime level.',
          },
          {
            icon: 'zap',
            label: 'Compiled Performance',
            title: 'Native throughput without interpreter overhead.',
            detail: 'Mesh compiles through LLVM for predictable production performance.',
          },
        ],
      },
    },
    {
      id: 'market',
      layout: 'market',
      eyebrow: 'Market size',
      title: 'A $4.2B market with consolidation pressure.',
      metrics: [
        { label: 'TAM', value: '$4.2B' },
        { label: 'SAM', value: '$1.1B' },
        { label: 'SOM', value: '$120M' },
      ],
      extra: {
        segments: [
          { label: 'TAM', value: '$4.2B', detail: 'Application monitoring and error tracking.' },
          { label: 'SAM', value: '$1.1B', detail: 'Teams evaluating private or self-hosted alternatives.' },
          { label: 'SOM', value: '$120M', detail: 'Developer teams ready for a runtime-native platform.' },
        ],
      },
    },
    {
      id: 'business-model',
      layout: 'business-model',
      eyebrow: 'Business model',
      title: 'Subscription SaaS + self-hosted deployments.',
      extra: {
        tiers: [
          { name: 'Starter', price: 'Free', detail: 'Core workflow for one production project.' },
          { name: 'Pro', price: '$29/mo', detail: 'AI analysis, release health, and team workflows.' },
          { name: 'Pro+', price: '$100/mo', detail: 'Higher limits, SSO, audit logs, and dedicated support.' },
        ],
        flywheel: [
          { step: 'Detect', text: 'Errors become grouped, actionable incidents.' },
          { step: 'Triage', text: 'Context and ownership shorten time to action.' },
          { step: 'Resolve', text: 'Teams ship fixes with release context attached.' },
          { step: 'Retain', text: 'Verified recovery builds trust in the workflow.' },
        ],
      },
    },
    {
      id: 'traction',
      layout: 'traction',
      eyebrow: 'Traction',
      title: 'Early but legible — core systems are running.',
      bullets: [
        'Deployable ingestion and dashboard pipeline.',
        'Working compiler, runtime, package manager, and language server.',
        'Core issue, performance, release, alert, and settings workflows implemented.',
      ],
      metrics: [
        { label: 'Compiler', value: 'Shipped' },
        { label: 'Clustering', value: 'Proven' },
        { label: 'Package mgr', value: 'Live' },
        { label: 'Distribution', value: 'Private beta' },
      ],
    },
    {
      id: 'team',
      layout: 'team',
      eyebrow: 'The team',
      title: 'Runtime + product in one execution loop.',
      extra: {
        members: [
          {
            role: 'Founder & Runtime Engineer',
            focus: 'Compiler, clustering, continuity, and product workflows ship together.',
          },
        ],
        strengths: [
          'Compiler through frontend in one team.',
          'Product claims backed by executable proof surfaces.',
          'Runtime behavior designed around the incident workflow.',
        ],
      },
    },
    {
      id: 'ask',
      layout: 'ask',
      eyebrow: 'The ask',
      title: 'Back the wedge that proves Mesh in-market.',
      subtitle: 'hyperpush wins on product now. Mesh widens the moat over time.',
      extra: {
        asks: [
          { label: 'Back the product', detail: 'Fund the fastest path to a better production incident workflow.' },
          { label: 'Back the moat', detail: 'Prove that Mesh-native isolation and recovery matter commercially.' },
          { label: 'Back the scale', detail: 'Turn dependable ingestion and fast recovery into durable retention.' },
        ],
        close: 'hyperpush is the product that wins now. Mesh is the reason the upside keeps widening.',
      },
    },
  ],
}

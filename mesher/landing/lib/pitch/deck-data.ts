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
    'A private-beta error-tracking product backed by a compiled Mesh server and executable launch proof.',
  slides: [
    {
      id: 'title',
      layout: 'title',
      eyebrow: 'hyperpush',
      title: 'The incident workflow\nteams can trust.',
      subtitle:
        'Production error tracking with live issue evidence, lifecycle controls, and in-product alerts.',
      metrics: [
        { label: 'Category', value: 'Error Tracking' },
        { label: 'Moat', value: 'Mesh Runtime' },
        { label: 'Stage', value: 'Private beta' },
      ],
    },
    {
      id: 'problem',
      layout: 'problem',
      eyebrow: 'The problem',
      title: 'Error tracking gets noisy before a team can act.',
      bullets: [
        'Teams pay for dashboards that surface problems but leave ownership and resolution elsewhere.',
        'Missing or synthetic context makes a polished dashboard less trustworthy, not more useful.',
        'Core event evidence and issue lifecycle state are often split across disconnected tools.',
      ],
      metrics: [
        { label: 'Product rule', value: 'Live only' },
        { label: 'Fallback data', value: 'None' },
        { label: 'Launch stage', value: 'Private beta' },
      ],
    },
    {
      id: 'solution',
      layout: 'solution',
      eyebrow: 'The solution',
      title: 'hyperpush: ingest, group, inspect, and act.',
      subtitle:
        'A project-scoped workflow that turns accepted events into grouped issues with recorded evidence.',
      bullets: [
        'Per-event actor isolation contains failures before they cascade.',
        'Fingerprint grouping, live severity, and lifecycle state focus the issue queue.',
        'Stack traces, breadcrumbs, tags, environment, SDK, and session context stay source-attributable.',
      ],
    },
    {
      id: 'product',
      layout: 'product',
      eyebrow: 'The product',
      title: 'Capture, inspect, act — in one workflow.',
      body: 'A deployable error-tracking pipeline that connects accepted events, grouped issues, evidence, and lifecycle state.',
      extra: {
        panels: [
          { icon: 'capture', label: 'Capture', text: 'Authenticated typed HTTP event ingestion.' },
          { icon: 'group', label: 'Group', text: 'Fingerprint-based deduplication and severity scoring.' },
          { icon: 'assign', label: 'Inspect', text: 'Recorded stack traces, breadcrumbs, and tags.' },
          { icon: 'resolve', label: 'Act', text: 'Issue and in-product alert lifecycle controls.' },
        ],
      },
    },
    {
      id: 'technology',
      layout: 'technology',
      eyebrow: 'Technology moat',
      title: 'Mesh: the backend language proven by the product.',
      subtitle:
        'An LLVM-backed language with actor primitives, HTTP routing, and database integration.',
      extra: {
        pillars: [
          {
            icon: 'shield',
            label: 'Actor Isolation',
            title: 'Each accepted event gets a processing boundary.',
            detail: 'The checked-in ingestion path starts an event actor before storage and grouping.',
          },
          {
            icon: 'refresh',
            label: 'Service Integration',
            title: 'The API and database compile together.',
            detail: 'Routes, authorization, validation, migrations, and queries are exercised as one server.',
          },
          {
            icon: 'zap',
            label: 'Executable Proof',
            title: 'Launch claims have named checks.',
            detail: 'The release gate builds the server and probes the live management and ingestion workflows.',
          },
        ],
      },
    },
    {
      id: 'market',
      layout: 'market',
      eyebrow: 'Launch scope',
      title: 'A narrow wedge with an honest expansion boundary.',
      metrics: [
        { label: 'Live', value: 'Issues' },
        { label: 'Live', value: 'Alerts' },
        { label: 'Live', value: 'Settings' },
      ],
      extra: {
        segments: [
          { label: 'Core', value: 'Live', detail: 'Issues, alerts, and project administration.' },
          { label: 'Trust', value: 'Gated', detail: 'Every retained route reads live backend facts.' },
          { label: 'Growth', value: 'Later', detail: 'New modules require implementation and proof before a public claim.' },
        ],
      },
    },
    {
      id: 'business-model',
      layout: 'business-model',
      eyebrow: 'Access model',
      title: 'Private beta first. Commercial terms later.',
      extra: {
        tiers: [
          { name: 'Now', price: 'Beta', detail: 'Invitation-based access to the live launch surface.' },
          { name: 'Pricing', price: 'Unset', detail: 'No published prices, allowances, or paid entitlements.' },
          { name: 'Later', price: 'Gated', detail: 'Commercial offers must match a capability catalog entry and proof.' },
        ],
        flywheel: [
          { step: 'Detect', text: 'Errors become grouped, actionable incidents.' },
          { step: 'Triage', text: 'Context and ownership shorten time to action.' },
          { step: 'Resolve', text: 'Teams manage issue and alert lifecycle state.' },
          { step: 'Retain', text: 'Source-attributed evidence builds trust in the workflow.' },
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
        'Issue, in-product alert, and backed settings workflows implemented.',
      ],
      metrics: [
        { label: 'Compiler', value: 'Shipped' },
        { label: 'Launch gate', value: 'Executable' },
        { label: 'Mock routes', value: 'Removed' },
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
            focus: 'Compiler, backend, product workflows, and release proof ship together.',
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
          { label: 'Back the moat', detail: 'Prove that a Mesh-native backend can support a trusted product.' },
          { label: 'Back the scale', detail: 'Expand only after each new capability earns executable proof.' },
        ],
        close: 'hyperpush is the product that wins now. Mesh is the reason the upside keeps widening.',
      },
    },
  ],
}

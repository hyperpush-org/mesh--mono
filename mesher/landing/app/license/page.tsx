"use client"

import { InfoBox, LegalList, LegalPage, Section, SubSection } from "@/components/legal/legal-page"

export default function LicensePage() {
  return (
    <LegalPage title="License" lastUpdated="July 17, 2026">
      <InfoBox>
        <strong className="text-foreground">Summary:</strong> The current hyperpush repository is
        distributed under GNU AGPL version 3. No separate client SDK packages are part of the
        current launch surface.
      </InfoBox>

      <Section number="1" title="Overview" id="overview">
        <p>
          The repository&apos;s root license applies to the server, dashboard, landing site, API,
          ingestion pipeline, and other covered source files. Review the full license text before
          deploying, modifying, or redistributing the software.
        </p>
        <div className="mt-6 overflow-hidden rounded-xl border border-border bg-background p-6">
          <p className="mb-2 text-xs font-mono uppercase tracking-wider text-accent">Core platform</p>
          <p className="mb-2 text-xl font-bold text-foreground">AGPL-3.0</p>
          <p className="text-sm text-muted-foreground">Server, dashboard, landing site, API, and ingestion pipeline.</p>
        </div>
      </Section>

      <Section number="2" title="AGPL-3.0 — Core Platform" id="agpl">
        <p>The hyperpush core platform is licensed under GNU AGPL version 3.</p>
        <SubSection title="You Can">
          <LegalList items={[
            "Use hyperpush for commercial or non-commercial purposes",
            "Self-host hyperpush on your infrastructure",
            "Modify and distribute the source code",
            "Offer a modified version as a hosted service",
          ]} />
        </SubSection>
        <SubSection title="You Must">
          <LegalList items={[
            "Disclose source code for modifications to the covered core software",
            "License derivative works under AGPL-3.0",
            "Provide source access to users of a modified network service",
            "Preserve copyright and license notices",
            "Document changes to the original code",
          ]} />
        </SubSection>
      </Section>

      <Section number="3" title="Commercial Licensing" id="commercial">
        <p>
          If AGPL-3.0 does not fit your core-platform use case, contact <span className="text-accent">licensing@hyperpush.dev</span> to
          discuss whether another license is available. This is not a published paid-plan offer.
        </p>
      </Section>

      <Section number="4" title="Third-Party Components" id="third-party">
        <p>
          Third-party components retain their original licenses. Refer to dependency manifests and
          bundled notices for the terms that apply to each component.
        </p>
      </Section>

      <Section number="5" title="Trademark" id="trademark">
        <p>
          Software licenses do not grant permission to use the hyperpush name, logo, or brand in a
          way that implies endorsement.
        </p>
      </Section>

      <Section number="6" title="Full License Text" id="full-text">
        <LegalList items={["AGPL-3.0: /LICENSE in the repository root"]} />
        <p>For licensing questions, email licensing@hyperpush.dev.</p>
      </Section>
    </LegalPage>
  )
}

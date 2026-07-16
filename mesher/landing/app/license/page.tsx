"use client"

import { InfoBox, LegalList, LegalPage, Section, SubSection } from "@/components/legal/legal-page"

export default function LicensePage() {
  return (
    <LegalPage title="License" lastUpdated="July 15, 2026">
      <InfoBox>
        <strong className="text-foreground">Summary:</strong> hyperpush core is AGPL-3.0. Client SDKs
        are MIT-licensed. Commercial licensing is available for proprietary core use cases.
      </InfoBox>

      <Section number="1" title="Overview" id="overview">
        <p>
          hyperpush uses separate licenses for the core platform and client SDKs. Review the full
          license text before deploying or redistributing the software.
        </p>
        <div className="mt-6 grid gap-px overflow-hidden rounded-xl bg-border sm:grid-cols-2">
          <div className="bg-background p-6">
            <p className="mb-2 text-xs font-mono uppercase tracking-wider text-accent">Core Platform</p>
            <p className="mb-2 text-xl font-bold text-foreground">AGPL-3.0</p>
            <p className="text-sm text-muted-foreground">Server, dashboard, API, and ingestion pipeline.</p>
          </div>
          <div className="bg-background p-6">
            <p className="mb-2 text-xs font-mono uppercase tracking-wider text-accent">Client SDKs</p>
            <p className="mb-2 text-xl font-bold text-foreground">MIT</p>
            <p className="text-sm text-muted-foreground">JavaScript, Rust, Python, Node.js, and Mesh SDKs.</p>
          </div>
        </div>
      </Section>

      <Section number="2" title="AGPL-3.0 — Core Platform" id="agpl">
        <p>The hyperpush core platform is licensed under GNU AGPL version 3.</p>
        <SubSection title="You Can">
          <LegalList
            items={[
              "Use hyperpush for commercial or non-commercial purposes",
              "Self-host hyperpush on your infrastructure",
              "Modify and distribute the source code",
              "Offer a modified version as a hosted service",
            ]}
          />
        </SubSection>
        <SubSection title="You Must">
          <LegalList
            items={[
              "Disclose source code for modifications to the covered core software",
              "License derivative works under AGPL-3.0",
              "Provide source access to users of a modified network service",
              "Preserve copyright and license notices",
              "Document changes to the original code",
            ]}
          />
        </SubSection>
      </Section>

      <Section number="3" title="MIT — Client SDKs" id="mit">
        <p>hyperpush client SDKs use the permissive MIT License.</p>
        <SubSection title="What This Means">
          <LegalList
            items={[
              "Use the SDKs in proprietary or source-available applications",
              "No obligation to disclose your application's source code",
              "Modify and bundle SDKs in commercial software",
              "Preserve the MIT license notice in copies",
            ]}
          />
        </SubSection>
      </Section>

      <Section number="4" title="Commercial Licensing" id="commercial">
        <p>
          If AGPL-3.0 does not fit your core-platform use case, contact{" "}
          <span className="text-accent">licensing@hyperpush.dev</span> to discuss a commercial license.
        </p>
      </Section>

      <Section number="5" title="Third-Party Components" id="third-party">
        <p>
          Third-party components retain their original licenses. Refer to dependency manifests and
          bundled notices for the terms that apply to each component.
        </p>
      </Section>

      <Section number="6" title="Trademark" id="trademark">
        <p>
          Software licenses do not grant permission to use the hyperpush name, logo, or brand in a
          way that implies endorsement.
        </p>
      </Section>

      <Section number="7" title="Full License Texts" id="full-texts">
        <LegalList
          items={[
            "AGPL-3.0: /LICENSE in the repository root",
            "MIT: /LICENSE in each SDK package",
          ]}
        />
        <p>For licensing questions, email licensing@hyperpush.dev.</p>
      </Section>
    </LegalPage>
  )
}

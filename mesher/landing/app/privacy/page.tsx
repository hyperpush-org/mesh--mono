"use client"

import { InfoBox, LegalList, LegalPage, Section, SubSection } from "@/components/legal/legal-page"

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" lastUpdated="July 17, 2026">
      <InfoBox>
        <strong className="text-foreground">Summary:</strong> We collect only what is needed to
        provide the service. We never sell your data. Error data you send us is yours, and you can
        request its deletion at any time. We do not use advertising trackers. Optional, deployment-controlled
        Vercel Analytics and the waitlist processor are described below.
      </InfoBox>

      <Section number="1" title="Introduction" id="introduction">
        <p>
          hyperpush (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) operates the hyperpush error tracking platform,
          including the hosted service at hyperpush.dev, self-hosted installations, APIs, and
          related documentation (collectively, the &quot;Service&quot;).
        </p>
        <p>
          This Privacy Policy explains how we collect, use, share, and protect information when you
          use the Service.
        </p>
      </Section>

      <Section number="2" title="Information We Collect" id="information-collected">
        <SubSection title="Account Information">
          <p>When you create a hyperpush account, we collect:</p>
          <LegalList
            items={[
              "Email address",
              "Display name or username",
              "Organization or project name",
              "Authentication credentials (hashed — we never store plaintext passwords)",
            ]}
          />
        </SubSection>

        <SubSection title="Error & Event Data">
          <p>When your application sends events to hyperpush, we may receive:</p>
          <LegalList
            items={[
              "Stack traces and exception details",
              "Browser or runtime metadata (user agent, OS, and device information)",
              "Request URLs and HTTP headers",
              "Application environment tags, such as production or staging",
              "Custom context and tags you attach to events",
            ]}
          />
        </SubSection>

        <SubSection title="Usage Data">
          <p>We automatically collect basic service analytics:</p>
          <LegalList
            items={[
              "Pages viewed within the hyperpush dashboard",
              "Feature usage patterns",
              "API request volumes and error rates",
              "Session duration and frequency",
            ]}
          />
        </SubSection>
      </Section>

      <Section number="3" title="How We Use Your Information" id="how-we-use">
        <LegalList
          items={[
            "Provide, maintain, and improve the Service",
            "Process and display error events in your dashboard",
            "Detect abuse, fraud, and security incidents",
            "Generate aggregated and anonymized usage statistics",
          ]}
        />
      </Section>

      <Section number="4" title="Data Sharing" id="data-sharing">
        <p>
          <strong className="text-foreground">We never sell your personal data.</strong> We share
          information only in these limited circumstances:
        </p>
        <LegalList
          items={[
            "Infrastructure providers: the operator's hosting and database providers process service data to run the deployment.",
            "Formspree: when the waitlist is enabled and you submit it, Formspree processes your name and email to acknowledge the signup.",
            "Vercel Analytics: a deployment may enable privacy-focused page analytics with NEXT_PUBLIC_ENABLE_VERCEL_ANALYTICS; it is disabled by default in this source tree.",
            "Legal compliance: we may disclose information when required by law or valid legal process.",
            "Business transfer: data may transfer to a successor entity during a merger or acquisition.",
          ]}
        />
      </Section>

      <Section number="5" title="Data Retention" id="data-retention">
        <p>
          Error-event retention is configured per project from 1 to 365 days. The active value shown in
          project settings controls event cleanup; shared database partitions retain an additional safety margin.
        </p>
        <p>
          Account data is retained for the duration of your account. You may request deletion of
          your account and associated data at any time by emailing privacy@hyperpush.dev.
        </p>
      </Section>

      <Section number="6" title="Data Security" id="data-security">
        <LegalList
          items={[
            "TLS protects service connections when the deployment is configured behind HTTPS.",
            "Passwords and API-key secrets are stored as one-way hashes; API-key secrets are revealed only when created.",
            "Tenant-scoped owner, admin, and member authorization protects management routes.",
            "Sensitive management mutations create redacted audit records without request bodies or credentials.",
            "Storage encryption at rest is an infrastructure responsibility and depends on the selected hosting and database configuration.",
          ]}
        />
      </Section>

      <Section number="7" title="Your Rights" id="your-rights">
        <LegalList
          items={[
            "Access the personal data we hold about you",
            "Correct inaccurate data",
            "Delete your data",
            "Export your data in a portable format",
            "Object to or restrict certain processing",
            "Withdraw consent at any time",
          ]}
        />
        <p>
          To exercise these rights, contact <span className="text-accent">privacy@hyperpush.dev</span>.
        </p>
      </Section>

      <Section number="8" title="Cookies" id="cookies">
        <p>
          The current management API uses bearer sessions rather than authentication cookies. Individual
          deployments may add essential edge or authentication cookies and must disclose them. hyperpush does
          not use advertising cookies or tracking pixels in this source tree.
        </p>
      </Section>

      <Section number="9" title="Changes to This Policy" id="changes">
        <p>
          We may update this policy from time to time. Material changes will be communicated to
          account holders before they take effect when required by law.
        </p>
      </Section>

      <Section number="10" title="Contact" id="contact">
        <p>For privacy questions, email privacy@hyperpush.dev.</p>
      </Section>
    </LegalPage>
  )
}

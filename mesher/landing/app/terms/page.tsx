"use client"

import { InfoBox, LegalList, LegalPage, Section, SubSection } from "@/components/legal/legal-page"

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" lastUpdated="July 17, 2026">
      <InfoBox>
        <strong className="text-foreground">Summary:</strong> hyperpush is currently offered as a
        limited private beta with no published paid plans. Use it in good faith and do not abuse the
        service or other users.
      </InfoBox>

      <Section number="1" title="Acceptance of Terms" id="acceptance">
        <p>
          By accessing or using the hyperpush hosted service, self-hosted software, APIs,
          documentation, or related services (collectively, the &quot;Service&quot;), you agree to these Terms.
        </p>
        <p>
          If you use the Service for an organization, you represent that you have authority to bind
          that organization to these Terms.
        </p>
      </Section>

      <Section number="2" title="Description of Service" id="description">
        <p>The current private-beta surface includes:</p>
        <LegalList
          items={[
            "Authenticated, organization- and project-scoped dashboard access",
            "Error ingestion, grouping, issue lifecycle, stack traces, and breadcrumbs",
            "In-product alert detection and lifecycle management",
            "Sampling, retention, storage, membership, API-key, and alert-rule controls",
            "A self-hostable core platform",
          ]}
        />
        <p>Features not identified as live in the product may be changed, withheld, or removed.</p>
      </Section>

      <Section number="3" title="Account Registration" id="account">
        <LegalList items={[
          "Provide accurate registration information",
          "Maintain the security of your account credentials",
          "Notify us of unauthorized access",
          "Accept responsibility for activity under your account",
        ]} />
        <p>You must be at least 18 years old, or the age of majority in your jurisdiction.</p>
      </Section>

      <Section number="4" title="Acceptable Use" id="acceptable-use">
        <LegalList items={[
          "Do not violate applicable law or regulation",
          "Do not infringe the intellectual property rights of others",
          "Do not transmit malware, spam, or malicious content",
          "Do not access another user's account or data without authorization",
          "Do not interfere with the Service or its infrastructure",
          "Do not scrape or harvest Service data for unauthorized purposes",
          "Do not use the Service to compromise other systems",
        ]} />
      </Section>

      <Section number="5" title="Private Beta Access" id="access">
        <p>
          Private-beta access is invitation-based and may be limited, suspended, or ended while the
          service is evaluated. hyperpush has not published paid plans, prices, recurring billing,
          usage allowances, or paid feature entitlements. Any future commercial terms will be
          presented separately before they apply.
        </p>
      </Section>

      <Section number="6" title="Intellectual Property" id="ip">
        <SubSection title="Your Data">
          <p>
            You retain ownership of your error data, application code, and submitted content. You
            grant us a limited license to process that data only as needed to provide the Service.
          </p>
        </SubSection>
        <SubSection title="hyperpush Platform">
          <p>
            Software licenses are described on our <a href="/license" className="text-accent hover:underline">License page</a>.
            The hyperpush name, logo, and brand identity may not be used without permission.
          </p>
        </SubSection>
      </Section>

      <Section number="7" title="Disclaimer of Warranties" id="warranties">
        <p>
          THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND,
          EXPRESS OR IMPLIED. We do not guarantee uninterrupted operation or that every submitted
          event will be captured, retained, grouped, or alerted on.
        </p>
      </Section>

      <Section number="8" title="Limitation of Liability" id="liability">
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, HYPERPUSH SHALL NOT BE LIABLE FOR INDIRECT,
          INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM USE OF THE SERVICE.
        </p>
        <p>Our total liability shall not exceed $100.</p>
      </Section>

      <Section number="9" title="Termination" id="termination">
        <p>
          You may request termination of your account at any time. We may suspend or terminate
          access if you violate these Terms. Data is deleted according to the Privacy Policy.
        </p>
      </Section>

      <Section number="10" title="Governing Law" id="governing-law">
        <p>
          These Terms are governed by the laws of Delaware, United States, without regard to conflict
          of law provisions. Disputes shall be resolved in courts located in Delaware.
        </p>
      </Section>

      <Section number="11" title="Changes to Terms" id="changes">
        <p>Material changes will be communicated before they take effect when required by law.</p>
      </Section>

      <Section number="12" title="Contact" id="contact">
        <p>For questions about these Terms, email legal@hyperpush.dev.</p>
      </Section>
    </LegalPage>
  )
}

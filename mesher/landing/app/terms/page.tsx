"use client"

import { InfoBox, LegalList, LegalPage, Section, SubSection } from "@/components/legal/legal-page"

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" lastUpdated="July 15, 2026">
      <InfoBox>
        <strong className="text-foreground">Summary:</strong> Use hyperpush in good faith. Do not
        abuse the platform or other users. Paid plans provide higher limits and additional features.
      </InfoBox>

      <Section number="1" title="Acceptance of Terms" id="acceptance">
        <p>
          By accessing or using the hyperpush hosted service, self-hosted software, SDKs, APIs,
          documentation, or related services (collectively, the &quot;Service&quot;), you agree to these Terms.
        </p>
        <p>
          If you use the Service for an organization, you represent that you have authority to bind
          that organization to these Terms.
        </p>
      </Section>

      <Section number="2" title="Description of Service" id="description">
        <p>hyperpush provides production error tracking and application monitoring, including:</p>
        <LegalList
          items={[
            "Error capture, grouping, stack traces, and alerting",
            "SDKs for JavaScript, TypeScript, Node.js, Rust, Python, and Mesh",
            "Performance monitoring and release health",
            "AI-assisted error analysis on eligible plans",
            "Hosted and self-hosted deployment options",
          ]}
        />
      </Section>

      <Section number="3" title="Account Registration" id="account">
        <LegalList
          items={[
            "Provide accurate registration information",
            "Maintain the security of your account credentials",
            "Notify us of unauthorized access",
            "Accept responsibility for activity under your account",
          ]}
        />
        <p>You must be at least 18 years old, or the age of majority in your jurisdiction.</p>
      </Section>

      <Section number="4" title="Acceptable Use" id="acceptable-use">
        <LegalList
          items={[
            "Do not violate applicable law or regulation",
            "Do not infringe the intellectual property rights of others",
            "Do not transmit malware, spam, or malicious content",
            "Do not access another user's account or data without authorization",
            "Do not interfere with the Service or its infrastructure",
            "Do not scrape or harvest Service data for unauthorized purposes",
            "Do not use the Service to compromise other systems",
          ]}
        />
      </Section>

      <Section number="5" title="Plans & Billing" id="billing">
        <SubSection title="Starter Plan">
          <p>
            The Starter plan is free with a monthly event limit and the retention period shown on
            the pricing page. No credit card is required.
          </p>
        </SubSection>
        <SubSection title="Paid Plans">
          <p>Paid plans add higher event limits, longer retention, and advanced analysis.</p>
          <LegalList
            items={[
              "Billing is monthly and charged at the beginning of each billing period",
              "You may cancel at any time; access continues through the paid period",
              "Downgrades take effect at the next billing cycle",
              "We do not offer refunds for partial months except when required by law",
              "We notify you before enforcing event overage limits",
            ]}
          />
        </SubSection>
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
            Software licenses are described on our{" "}
            <a href="/license" className="text-accent hover:underline">License page</a>. The hyperpush
            name, logo, and brand identity may not be used without permission.
          </p>
        </SubSection>
      </Section>

      <Section number="7" title="Disclaimer of Warranties" id="warranties">
        <p>
          THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND,
          EXPRESS OR IMPLIED. We do not guarantee uninterrupted operation or the accuracy of
          AI-generated analysis.
        </p>
      </Section>

      <Section number="8" title="Limitation of Liability" id="liability">
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, HYPERPUSH SHALL NOT BE LIABLE FOR INDIRECT,
          INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM USE OF THE SERVICE.
        </p>
        <p>
          Our total liability shall not exceed the greater of the amount you paid us during the 12
          months before the claim or $100.
        </p>
      </Section>

      <Section number="9" title="Termination" id="termination">
        <p>
          You may terminate your account at any time. We may suspend or terminate access if you
          violate these Terms. Data is deleted according to the Privacy Policy retention schedule.
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

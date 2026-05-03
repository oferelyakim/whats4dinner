// Public terms of service. Linked from MorePage and from sign-up flows.
// Standard SaaS template — subscription, AI usage limits, US jurisdiction.
//
// EDIT BEFORE LAUNCH: replace EFFECTIVE_DATE + CONTACT_EMAIL + JURISDICTION
// with the real values for your business entity. Have a lawyer review.

import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

const EFFECTIVE_DATE = 'May 3, 2026'
const CONTACT_EMAIL = 'support@replanish.app'
const COMPANY_NAME = 'Replanish'
const JURISDICTION = 'the State of Delaware, United States'

export function TermsPage() {
  return (
    <div className="min-h-screen bg-rp-bg text-rp-ink">
      <header className="sticky top-0 z-10 bg-rp-bg/90 backdrop-blur border-b border-rp-line">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            to="/profile"
            className="rounded-full p-2 hover:bg-rp-bg-soft transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="font-display italic text-2xl text-rp-ink">Terms of Service</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 text-sm leading-relaxed text-rp-ink space-y-4 [&_h2]:font-display [&_h2]:italic [&_h2]:text-xl [&_h2]:text-rp-ink [&_h2]:mt-8 [&_h2]:mb-2 [&_ul]:list-disc [&_ul]:ps-6 [&_ul]:space-y-1 [&_a]:text-rp-brand [&_a]:underline [&_a]:underline-offset-2">
        <p className="text-xs text-rp-ink-mute">Effective {EFFECTIVE_DATE}</p>

        <p>
          These Terms of Service ("Terms") are a legal agreement between you
          and {COMPANY_NAME} ("we", "us") for your use of the {COMPANY_NAME}
          web application, mobile installation (PWA), and related services
          (the "Service"). By creating an account or using the Service, you
          agree to these Terms and to our Privacy Policy.
        </p>

        <h2>1. Eligibility</h2>
        <p>
          You must be at least 13 years old to use the Service. If you are
          under 18, you must have a parent or legal guardian who agrees to
          these Terms on your behalf.
        </p>

        <h2>2. Your account</h2>
        <p>
          You are responsible for keeping your sign-in credentials secure and
          for any activity that happens under your account. Notify us
          immediately if you suspect unauthorized access. You may not let
          another person use your account, but you may invite others to share
          your circles, lists, events, etc.
        </p>

        <h2>3. Subscriptions and payment</h2>
        <ul>
          <li>
            The Service has a free tier and a paid tier ("Replanish AI"),
            currently offered at $6 per month or $60 per year. The annual
            plan includes a 14-day free trial.
          </li>
          <li>
            All payments are processed by Stripe. You authorize us (through
            Stripe) to charge your payment method on the schedule you select
            until you cancel.
          </li>
          <li>
            Subscriptions auto-renew at the end of each billing period unless
            cancelled at least 24 hours before renewal.
          </li>
          <li>
            Cancellations take effect at the end of the current billing
            period. We do not provide refunds for partial periods except
            where required by law.
          </li>
          <li>
            Prices may change. We will notify you at least 30 days before any
            price change affects your subscription.
          </li>
        </ul>

        <h2>4. AI features and limits</h2>
        <p>
          Paid AI features (per-meal swap, pantry reroll, unlimited URL
          imports, smart shopping consolidation, AI event planner, AI chat)
          are subject to a fair-use monthly cost cap. We reserve the right
          to throttle or temporarily disable AI features if your usage in
          any month exceeds reasonable household-scale consumption.
        </p>
        <p>
          AI-generated recipes and plans are suggestions, not professional
          advice. You are responsible for verifying ingredient lists,
          allergen safety, and dietary suitability for your household.
          {' '}{COMPANY_NAME} does not provide medical, nutritional, or
          dietary advice.
        </p>

        <h2>5. Your content</h2>
        <p>
          You retain ownership of the content you create in the Service
          (recipes, lists, photos, notes, etc.). You grant us a worldwide,
          royalty-free license to host, copy, transmit, and display your
          content solely for the purpose of providing the Service to you and
          to the circle members you choose to share it with.
        </p>
        <p>
          You may import recipes from third-party websites for personal use.
          You are responsible for respecting those sites' terms and copyright.
          Recipes you import via URL may, when manually approved by us via an
          internal review process, be added to a shared community recipe
          catalogue with personal identifiers removed.
        </p>

        <h2>6. Acceptable use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Use the Service for unlawful purposes.</li>
          <li>Upload malware, spam, or content that infringes others' rights.</li>
          <li>Reverse-engineer, scrape, or attempt to circumvent technical limits (including the per-user AI cost cap).</li>
          <li>Impersonate others or misrepresent your affiliation.</li>
          <li>Resell the Service or use it to operate a competing service.</li>
        </ul>

        <h2>7. Termination</h2>
        <p>
          You may delete your account at any time from Settings. We may
          suspend or terminate your access if you breach these Terms, abuse
          the Service, or fail to pay. We will give reasonable notice except
          where prompt action is needed to protect the Service or other users.
        </p>

        <h2>8. Service changes</h2>
        <p>
          We are actively developing the Service. Features may change, be
          added, or be retired. We will not materially reduce the
          functionality of a paid tier without offering a refund or credit
          for the unused portion of your subscription.
        </p>

        <h2>9. Disclaimer of warranties</h2>
        <p>
          THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT
          WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF
          MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
          NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE
          UNINTERRUPTED, ERROR-FREE, OR SECURE.
        </p>

        <h2>10. Limitation of liability</h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT WILL{' '}
          {COMPANY_NAME.toUpperCase()} BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
          SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF
          PROFITS, DATA, OR GOODWILL, ARISING FROM YOUR USE OF THE SERVICE.
          OUR TOTAL LIABILITY FOR ANY CLAIM RELATED TO THE SERVICE IS LIMITED
          TO THE GREATER OF (a) THE AMOUNT YOU PAID US IN THE 12 MONTHS
          BEFORE THE CLAIM AROSE, OR (b) USD $50.
        </p>

        <h2>11. Indemnification</h2>
        <p>
          You agree to indemnify and hold {COMPANY_NAME} harmless from any
          claim arising from your content, your breach of these Terms, or
          your misuse of the Service.
        </p>

        <h2>12. Governing law and disputes</h2>
        <p>
          These Terms are governed by the laws of {JURISDICTION}, without
          regard to conflict-of-laws rules. Disputes will be resolved in the
          state or federal courts located in {JURISDICTION}, except that
          either party may bring an action for injunctive relief in any
          competent court.
        </p>

        <h2>13. Changes to these Terms</h2>
        <p>
          We may revise these Terms from time to time. Material changes will
          be announced in-app or by email at least 14 days before they take
          effect. Continued use of the Service after the effective date means
          you accept the revised Terms.
        </p>

        <h2>14. Contact</h2>
        <p>
          Questions about these Terms:{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>

        <p className="text-xs text-rp-ink-mute mt-8">
          This document is provided as a starting point and does not
          constitute legal advice. Consult a lawyer to tailor it to your
          jurisdiction and business model before relying on it.
        </p>
      </main>
    </div>
  )
}

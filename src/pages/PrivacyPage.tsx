// Public privacy policy. Linked from MorePage and from sign-up flows.
// Standard SaaS template — Stripe + Supabase + Anthropic disclosures.
//
// EDIT BEFORE LAUNCH: replace EFFECTIVE_DATE + CONTACT_EMAIL + JURISDICTION
// with the real values for your business entity.

import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

const EFFECTIVE_DATE = 'May 3, 2026'
const CONTACT_EMAIL = 'privacy@replanish.app'
const COMPANY_NAME = 'Replanish'

export function PrivacyPage() {
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
          <h1 className="font-display italic text-2xl text-rp-ink">Privacy Policy</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 text-sm leading-relaxed text-rp-ink space-y-4 [&_h2]:font-display [&_h2]:italic [&_h2]:text-xl [&_h2]:text-rp-ink [&_h2]:mt-8 [&_h2]:mb-2 [&_ul]:list-disc [&_ul]:ps-6 [&_ul]:space-y-1 [&_a]:text-rp-brand [&_a]:underline [&_a]:underline-offset-2">
        <p className="text-xs text-rp-ink-mute">Effective {EFFECTIVE_DATE}</p>

        <p>
          {COMPANY_NAME} ("we", "us") provides a family household management
          app. This policy describes what personal information we collect when
          you use the app, how we use it, who we share it with, and your rights.
          By using {COMPANY_NAME} you agree to this policy.
        </p>

        <h2>1. Information we collect</h2>
        <ul>
          <li>
            <strong>Account information</strong>: name, email address, password
            hash, profile picture (optional), language preference. Provided by
            you at sign-up or via Google sign-in.
          </li>
          <li>
            <strong>Content you create</strong>: circles, recipes, shopping
            lists, meal plans, events, chores, activities, and any photos or
            text you add. Visible to other members of the circles you share
            this content with.
          </li>
          <li>
            <strong>Usage data</strong>: AI request counts and approximate cost
            (used to enforce per-user monthly limits), pages visited, basic
            device + browser information, error reports.
          </li>
          <li>
            <strong>Payment information</strong>: handled exclusively by Stripe
            (see "Service providers" below). We never see your full card number
            or bank details — we receive only a payment status and a customer
            ID from Stripe.
          </li>
        </ul>

        <h2>2. How we use it</h2>
        <ul>
          <li>To provide the service: render your data in the app, sync it across your devices, share it with your circle members.</li>
          <li>To improve the service: aggregate analytics, error monitoring, performance measurement.</li>
          <li>To communicate: transactional emails (sign-up, password reset, billing receipts). We do not send marketing email without separate opt-in.</li>
          <li>To enforce subscription limits and prevent abuse.</li>
          <li>To comply with legal obligations.</li>
        </ul>

        <h2>3. Service providers we share with</h2>
        <ul>
          <li>
            <strong>Supabase</strong> (database, auth, file storage,
            real-time sync). All your account and content data is stored in
            Supabase's US-based infrastructure. See{' '}
            <a href="https://supabase.com/privacy" target="_blank" rel="noreferrer">supabase.com/privacy</a>.
          </li>
          <li>
            <strong>Stripe</strong> (payment processing). When you subscribe,
            you transact directly with Stripe. See{' '}
            <a href="https://stripe.com/privacy" target="_blank" rel="noreferrer">stripe.com/privacy</a>.
          </li>
          <li>
            <strong>Anthropic</strong> (AI processing). When you use AI
            features (recipe import, per-meal swap, event planner, AI chat),
            the relevant inputs are sent to Anthropic's Claude API for
            processing. Anthropic does not train on data submitted via the API.
            See <a href="https://www.anthropic.com/privacy" target="_blank" rel="noreferrer">anthropic.com/privacy</a>.
          </li>
          <li>
            <strong>Vercel</strong> (web hosting). Standard server logs (IP
            address, user agent, request path) are retained briefly. See{' '}
            <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noreferrer">vercel.com/legal/privacy-policy</a>.
          </li>
        </ul>
        <p>
          We do not sell your personal information. We do not share content you
          create with anyone outside the circle members you grant access to,
          except as required by law.
        </p>

        <h2>4. Cookies and local storage</h2>
        <p>
          We use first-party cookies and browser storage (localStorage,
          IndexedDB) for essential functions: keeping you signed in, caching
          shopping lists for offline use, remembering your locale, font-size,
          and theme preferences. We do not use third-party advertising cookies.
        </p>

        <h2>5. Your rights</h2>
        <ul>
          <li><strong>Access</strong>: request a copy of the data we hold about you.</li>
          <li><strong>Correction</strong>: edit your profile in-app, or email us for fields you can't change yourself.</li>
          <li><strong>Deletion</strong>: delete your account in Settings, or email us. We will remove your personal data within 30 days, subject to legal retention requirements.</li>
          <li><strong>Portability</strong>: request an export of your content in JSON.</li>
          <li><strong>Opt-out of analytics</strong>: contact us using the email below.</li>
        </ul>
        <p>
          If you are in the European Economic Area, the United Kingdom, or
          California, you may have additional rights under GDPR / UK GDPR /
          CCPA. Contact us using the address below to exercise them.
        </p>

        <h2>6. Children</h2>
        <p>
          {COMPANY_NAME} is not directed at children under 13. If you believe
          we hold personal information about a child under 13, contact us and
          we will delete it.
        </p>

        <h2>7. Security</h2>
        <p>
          We use industry-standard practices: encrypted transport (HTTPS),
          encrypted storage, row-level access controls, and least-privilege
          credentials. No system is perfectly secure; we cannot guarantee
          absolute security but we will notify affected users without undue
          delay if we become aware of a breach involving their data.
        </p>

        <h2>8. International transfers</h2>
        <p>
          Your data may be stored in or transferred to the United States.
          Where required, we rely on Standard Contractual Clauses or
          equivalent legal mechanisms.
        </p>

        <h2>9. Changes to this policy</h2>
        <p>
          We will update this policy as the service evolves. Material changes
          will be announced in-app or by email. The "Effective" date at the
          top of this page reflects the most recent revision.
        </p>

        <h2>10. Contact</h2>
        <p>
          Questions, requests, or complaints:{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>

        <p className="text-xs text-rp-ink-mute mt-8">
          This policy is provided for informational purposes and is not legal
          advice. Consult a lawyer to ensure compliance with the laws that
          apply to your situation.
        </p>
      </main>
    </div>
  )
}

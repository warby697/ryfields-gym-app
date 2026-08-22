import { Link } from 'react-router-dom'

function LegalShell({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return <main className="register-page"><section className="register-card legal-card">
    <img className="auth-logo" src="/logo.png" alt="Ryfields Gym" />
    <h1>{title}</h1>
    <p className="legal-updated">Last updated {updated}</p>
    <div className="legal-body">{children}</div>
    <p className="login-link"><Link to="/register">Back to sign up</Link> · <Link to="/login">Sign in</Link></p>
  </section></main>
}

export function TermsPage() {
  return <LegalShell title="Terms & conditions" updated="20 July 2026">
    <h2>1. About us</h2>
    <p>Ryfields Gym ("we", "us") operates a members' gym in Warrington. These terms apply to all memberships, day passes and class bookings made through this app or in the gym.</p>
    <h2>2. Membership</h2>
    <p>Your membership starts when your first payment is set up and gives you access to the gym every day between 6am and 8pm. Memberships are personal to you and must not be shared — every visitor must check in on their own membership.</p>
    <p>Monthly memberships are paid by Direct Debit or card and renew each month. There is no minimum term: you can cancel at any time by cancelling your Direct Debit with your bank, and your membership ends at the close of the period you have paid for. Annual memberships run for 12 months from payment and are not refundable part-way through the year.</p>
    <p>If a payment fails we will retry it. Your access continues while we retry, but repeated failed payments may lead to your membership being suspended or cancelled.</p>
    <h2>3. Teen memberships</h2>
    <p>Teen memberships (ages 13–17) must be linked to an adult member, who is responsible for the teen's conduct and for these terms on their behalf.</p>
    <h2>4. Classes</h2>
    <p>Class places are limited and allocated on booking. Included class credits are for your use only, do not carry over beyond the stated limit, and have no cash value. If you cannot attend, please cancel your booking so the place can go to someone else. We may change instructors, move or cancel classes; where a paid class is cancelled by us you will be offered a transfer or refund of that class.</p>
    <h2>5. Using the gym safely</h2>
    <p>The gym is unstaffed for much of the day. You must complete the health questionnaire honestly before training, follow all posted safety guidance, use equipment only as intended, and put equipment away after use. If you feel unwell, stop training. In an emergency call 999. You exercise at your own risk to the extent permitted by law; nothing in these terms limits our liability for death or personal injury caused by our negligence.</p>
    <h2>6. Behaviour</h2>
    <p>Be decent to other members and the space. We may suspend or cancel, without refund, memberships used fraudulently or where behaviour is dangerous, abusive or damages the gym.</p>
    <h2>7. CCTV and access records</h2>
    <p>The gym is monitored by CCTV for the safety and security of members, and check-ins are recorded. See the privacy notice for how this data is handled.</p>
    <h2>8. Changes</h2>
    <p>We may update these terms from time to time. If we make a material change we will tell you in the app or by email before it takes effect.</p>
    <h2>9. Contact</h2>
    <p>Questions about these terms: contact us through the details at ryfieldsgym.com/contact.</p>
  </LegalShell>
}

export function PrivacyPage() {
  return <LegalShell title="Privacy notice" updated="20 July 2026">
    <p>Ryfields Gym is the data controller for the personal information handled in this app. This notice explains what we collect and why, in line with UK GDPR.</p>
    <h2>What we collect</h2>
    <p>Account and membership details (name, email, phone, date of birth, address), your emergency contact, payment status from our payment providers, your gym check-ins and class bookings, and the answers you give in the health questionnaire (PAR-Q), including any medical details you choose to share. The gym is also monitored by CCTV.</p>
    <h2>Why we collect it</h2>
    <p>To run your membership and bookings (performance of our contract with you); to keep you safe while training and reach your emergency contact if needed (legitimate interests and, for health information, your explicit consent given when you complete the questionnaire); to take payment and prevent fraud (legal obligation and legitimate interests); and to send you service messages about your membership. We will only send marketing where you have not opted out, and you can opt out at any time.</p>
    <h2>Payments</h2>
    <p>Payments are processed by GoCardless (Direct Debit) and Stripe (cards). We never see or store your bank or card details — they are collected directly by those providers under their own privacy notices.</p>
    <h2>Who we share it with</h2>
    <p>Our payment providers (GoCardless, Stripe), and the services that host this app and its data (Netlify, Google Firebase). We do not sell your information to anyone.</p>
    <h2>How long we keep it</h2>
    <p>For as long as you have an account with us, and afterwards only as long as we need it for legal or accounting reasons. CCTV footage is kept for a short rolling period unless needed for an incident.</p>
    <h2>Your rights</h2>
    <p>You can ask for a copy of your information, ask us to correct it, or ask us to delete it where we no longer need it. You can also complain to the Information Commissioner's Office (ico.org.uk). To exercise any of these, contact us through ryfieldsgym.com/contact.</p>
  </LegalShell>
}

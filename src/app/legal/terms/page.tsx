export default function TermsPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-4xl font-bold mb-4">Terms of Service</h1>
        <p className="text-gray-400 mb-8">Last updated: {new Date().toLocaleDateString()}</p>
        
        <div className="space-y-6 text-gray-300 leading-relaxed">
          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">1. Acceptance of Terms</h2>
            <p>
              By accessing or using SmartSend AI, you agree to be bound by these Terms of Service and all applicable laws and regulations. If you do not agree, do not use SmartSend AI.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">2. Description of Service</h2>
            <p>
              SmartSend AI provides email automation, lead management, and AI-powered outreach tools. The service is subject to availability and may be updated or discontinued at any time.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">3. User Responsibilities</h2>
            <p className="mb-3">
              You are responsible for:
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-3">
              <li>Compliance with all applicable laws, including CAN-SPAM, GDPR, and anti-spam regulations</li>
              <li>Obtaining proper consent before sending emails to recipients</li>
              <li>Maintaining the security of your account credentials</li>
              <li>Ensuring your email content does not violate any laws or infringe on rights</li>
            </ul>
            <p>
              You agree not to use SmartSend AI for spam, fraudulent activities, or any illegal purposes.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">4. Payment and Billing</h2>
            <p className="mb-3">
              Subscription fees are billed monthly or annually based on your selected plan. Payments are processed securely through Stripe.
            </p>
            <p>
              You may cancel your subscription at any time. No refunds are provided for partial billing periods.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">5. Disclaimers</h2>
            <p className="mb-3">
              SmartSend AI is provided "as is" without warranties of any kind, express or implied. We do not guarantee uninterrupted or error-free service.
            </p>
            <p>
              We are not responsible for the content of emails sent through our platform or the actions of third-party integrations.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">6. Limitation of Liability</h2>
            <p>
              To the fullest extent permitted by law, SmartSend AI and its operators are not liable for any indirect, incidental, special, or consequential damages arising from your use of the service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">7. Termination</h2>
            <p>
              We reserve the right to suspend or terminate your account if you violate these Terms. You may terminate your account at any time through your account settings.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">8. Contact Us</h2>
            <p>
              For questions about these Terms of Service, contact us at legal@smartsendhq.com.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}


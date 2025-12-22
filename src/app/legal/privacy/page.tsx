export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-4xl font-bold mb-4">Privacy Policy</h1>
        <p className="text-gray-400 mb-8">Last updated: {new Date().toLocaleDateString()}</p>
        
        <div className="space-y-6 text-gray-300 leading-relaxed">
          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">1. Information We Collect</h2>
            <p className="mb-3">
              We collect information you provide when you sign up for SmartSend AI, including your email address, name, and payment information processed securely through Stripe.
            </p>
            <p>
              We also collect usage data to improve our service, including email activity, features used, and technical logs.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">2. How We Use Your Information</h2>
            <p className="mb-3">
              We use your information to provide, maintain, and improve SmartSend AI, process payments, send service-related communications, and respond to your requests.
            </p>
            <p>
              We do not sell your personal information to third parties.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">3. Data Storage and Security</h2>
            <p className="mb-3">
              Your data is stored securely using industry-standard encryption. We use Supabase for database hosting and follow best practices for data protection.
            </p>
            <p>
              Payment information is processed by Stripe. We never see or store full card numbers.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">4. Your Rights</h2>
            <p className="mb-3">
              You have the right to access, update, or delete your personal information. You may also request a copy of your data at any time.
            </p>
            <p>
              To exercise these rights, contact us at privacy@smartsendhq.com.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">5. Third-Party Services</h2>
            <p>
              SmartSend AI integrates with third-party services including Stripe (payments), Supabase (database), and email providers. These services have their own privacy policies governing your data.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">6. Contact Us</h2>
            <p>
              For questions about this Privacy Policy, contact us at privacy@smartsendhq.com.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}


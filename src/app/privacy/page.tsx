export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-4">Privacy Policy</h1>
      <p className="text-slate-600 mb-6">Last updated: {new Date().toLocaleDateString()}</p>
      <div className="space-y-4 text-slate-700 leading-relaxed">
        <p>
          We collect account information you provide (such as email) and usage data to improve SmartSendAI. We use Stripe to process
          payments; we never see or store full card numbers.
        </p>
        <p>
          Your generated content is stored to support your workflows. You may request deletion by contacting support@smartsendai.org.
        </p>
        <p>
          For questions about this policy, email support@smartsendai.org.
        </p>
      </div>
    </div>
  )
}


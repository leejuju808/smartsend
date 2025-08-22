export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-4">Terms of Service</h1>
      <p className="text-slate-600 mb-6">Last updated: {new Date().toLocaleDateString()}</p>
      <div className="space-y-4 text-slate-700 leading-relaxed">
        <p>
          These Terms govern your access to and use of SmartSendAI. By using the app, you agree to these Terms.
        </p>
        <p>
          SmartSendAI provides tools for generating and managing outreach emails. You are responsible for complying with applicable
          laws, including anti-spam regulations and email sending best practices.
        </p>
        <p>
          The service is provided “as is” without warranties. To the fullest extent permitted by law, SmartSendAI is not liable for any
          indirect or consequential damages arising from your use of the service.
        </p>
        <p>
          Contact support@smartsendai.org with questions about these Terms.
        </p>
      </div>
    </div>
  )
}


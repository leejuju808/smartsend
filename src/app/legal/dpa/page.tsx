export default function DPAPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-4xl font-bold mb-4">Data Processing Agreement</h1>
        <p className="text-gray-400 mb-8">Last updated: {new Date().toLocaleDateString()}</p>
        
        <div className="space-y-6 text-gray-300 leading-relaxed">
          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">1. Scope</h2>
            <p>
              This Data Processing Agreement (DPA) governs the processing of personal data by SmartSend AI in connection with providing our services to you.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">2. Data Processing Details</h2>
            <p className="mb-3">
              <strong className="text-white">Purpose:</strong> Providing email automation and outreach services
            </p>
            <p className="mb-3">
              <strong className="text-white">Duration:</strong> For the duration of your subscription and as required by law
            </p>
            <p className="mb-3">
              <strong className="text-white">Types of Data:</strong> Contact information, email content, usage logs, and technical data
            </p>
            <p>
              <strong className="text-white">Data Subjects:</strong> Your customers, leads, and contacts you import into SmartSend AI
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">3. Our Obligations</h2>
            <p className="mb-3">
              As a data processor, SmartSend AI will:
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-3">
              <li>Process data only in accordance with your instructions and this DPA</li>
              <li>Implement appropriate technical and organizational measures to protect personal data</li>
              <li>Assist you in responding to data subject requests</li>
              <li>Notify you of any data breaches without undue delay</li>
              <li>Only engage sub-processors with your authorization</li>
            </ul>
            <p>
              All data is stored and processed using industry-standard encryption and security measures.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">4. Your Obligations</h2>
            <p>
              You, as the data controller, are responsible for ensuring you have lawful grounds to process personal data and that you've obtained necessary consents from data subjects.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">5. Sub-Processors</h2>
            <p className="mb-3">
              We use the following sub-processors to provide our service:
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-3">
              <li><strong className="text-white">Supabase:</strong> Database hosting and authentication</li>
              <li><strong className="text-white">Stripe:</strong> Payment processing</li>
              <li><strong className="text-white">Email Providers:</strong> SMTP and email delivery services</li>
            </ul>
            <p>
              All sub-processors are bound by appropriate data protection agreements.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">6. Data Retention and Deletion</h2>
            <p>
              We retain personal data for as long as necessary to provide our services and as required by law. Upon termination of your account, we will delete your data in accordance with our data retention policies.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">7. International Transfers</h2>
            <p>
              Your data may be transferred to and processed in countries outside your jurisdiction. We ensure appropriate safeguards are in place for such transfers.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-3">8. Contact Us</h2>
            <p>
              For questions about this DPA or to exercise your data protection rights, contact us at dpo@smartsendhq.com.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}


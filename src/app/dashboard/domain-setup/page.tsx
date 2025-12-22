"use client";

import { useState } from "react";
import { CheckCircleIcon, XCircleIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";

type CheckResult = {
  ok: boolean;
  found?: string[];
  want?: string;
  help?: string;
};

type DomainCheckResponse = {
  verified: boolean;
  results: {
    spf: CheckResult;
    dkim: CheckResult;
    dmarc: CheckResult;
    tracking: CheckResult;
  };
};

export default function DomainSetup() {
  const [domain, setDomain] = useState("");
  const [provider, setProvider] = useState("brevo");
  const [selector, setSelector] = useState("mail");
  const [track, setTrack] = useState("t");
  const [dkimSample, setDkimSample] = useState("");
  const [res, setRes] = useState<DomainCheckResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkDomain = async () => {
    if (!domain.trim()) {
      setError("Please enter a domain");
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch("/api/domain/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          domain: domain.trim(), 
          provider, 
          selector, 
          trackSub: track, 
          dkimValueSample: dkimSample.trim() || undefined 
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to check domain");
      }
      
      const result = await response.json();
      setRes(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const CheckCard = ({ title, data }: { title: string; data: CheckResult }) => (
    <div className={`rounded-xl border p-4 ${
      data?.ok ? "border-green-500 bg-green-50" : "border-neutral-300 bg-white"
    }`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <div className="flex items-center space-x-2">
          {data?.ok ? (
            <>
              <CheckCircleIcon className="h-5 w-5 text-green-600" />
              <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 font-medium">
                Verified
              </span>
            </>
          ) : (
            <>
              <XCircleIcon className="h-5 w-5 text-red-600" />
              <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700 font-medium">
                Needs Setup
              </span>
            </>
          )}
        </div>
      </div>
      
      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium text-gray-700 mb-1">Required Value:</p>
          <code className="text-xs bg-gray-100 p-2 rounded block break-all">
            {data?.want || "—"}
          </code>
        </div>
        
        <div>
          <p className="text-sm font-medium text-gray-700 mb-1">Current DNS Records:</p>
          <div className="bg-gray-50 p-2 rounded max-h-24 overflow-auto">
            {data?.found && data.found.length > 0 ? (
              data.found.map((record, index) => (
                <code key={index} className="text-xs block mb-1 break-all">
                  {record}
                </code>
              ))
            ) : (
              <p className="text-xs text-gray-500">No records found</p>
            )}
          </div>
        </div>
        
        <div>
          <p className="text-sm text-gray-600">{data?.help}</p>
        </div>
      </div>
    </div>
  );

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-3">Domain Setup Wizard</h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Verify your domain's DNS records for optimal email deliverability. 
          This ensures your emails reach the inbox instead of spam folders.
        </p>
      </div>

      {/* Setup Form */}
      <div className="bg-white rounded-xl border p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Domain Configuration</h2>
        
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Domain Name *
            </label>
            <input 
              className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
              placeholder="yourdomain.com" 
              value={domain} 
              onChange={(e) => setDomain(e.target.value)}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email Provider
            </label>
            <select 
              className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
              value={provider} 
              onChange={(e) => setProvider(e.target.value)}
            >
              <option value="brevo">Brevo (formerly Sendinblue)</option>
              <option value="mailersend">MailerSend</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              DKIM Selector
            </label>
            <input 
              className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
              value={selector} 
              onChange={(e) => setSelector(e.target.value)}
              placeholder="mail"
            />
            <p className="text-xs text-gray-500 mt-1">
              Usually "mail" for most providers
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tracking Subdomain
            </label>
            <input 
              className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
              value={track} 
              onChange={(e) => setTrack(e.target.value)}
              placeholder="t"
            />
            <p className="text-xs text-gray-500 mt-1">
              Creates t.yourdomain.com for tracking
            </p>
          </div>
        </div>
        
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            DKIM TXT Value (Optional)
          </label>
          <textarea 
            className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
            rows={3} 
            value={dkimSample} 
            onChange={(e) => setDkimSample(e.target.value)}
            placeholder="Paste your provider's DKIM TXT value for exact matching..."
          />
          <p className="text-xs text-gray-500 mt-1">
            Paste the exact DKIM value from your email provider for precise verification
          </p>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center space-x-2">
              <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />
              <span className="text-sm text-red-700">{error}</span>
            </div>
          </div>
        )}

        <div className="mt-6">
          <button 
            disabled={!domain.trim() || loading} 
            onClick={checkDomain} 
            className="w-full md:w-auto px-6 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <div className="flex items-center justify-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Checking DNS...</span>
              </div>
            ) : (
              "Run DNS Check"
            )}
          </button>
        </div>
      </div>

      {/* Results */}
      {res && (
        <div className="space-y-6">
          <div className="text-center">
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">DNS Verification Results</h2>
            <div className={`inline-flex items-center space-x-2 px-4 py-2 rounded-full ${
              res.verified 
                ? "bg-green-100 text-green-800" 
                : "bg-yellow-100 text-yellow-800"
            }`}>
              {res.verified ? (
                <>
                  <CheckCircleIcon className="h-5 w-5" />
                  <span className="font-medium">Domain Verified - Ready to Send!</span>
                </>
              ) : (
                <>
                  <ExclamationTriangleIcon className="h-5 w-5" />
                  <span className="font-medium">Verification Incomplete - Fix Issues Below</span>
                </>
              )}
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <CheckCard title="SPF Record (TXT @ root domain)" data={res.results.spf} />
            <CheckCard title="DKIM Record (TXT selector._domainkey)" data={res.results.dkim} />
            <CheckCard title="DMARC Record (TXT _dmarc)" data={res.results.dmarc} />
            <CheckCard title="Tracking CNAME (t.domain → provider)" data={res.results.tracking} />
          </div>

          <div className={`p-6 rounded-xl border ${
            res.verified 
              ? "bg-green-50 border-green-200" 
              : "bg-yellow-50 border-yellow-200"
          }`}>
            <div className="text-center">
              {res.verified ? (
                <div className="space-y-2">
                  <CheckCircleIcon className="h-12 w-12 text-green-600 mx-auto" />
                  <h3 className="text-lg font-semibold text-green-800">
                    Congratulations! Your domain is verified.
                  </h3>
                  <p className="text-green-700">
                    You can now send emails from addresses using this domain with optimal deliverability.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <ExclamationTriangleIcon className="h-12 w-12 text-yellow-600 mx-auto" />
                  <h3 className="text-lg font-semibold text-yellow-800">
                    Domain verification incomplete
                  </h3>
                  <p className="text-yellow-700">
                    Fix the issues above by adding the required DNS records at your domain registrar, 
                    then run the check again.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="text-center">
            <button 
              onClick={checkDomain}
              className="px-6 py-3 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 transition-colors"
            >
              Re-check Domain
            </button>
          </div>
        </div>
      )}

      {/* Help Section */}
      <div className="bg-blue-50 rounded-xl border border-blue-200 p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-3">Need Help?</h3>
        <div className="text-blue-800 space-y-2">
          <p className="text-sm">
            • <strong>SPF:</strong> Authorizes your email provider to send emails from your domain
          </p>
          <p className="text-sm">
            • <strong>DKIM:</strong> Digitally signs your emails to prove they're authentic
          </p>
          <p className="text-sm">
            • <strong>DMARC:</strong> Tells receiving servers how to handle emails that fail SPF/DKIM
          </p>
          <p className="text-sm">
            • <strong>Tracking CNAME:</strong> Enables click and open tracking for your emails
          </p>
        </div>
        <p className="text-sm text-blue-700 mt-3">
          After adding DNS records, wait 5-10 minutes for propagation before re-checking.
        </p>
      </div>
    </main>
  );
} 
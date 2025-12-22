/**
 * Block 23200 — Silent Forge Beta Group Application Form
 * Public application page for roofing companies
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SilentForgeApplyPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    company_name: '',
    contact_person: '',
    contact_email: '',
    contact_phone: '',
    service_area: '',
    annual_revenue: '',
    has_crew: false,
    crew_count: 0,
    has_office_person: false,
    owner_is_organized: false,
    uses_email_daily: false,
    uses_phone_daily: false,
    hungry_for_improvement: false,
    agreed_to_rules: false
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/silent-forge/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit application');
      }

      setSuccess(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="mb-4">
            <svg className="mx-auto h-12 w-12 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Application Submitted!</h2>
          <p className="text-gray-600 mb-6">
            We've received your application for the Silent Forge Beta Group. 
            We'll review your qualifications and get back to you soon.
          </p>
          <button
            onClick={() => router.push('/')}
            className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Silent Forge Beta Group
          </h1>
          <p className="text-xl text-gray-600 mb-2">
            5–10 Roofing Companies • Invitation-Only • Real-World Testing
          </p>
          <p className="text-gray-500">
            This is where SmartSend becomes a WEAPON — not theory, not mockups, not prototypes — REAL JOBS, REAL MONEY, REAL OPERATIONS.
          </p>
        </div>

        {/* Qualification Criteria */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
          <h2 className="text-lg font-semibold text-blue-900 mb-4">Who Gets Into Silent Forge</h2>
          <ul className="space-y-2 text-sm text-blue-800">
            <li>✔ $500K–$3M roofing business</li>
            <li>✔ Has at least 1 crew</li>
            <li>✔ Has 1 office person OR the owner is organized</li>
            <li>✔ Uses email & phone daily</li>
            <li>✔ Hungry for improvement</li>
            <li>✔ Agrees to the rules (silent, private, honest feedback)</li>
          </ul>
        </div>

        {/* Application Form */}
        <form onSubmit={handleSubmit} className="bg-white shadow-lg rounded-lg p-8">
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div className="space-y-6">
            {/* Company Information */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Company Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Company Name *
                  </label>
                  <input
                    type="text"
                    name="company_name"
                    required
                    value={formData.company_name}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Contact Person *
                  </label>
                  <input
                    type="text"
                    name="contact_person"
                    required
                    value={formData.contact_person}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Contact Email *
                  </label>
                  <input
                    type="email"
                    name="contact_email"
                    required
                    value={formData.contact_email}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Contact Phone
                  </label>
                  <input
                    type="tel"
                    name="contact_phone"
                    value={formData.contact_phone}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Service Area
                  </label>
                  <input
                    type="text"
                    name="service_area"
                    value={formData.service_area}
                    onChange={handleChange}
                    placeholder="e.g., Austin, TX"
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
              </div>
            </div>

            {/* Qualification Questions */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Qualification Questions</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Annual Revenue Range *
                  </label>
                  <select
                    name="annual_revenue"
                    required
                    value={formData.annual_revenue}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  >
                    <option value="">Select range</option>
                    <option value="500K-1M">$500K - $1M</option>
                    <option value="1M-2M">$1M - $2M</option>
                    <option value="2M-3M">$2M - $3M</option>
                    <option value="3M+">$3M+</option>
                  </select>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    name="has_crew"
                    id="has_crew"
                    checked={formData.has_crew}
                    onChange={handleChange}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="has_crew" className="ml-2 block text-sm text-gray-700">
                    Has at least 1 crew *
                  </label>
                </div>

                {formData.has_crew && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Number of Crews
                    </label>
                    <input
                      type="number"
                      name="crew_count"
                      min="1"
                      value={formData.crew_count}
                      onChange={handleChange}
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                    />
                  </div>
                )}

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    name="has_office_person"
                    id="has_office_person"
                    checked={formData.has_office_person}
                    onChange={handleChange}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="has_office_person" className="ml-2 block text-sm text-gray-700">
                    Has 1 office person OR owner is organized *
                  </label>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    name="owner_is_organized"
                    id="owner_is_organized"
                    checked={formData.owner_is_organized}
                    onChange={handleChange}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="owner_is_organized" className="ml-2 block text-sm text-gray-700">
                    Owner is organized *
                  </label>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    name="uses_email_daily"
                    id="uses_email_daily"
                    checked={formData.uses_email_daily}
                    onChange={handleChange}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="uses_email_daily" className="ml-2 block text-sm text-gray-700">
                    Uses email daily *
                  </label>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    name="uses_phone_daily"
                    id="uses_phone_daily"
                    checked={formData.uses_phone_daily}
                    onChange={handleChange}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="uses_phone_daily" className="ml-2 block text-sm text-gray-700">
                    Uses phone daily *
                  </label>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    name="hungry_for_improvement"
                    id="hungry_for_improvement"
                    checked={formData.hungry_for_improvement}
                    onChange={handleChange}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="hungry_for_improvement" className="ml-2 block text-sm text-gray-700">
                    Hungry for improvement (wants automation, better systems) *
                  </label>
                </div>

                <div className="flex items-start">
                  <input
                    type="checkbox"
                    name="agreed_to_rules"
                    id="agreed_to_rules"
                    required
                    checked={formData.agreed_to_rules}
                    onChange={handleChange}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mt-1"
                  />
                  <label htmlFor="agreed_to_rules" className="ml-2 block text-sm text-gray-700">
                    I agree to the Silent Forge rules: Silent, Private, No public talk, Honest weekly feedback, Use on real jobs only *
                  </label>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-4">
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {loading ? 'Submitting...' : 'Submit Application'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}








































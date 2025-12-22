import React, { useState } from 'react';
import { scheduleEmail, ScheduleEmailInput } from '@/lib/useScheduleEmail';

export function EmailScheduler() {
  const [formData, setFormData] = useState({
    to: '',
    subject: '',
    html: '',
    scheduledAt: '',
    campaignId: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setResult(null);

    try {
      const input: ScheduleEmailInput = {
        to: formData.to,
        subject: formData.subject,
        html: formData.html,
        scheduledAt: new Date(formData.scheduledAt),
        campaignId: formData.campaignId || undefined,
      };

      const response = await scheduleEmail(input);
      
      if (response.ok) {
        setResult(`Email scheduled successfully! Job ID: ${response.jobId}`);
        // Reset form
        setFormData({
          to: '',
          subject: '',
          html: '',
          scheduledAt: '',
          campaignId: '',
        });
      } else {
        setResult(`Error: ${response.error}`);
      }
    } catch (error) {
      setResult(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6">Schedule Email</h2>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="to" className="block text-sm font-medium text-gray-700">
            To Email
          </label>
          <input
            type="email"
            id="to"
            required
            value={formData.to}
            onChange={(e) => setFormData({ ...formData, to: e.target.value })}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            placeholder="recipient@example.com"
          />
        </div>

        <div>
          <label htmlFor="subject" className="block text-sm font-medium text-gray-700">
            Subject
          </label>
          <input
            type="text"
            id="subject"
            required
            value={formData.subject}
            onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            placeholder="Email subject"
          />
        </div>

        <div>
          <label htmlFor="html" className="block text-sm font-medium text-gray-700">
            HTML Content
          </label>
          <textarea
            id="html"
            required
            rows={6}
            value={formData.html}
            onChange={(e) => setFormData({ ...formData, html: e.target.value })}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            placeholder="<p>Your email content here...</p>"
          />
        </div>

        <div>
          <label htmlFor="scheduledAt" className="block text-sm font-medium text-gray-700">
            Scheduled At
          </label>
          <input
            type="datetime-local"
            id="scheduledAt"
            required
            value={formData.scheduledAt}
            onChange={(e) => setFormData({ ...formData, scheduledAt: e.target.value })}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label htmlFor="campaignId" className="block text-sm font-medium text-gray-700">
            Campaign ID (Optional)
          </label>
          <input
            type="text"
            id="campaignId"
            value={formData.campaignId}
            onChange={(e) => setFormData({ ...formData, campaignId: e.target.value })}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            placeholder="campaign-uuid"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
        >
          {isLoading ? 'Scheduling...' : 'Schedule Email'}
        </button>
      </form>

      {result && (
        <div className={`mt-4 p-4 rounded-md ${
          result.includes('Error') 
            ? 'bg-red-50 text-red-700 border border-red-200' 
            : 'bg-green-50 text-green-700 border border-green-200'
        }`}>
          {result}
        </div>
      )}
    </div>
  );
}
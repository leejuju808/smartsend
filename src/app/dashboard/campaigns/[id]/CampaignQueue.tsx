"use client";

import { useState, useEffect } from 'react';
import EmailStatusBadge, { ReplyIntent } from '../../components/EmailStatusBadge';
import RetryOneButton from '@/components/queue/RetryOneButton';

interface QueueItem {
  id: string;
  email_lower: string;
  name: string;
  company: string;
  status: string;
  attempts: number;
  scheduled_for: string;
  sent_at?: string;
  first_opened_at?: string;
  error?: string;
  reply_intent?: string;
  reply_snippet?: string;
  campaign_messages?: Array<{
    id: string;
    open_count: number;
    click_count: number;
    last_open_at?: string;
    last_click_at?: string;
  }>;
}

interface CampaignQueueProps {
  campaignId: string;
}

export default function CampaignQueue({ campaignId }: CampaignQueueProps) {
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchQueueItems();
  }, [campaignId]);

  const fetchQueueItems = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/campaigns/${campaignId}/queue`);
      
      if (response.ok) {
        const data = await response.json();
        setQueueItems(data.queue || []);
      } else {
        setError('Failed to fetch queue items');
      }
    } catch (error) {
      setError('Error fetching queue items');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Send Queue</h2>
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
          <p className="text-gray-600 mt-2">Loading queue...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Send Queue</h2>
        <div className="text-center py-8">
          <p className="text-red-600">{error}</p>
          <button
            onClick={fetchQueueItems}
            className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (queueItems.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Send Queue</h2>
        <div className="text-center py-8">
          <p className="text-gray-600">No items in the send queue.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold mb-4">Send Queue</h2>
      
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Contact
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Attempts
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Scheduled
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Sent
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                First Open
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Error
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Reply
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {queueItems.map((item) => (
              <tr key={item.id} className="border-t border-gray-700 group hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {item.name || 'No name'}
                    </div>
                    <div className="text-sm text-gray-500">{item.email_lower}</div>
                    {item.company && (
                      <div className="text-sm text-gray-500">{item.company}</div>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <EmailStatusBadge status={item.status as any} />
                    {item.status === "replied" && <ReplyIntent intent={item.reply_intent} />}
                  </div>
                  {item.campaign_messages && item.campaign_messages.length > 0 && (
                    <div className="text-xs text-zinc-500 mt-1">
                      {item.campaign_messages[0].open_count} opens · {item.campaign_messages[0].click_count} clicks
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {item.attempts}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatDate(item.scheduled_for)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {item.sent_at ? formatDate(item.sent_at) : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {item.first_opened_at ? formatDate(item.first_opened_at) : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {item.error ? (
                    <span className="text-red-600" title={item.error}>
                      {item.error.length > 50 ? item.error.substring(0, 50) + '...' : item.error}
                    </span>
                  ) : (
                    '-'
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  {item.reply_snippet || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {item.status === "failed" && (
                    <RetryOneButton
                      queueId={item.id}
                      onDone={() => {
                        // Refetch queue items
                        fetchQueueItems();
                      }}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-sm text-gray-600">
        <p>Total items: {queueItems.length}</p>
        <p>Last updated: {new Date().toLocaleString()}</p>
      </div>
    </div>
  );
} 
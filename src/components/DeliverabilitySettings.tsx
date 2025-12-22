'use client';

import { useState, useEffect } from 'react';
import { 
  Mail, 
  Settings, 
  Clock, 
  TrendingUp, 
  Save,
  Plus,
  Trash2,
  AlertCircle
} from 'lucide-react';
import { createClientComponentClient } from '@/lib/supabase';
import { upsertMailbox, deleteMailbox, getDomainStats } from '@/lib/deliverability';

interface MailboxConfig {
  id: string;
  user_id: string;
  email: string;
  domain: string;
  provider: 'ses' | 'mailgun' | 'mailersend';
  daily_cap: number;
  hourly_cap: number;
  warmup_enabled: boolean;
  warmup_start_date?: string;
  warmup_current_cap: number;
  warmup_increment: number;
  warmup_max_cap: number;
}

interface MailboxFormData {
  email: string;
  domain: string;
  provider: 'ses' | 'mailgun' | 'mailersend';
  daily_cap: number;
  hourly_cap: number;
  warmup_enabled: boolean;
  warmup_start_date?: string;
  warmup_current_cap: number;
  warmup_increment: number;
  warmup_max_cap: number;
}

interface DomainStats {
  totalSent: number;
  hourlyBreakdown: Array<{ hour: string; count: number }>;
  dailyBreakdown: Array<{ date: string; count: number }>;
}

export default function DeliverabilitySettings() {
  const [mailboxes, setMailboxes] = useState<MailboxConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedMailbox, setSelectedMailbox] = useState<MailboxConfig | null>(null);
  const [domainStats, setDomainStats] = useState<Record<string, DomainStats>>({});
  
  const supabase = createClientComponentClient();

  useEffect(() => {
    fetchMailboxes();
  }, []);

  const fetchMailboxes = async () => {
    try {
      setLoading(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('mailboxes')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at');

      if (error) {
        console.error('Error fetching mailboxes:', error);
      } else {
        setMailboxes(data || []);
        
        // Fetch stats for each domain
        for (const mailbox of data || []) {
          const stats = await getDomainStats(mailbox.domain, user.id);
          setDomainStats(prev => ({
            ...prev,
            [mailbox.domain]: stats
          }));
        }
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveMailbox = async (mailbox: MailboxFormData) => {
    try {
      setSaving(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const savedMailbox = await upsertMailbox({
        ...mailbox,
        user_id: user.id
      } as any);

      if (savedMailbox) {
        await fetchMailboxes();
        setShowAddForm(false);
        setSelectedMailbox(null);
      }
    } catch (error) {
      console.error('Error saving mailbox:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMailbox = async (mailboxId: string) => {
    if (!confirm('Are you sure you want to delete this mailbox configuration?')) return;

    try {
      const success = await deleteMailbox(mailboxId);
      if (success) {
        await fetchMailboxes();
      }
    } catch (error) {
      console.error('Error deleting mailbox:', error);
    }
  };

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'ses':
        return '📧';
      case 'mailgun':
        return '🔫';
      case 'mailersend':
        return '📤';
      default:
        return '📧';
    }
  };

  const getProviderName = (provider: string) => {
    switch (provider) {
      case 'ses':
        return 'Amazon SES';
      case 'mailgun':
        return 'Mailgun';
      case 'mailersend':
        return 'MailerSend';
      default:
        return provider;
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-1/4"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Deliverability Settings</h2>
          <p className="text-gray-600 mt-1">
            Configure hourly caps, warmup schedules, and domain limits
          </p>
        </div>
        
        <button
          onClick={() => setShowAddForm(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Mailbox
        </button>
      </div>

      {/* Mailbox Configurations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {mailboxes.map((mailbox) => (
          <div key={mailbox.id} className="bg-white rounded-lg border shadow-sm p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                <span className="text-2xl">{getProviderIcon(mailbox.provider)}</span>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{mailbox.email}</h3>
                  <p className="text-sm text-gray-500">{getProviderName(mailbox.provider)}</p>
                </div>
              </div>
              
              <div className="flex space-x-2">
                <button
                  onClick={() => setSelectedMailbox(mailbox)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <Settings className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDeleteMailbox(mailbox.id)}
                  className="text-red-400 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Caps Display */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <p className="text-sm font-medium text-gray-600">Daily Cap</p>
                <p className="text-xl font-bold text-gray-900">{mailbox.daily_cap}</p>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <p className="text-sm font-medium text-gray-600">Hourly Cap</p>
                <p className="text-xl font-bold text-gray-900">{mailbox.hourly_cap}</p>
              </div>
            </div>

            {/* Warmup Status */}
            {mailbox.warmup_enabled && (
              <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                <div className="flex items-center text-sm text-blue-800">
                  <TrendingUp className="h-4 w-4 mr-2" />
                  <span>Warmup Active</span>
                </div>
                <p className="text-xs text-blue-600 mt-1">
                  Current: {mailbox.warmup_current_cap} | 
                  Increment: +{mailbox.warmup_increment}/day | 
                  Max: {mailbox.warmup_max_cap}
                </p>
              </div>
            )}

            {/* Domain Stats */}
            {domainStats[mailbox.domain] && (
              <div className="border-t pt-4">
                <h4 className="text-sm font-medium text-gray-900 mb-2">Today's Activity</h4>
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <p className="text-sm font-medium text-green-800">
                    {domainStats[mailbox.domain].totalSent} emails sent today
                  </p>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add/Edit Form Modal */}
      {(showAddForm || selectedMailbox) && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                {selectedMailbox ? 'Edit Mailbox' : 'Add New Mailbox'}
              </h3>
              
              <form onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const mailbox: MailboxFormData = {
                  email: formData.get('email') as string,
                  domain: formData.get('domain') as string,
                  provider: formData.get('provider') as 'ses' | 'mailgun' | 'mailersend',
                  daily_cap: parseInt(formData.get('daily_cap') as string),
                  hourly_cap: parseInt(formData.get('hourly_cap') as string),
                  warmup_enabled: formData.get('warmup_enabled') === 'on',
                  warmup_start_date: formData.get('warmup_start_date') as string || undefined,
                  warmup_current_cap: parseInt(formData.get('warmup_current_cap') as string) || 0,
                  warmup_increment: parseInt(formData.get('warmup_increment') as string) || 5,
                  warmup_max_cap: parseInt(formData.get('warmup_max_cap') as string) || 200
                };
                handleSaveMailbox(mailbox);
              }}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Email</label>
                    <input
                      type="email"
                      name="email"
                      defaultValue={selectedMailbox?.email}
                      required
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Provider</label>
                    <select
                      name="provider"
                      defaultValue={selectedMailbox?.provider || 'ses'}
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    >
                      <option value="ses">Amazon SES</option>
                      <option value="mailgun">Mailgun</option>
                      <option value="mailersend">MailerSend</option>
                    </select>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Daily Cap</label>
                      <input
                        type="number"
                        name="daily_cap"
                        defaultValue={selectedMailbox?.daily_cap || 50}
                        min="1"
                        required
                        className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Hourly Cap</label>
                      <input
                        type="number"
                        name="hourly_cap"
                        defaultValue={selectedMailbox?.hourly_cap || 10}
                        min="1"
                        required
                        className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                  
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      name="warmup_enabled"
                      defaultChecked={selectedMailbox?.warmup_enabled}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label className="ml-2 block text-sm text-gray-900">Enable Warmup</label>
                  </div>
                  
                  {selectedMailbox?.warmup_enabled && (
                    <div className="space-y-3 pl-6 border-l-2 border-gray-200">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Start Date</label>
                        <input
                          type="date"
                          name="warmup_start_date"
                          defaultValue={selectedMailbox?.warmup_start_date}
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                        />
                      </div>
                      
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Start Cap</label>
                          <input
                            type="number"
                            name="warmup_current_cap"
                            defaultValue={selectedMailbox?.warmup_current_cap || 0}
                            min="0"
                            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                          />
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Daily Increment</label>
                          <input
                            type="number"
                            name="warmup_increment"
                            defaultValue={selectedMailbox?.warmup_increment || 5}
                            min="1"
                            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                          />
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Max Cap</label>
                          <input
                            type="number"
                            name="warmup_max_cap"
                            defaultValue={selectedMailbox?.warmup_max_cap || 200}
                            min="1"
                            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddForm(false);
                      setSelectedMailbox(null);
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex">
          <AlertCircle className="h-5 w-5 text-blue-400 mt-0.5" />
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">How it works</h3>
            <div className="mt-2 text-sm text-blue-700">
              <p className="mb-2">
                <strong>Hourly Caps:</strong> Limit emails per hour per domain to maintain good deliverability.
              </p>
              <p className="mb-2">
                <strong>Warmup:</strong> Gradually increase sending volume for new domains to build reputation.
              </p>
              <p>
                <strong>Bounce Protection:</strong> Automatically suppress bounced emails and stop future sends.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 
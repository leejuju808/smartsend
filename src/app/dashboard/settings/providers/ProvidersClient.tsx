'use client';

import { useState, useEffect } from 'react';
import { Provider } from '@/lib/providerPool';

interface ProviderFormData {
  name: string;
  type: 'ses' | 'mailgun' | 'mailersend' | 'smtp';
  config: Record<string, any>;
  weight: number;
  daily_cap: number;
  minute_cap: number;
  enabled: boolean;
}

interface WorkspaceCapacity {
  total_daily_cap: number;
  total_minute_cap: number;
  active_providers: number;
}

export default function ProvidersClient() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [capacity, setCapacity] = useState<WorkspaceCapacity | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [formData, setFormData] = useState<ProviderFormData>({
    name: '',
    type: 'ses',
    config: {},
    weight: 100,
    daily_cap: 10000,
    minute_cap: 100,
    enabled: true
  });

  // Get workspace ID from URL params or use a default for demo
  const [workspaceId, setWorkspaceId] = useState<string>('');

  useEffect(() => {
    // For demo purposes, use a default workspace ID
    // In production, this would come from user session or URL params
    setWorkspaceId('demo-workspace-id');
  }, []);

  useEffect(() => {
    if (workspaceId) {
      loadProviders();
    }
  }, [workspaceId]);

  const loadProviders = async () => {
    if (!workspaceId) return;
    
    try {
      setLoading(true);
      const response = await fetch(`/api/providers/list?workspace_id=${workspaceId}`);
      const data = await response.json();
      
      if (response.ok) {
        setProviders(data.providers || []);
        setCapacity(data.workspace_capacity);
      } else {
        console.error('Error loading providers:', data.error);
      }
    } catch (error) {
      console.error('Error loading providers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspaceId) return;

    try {
      const url = editingProvider ? '/api/providers/upsert' : '/api/providers/upsert';
      const method = 'POST';
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          workspace_id: workspaceId,
          ...(editingProvider && { id: editingProvider.id })
        })
      });

      const data = await response.json();
      
      if (response.ok) {
        setShowForm(false);
        setEditingProvider(null);
        resetForm();
        loadProviders();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Error saving provider:', error);
      alert('Error saving provider');
    }
  };

  const handleDelete = async (providerId: string) => {
    if (!workspaceId || !confirm('Are you sure you want to delete this provider?')) return;

    try {
      const response = await fetch('/api/providers/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider_id: providerId, workspace_id: workspaceId })
      });

      const data = await response.json();
      
      if (response.ok) {
        loadProviders();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Error deleting provider:', error);
      alert('Error deleting provider');
    }
  };

  const handleEdit = (provider: Provider) => {
    setEditingProvider(provider);
    setFormData({
      name: provider.name,
      type: provider.type,
      config: provider.config,
      weight: provider.weight,
      daily_cap: provider.daily_cap,
      minute_cap: provider.minute_cap,
      enabled: provider.enabled
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'ses',
      config: {},
      weight: 100,
      daily_cap: 10000,
      minute_cap: 100,
      enabled: true
    });
  };

  const getConfigFields = () => {
    switch (formData.type) {
      case 'ses':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700">Access Key ID</label>
              <input
                type="text"
                value={formData.config.accessKeyId || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  config: { ...formData.config, accessKeyId: e.target.value }
                })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Secret Access Key</label>
              <input
                type="password"
                value={formData.config.secretAccessKey || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  config: { ...formData.config, secretAccessKey: e.target.value }
                })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Region</label>
              <input
                type="text"
                value={formData.config.region || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  config: { ...formData.config, region: e.target.value }
                })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder="us-east-1"
                required
              />
            </div>
          </>
        );
      case 'mailgun':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700">API Key</label>
              <input
                type="password"
                value={formData.config.apiKey || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  config: { ...formData.config, apiKey: e.target.value }
                })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Domain</label>
              <input
                type="text"
                value={formData.config.domain || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  config: { ...formData.config, domain: e.target.value }
                })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder="yourdomain.com"
                required
              />
            </div>
          </>
        );
      case 'mailersend':
        return (
          <div>
            <label className="block text-sm font-medium text-gray-700">API Key</label>
            <input
              type="password"
              value={formData.config.apiKey || ''}
              onChange={(e) => setFormData({
                ...formData,
                config: { ...formData.config, apiKey: e.target.value }
              })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              required
            />
          </div>
        );
      case 'smtp':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700">Host</label>
              <input
                type="text"
                value={formData.config.host || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  config: { ...formData.config, host: e.target.value }
                })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder="smtp.gmail.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Port</label>
              <input
                type="number"
                value={formData.config.port || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  config: { ...formData.config, port: parseInt(e.target.value) }
                })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder="587"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Username</label>
              <input
                type="text"
                value={formData.config.username || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  config: { ...formData.config, username: e.target.value }
                })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Password</label>
              <input
                type="password"
                value={formData.config.password || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  config: { ...formData.config, password: e.target.value }
                })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                required
              />
            </div>
          </>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading providers...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Workspace Capacity Summary */}
      {capacity && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Workspace Capacity</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{capacity.total_daily_cap.toLocaleString()}</div>
              <div className="text-sm text-gray-500">Daily Send Cap</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{capacity.total_minute_cap.toLocaleString()}</div>
              <div className="text-sm text-gray-500">Per-Minute Cap</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{capacity.active_providers}</div>
              <div className="text-sm text-gray-500">Active Providers</div>
            </div>
          </div>
        </div>
      )}

      {/* Providers List */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium text-gray-900">Email Providers</h3>
            <button
              onClick={() => setShowForm(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
            >
              Add Provider
            </button>
          </div>
        </div>
        
        <div className="divide-y divide-gray-200">
          {providers.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500">
              No providers configured. Add your first email provider to get started.
            </div>
          ) : (
            providers.map((provider) => (
              <div key={provider.id} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <h4 className="text-lg font-medium text-gray-900">{provider.name}</h4>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        provider.enabled 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {provider.enabled ? 'Active' : 'Disabled'}
                      </span>
                      <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                        {provider.type.toUpperCase()}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-500">
                      <div>
                        <span className="font-medium">Health Score:</span> {(provider.health_score * 100).toFixed(1)}%
                      </div>
                      <div>
                        <span className="font-medium">Weight:</span> {provider.weight}
                      </div>
                      <div>
                        <span className="font-medium">Daily Cap:</span> {provider.daily_cap.toLocaleString()}
                      </div>
                      <div>
                        <span className="font-medium">Minute Cap:</span> {provider.minute_cap.toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleEdit(provider)}
                      className="text-blue-600 hover:text-blue-800 px-3 py-1 rounded-md hover:bg-blue-50"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(provider.id)}
                      className="text-red-600 hover:text-red-800 px-3 py-1 rounded-md hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add/Edit Provider Form */}
      {showForm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                {editingProvider ? 'Edit Provider' : 'Add Provider'}
              </h3>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Type</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      type: e.target.value as any,
                      config: {} // Reset config when type changes
                    })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  >
                    <option value="ses">AWS SES</option>
                    <option value="mailgun">Mailgun</option>
                    <option value="mailersend">MailerSend</option>
                    <option value="smtp">SMTP</option>
                  </select>
                </div>

                <div className="space-y-3">
                  {getConfigFields()}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Weight</label>
                    <input
                      type="number"
                      value={formData.weight}
                      onChange={(e) => setFormData({ ...formData, weight: parseInt(e.target.value) })}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      min="1"
                      max="1000"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Daily Cap</label>
                    <input
                      type="number"
                      value={formData.daily_cap}
                      onChange={(e) => setFormData({ ...formData, daily_cap: parseInt(e.target.value) })}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      min="1"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Minute Cap</label>
                  <input
                    type="number"
                    value={formData.minute_cap}
                    onChange={(e) => setFormData({ ...formData, minute_cap: parseInt(e.target.value) })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    min="1"
                    required
                  />
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.enabled}
                    onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label className="ml-2 block text-sm text-gray-900">Enable provider</label>
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    type="submit"
                    className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
                  >
                    {editingProvider ? 'Update' : 'Add'} Provider
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      setEditingProvider(null);
                      resetForm();
                    }}
                    className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-400"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 
'use client';

import { useState, useEffect } from 'react';
import { Key, Plus, Copy, Trash2, Check } from 'lucide-react';
import Link from 'next/link';

interface ApiKey {
  id: string;
  name: string;
  key_hash: string;
  created_at: string;
  last_used_at?: string;
  status: string;
}

export default function DevKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewKey, setShowNewKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchKeys();
  }, []);

  const fetchKeys = async () => {
    try {
      const res = await fetch('/api/dev/api-keys');
      const data = await res.json();
      setKeys(data.keys || []);
    } catch (error) {
      console.error('Error fetching keys:', error);
    } finally {
      setLoading(false);
    }
  };

  const createKey = async () => {
    if (!newKeyName) return;

    try {
      const res = await fetch('/api/dev/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName })
      });

      const data = await res.json();
      if (data.key) {
        setNewKeyValue(data.key);
        fetchKeys();
      }
    } catch (error) {
      console.error('Error creating key:', error);
    }
  };

  const revokeKey = async (id: string) => {
    if (!confirm('Are you sure you want to revoke this API key?')) return;

    try {
      await fetch('/api/dev/api-keys', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'revoked' })
      });
      fetchKeys();
    } catch (error) {
      console.error('Error revoking key:', error);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const maskKey = (hash: string) => {
    return `sk_live_${hash.slice(0, 8)}...${hash.slice(-8)}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-900 text-white">
      {/* Header */}
      <div className="border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <Link href="/dev" className="text-gray-400 hover:text-white mb-2 inline-block">
                ← Back to Developer Portal
              </Link>
              <div className="flex items-center gap-3">
                <Key className="h-8 w-8 text-yellow-400" />
                <h1 className="text-3xl font-bold">API Keys</h1>
              </div>
              <p className="mt-2 text-gray-400">
                Manage your API keys for accessing the AUREV HQ platform
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* New Key Dialog */}
        {showNewKey && (
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-800 rounded-lg p-8 mb-8">
            {newKeyValue ? (
              <div>
                <h3 className="text-xl font-bold mb-4 text-yellow-400">
                  ⚠️ Save Your API Key
                </h3>
                <p className="text-gray-400 mb-4">
                  This key will only be shown once. Copy it now and store it securely.
                </p>
                <div className="relative">
                  <div className="bg-gray-950 border border-gray-700 rounded-lg p-4 pr-12 font-mono">
                    {newKeyValue}
                  </div>
                  <button
                    onClick={() => copyToClipboard(newKeyValue)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 hover:bg-gray-800 rounded"
                  >
                    {copied ? (
                      <Check className="h-5 w-5 text-green-400" />
                    ) : (
                      <Copy className="h-5 w-5" />
                    )}
                  </button>
                </div>
                <button
                  onClick={() => {
                    setShowNewKey(false);
                    setNewKeyValue('');
                    setNewKeyName('');
                  }}
                  className="mt-4 px-4 py-2 bg-yellow-500 text-black rounded-lg font-medium hover:bg-yellow-400 transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              <div>
                <h3 className="text-xl font-bold mb-4">Create New API Key</h3>
                <input
                  type="text"
                  placeholder="Enter a name for this key"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-3 mb-4 focus:outline-none focus:border-yellow-500"
                />
                <div className="flex gap-4">
                  <button
                    onClick={createKey}
                    className="px-4 py-2 bg-yellow-500 text-black rounded-lg font-medium hover:bg-yellow-400 transition-colors"
                  >
                    Create Key
                  </button>
                  <button
                    onClick={() => setShowNewKey(false)}
                    className="px-4 py-2 border border-gray-700 rounded-lg font-medium hover:bg-gray-800 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Keys List */}
        <div className="mb-6 flex justify-between items-center">
          <h2 className="text-2xl font-bold">Your API Keys</h2>
          {!showNewKey && (
            <button
              onClick={() => setShowNewKey(true)}
              className="flex items-center gap-2 px-4 py-2 bg-yellow-500 text-black rounded-lg font-medium hover:bg-yellow-400 transition-colors"
            >
              <Plus className="h-5 w-5" />
              New Key
            </button>
          )}
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading...</div>
        ) : keys.length === 0 ? (
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-800 rounded-lg p-12 text-center">
            <Key className="h-16 w-16 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 mb-4">You don't have any API keys yet.</p>
            <button
              onClick={() => setShowNewKey(true)}
              className="px-4 py-2 bg-yellow-500 text-black rounded-lg font-medium hover:bg-yellow-400 transition-colors"
            >
              Create Your First Key
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {keys.map((key) => (
              <div
                key={key.id}
                className="bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-800 rounded-lg p-6 flex items-center justify-between"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-bold">{key.name}</h3>
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        key.status === 'active'
                          ? 'bg-green-900/30 text-green-400 border border-green-800'
                          : 'bg-gray-800 text-gray-400 border border-gray-700'
                      }`}
                    >
                      {key.status}
                    </span>
                  </div>
                  <p className="text-gray-400 text-sm font-mono mb-1">
                    {maskKey(key.key_hash)}
                  </p>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>Created {new Date(key.created_at).toLocaleDateString()}</span>
                    {key.last_used_at && (
                      <span>Last used {new Date(key.last_used_at).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
                {key.status === 'active' && (
                  <button
                    onClick={() => revokeKey(key.id)}
                    className="p-2 hover:bg-red-900/20 rounded transition-colors text-red-400"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Info Box */}
        <div className="mt-8 bg-yellow-900/20 border border-yellow-500/20 rounded-lg p-6">
          <h3 className="font-bold mb-2 text-yellow-400">🔒 Security Best Practices</h3>
          <ul className="text-gray-400 text-sm space-y-1">
            <li>• Never share your API keys in public repositories or client-side code</li>
            <li>• Rotate keys regularly and revoke unused ones</li>
            <li>• Use different keys for different environments (dev, staging, production)</li>
            <li>• Keep your keys in environment variables or secure key management systems</li>
          </ul>
        </div>
      </div>
    </div>
  );
}


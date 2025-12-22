"use client";

import { useState, useEffect } from "react";
import { PlusIcon, PencilIcon, TrashIcon, PlayIcon, StopIcon } from "@heroicons/react/24/outline";

interface Mailbox {
  id: string;
  name: string;
  from_email: string;
  from_name?: string;
  smtp_host?: string;
  smtp_port?: number;
  smtp_username?: string;
  daily_cap: number;
  is_active: boolean;
  used_today: number;
  remaining_today: number;
}

interface MailboxFormData {
  id?: string;
  name: string;
  from_email: string;
  from_name: string;
  smtp_host: string;
  smtp_port: string;
  smtp_username: string;
  smtp_password: string;
  daily_cap: string;
}

export default function MailboxesPage() {
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingMailbox, setEditingMailbox] = useState<Mailbox | null>(null);
  const [formData, setFormData] = useState<MailboxFormData>({
    name: "",
    from_email: "",
    from_name: "",
    smtp_host: "",
    smtp_port: "",
    smtp_username: "",
    smtp_password: "",
    daily_cap: "100"
  });

  useEffect(() => {
    fetchMailboxes();
  }, []);

  const fetchMailboxes = async () => {
    try {
      const response = await fetch("/api/mailboxes/list");
      if (response.ok) {
        const data = await response.json();
        setMailboxes(data.mailboxes || []);
      }
    } catch (error) {
      console.error("Error fetching mailboxes:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const response = await fetch("/api/mailboxes/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        await fetchMailboxes();
        resetForm();
        setShowForm(false);
      } else {
        const error = await response.json();
        alert(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error("Error saving mailbox:", error);
      alert("Error saving mailbox");
    }
  };

  const handleEdit = (mailbox: Mailbox) => {
    setEditingMailbox(mailbox);
    setFormData({
      id: mailbox.id,
      name: mailbox.name,
      from_email: mailbox.from_email,
      from_name: mailbox.from_name || "",
      smtp_host: mailbox.smtp_host || "",
      smtp_port: mailbox.smtp_port?.toString() || "",
      smtp_username: mailbox.smtp_username || "",
      smtp_password: "",
      daily_cap: mailbox.daily_cap.toString()
    });
    setShowForm(true);
  };

  const handleDelete = async (mailboxId: string) => {
    if (!confirm("Are you sure you want to delete this mailbox?")) return;

    try {
      const response = await fetch(`/api/mailboxes/delete?id=${mailboxId}`, {
        method: "DELETE"
      });

      if (response.ok) {
        await fetchMailboxes();
      } else {
        const error = await response.json();
        alert(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error("Error deleting mailbox:", error);
      alert("Error deleting mailbox");
    }
  };

  const handleWarmupToggle = async (mailboxId: string, isActive: boolean) => {
    try {
      const endpoint = isActive ? "/api/mailboxes/warmup/stop" : "/api/mailboxes/warmup/start";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mailboxId })
      });

      if (response.ok) {
        await fetchMailboxes();
      } else {
        const error = await response.json();
        alert(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error("Error toggling warmup:", error);
      alert("Error toggling warmup");
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      from_email: "",
      from_name: "",
      smtp_host: "",
      smtp_port: "",
      smtp_username: "",
      smtp_password: "",
      daily_cap: "100"
    });
    setEditingMailbox(null);
  };

  const cancelForm = () => {
    setShowForm(false);
    resetForm();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Mailbox Management</h1>
        <p className="mt-2 text-gray-600">
          Create and manage your mailboxes, set daily caps, and control warmup status
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500">Total Mailboxes</h3>
          <p className="text-2xl font-bold text-gray-900">{mailboxes.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500">Active Today</h3>
          <p className="text-2xl font-bold text-green-600">
            {mailboxes.filter(m => m.is_active).length}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500">Used Today</h3>
          <p className="text-2xl font-bold text-blue-600">
            {mailboxes.reduce((sum, m) => sum + m.used_today, 0)}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500">Remaining Today</h3>
          <p className="text-2xl font-bold text-orange-600">
            {mailboxes.reduce((sum, m) => sum + m.remaining_today, 0)}
          </p>
        </div>
      </div>

      {/* Add Mailbox Button */}
      <div className="mb-6">
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <PlusIcon className="h-4 w-4 mr-2" />
          Add Mailbox
        </button>
      </div>

      {/* Mailbox Form */}
      {showForm && (
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-lg font-medium text-gray-900 mb-4">
            {editingMailbox ? "Edit Mailbox" : "Add New Mailbox"}
          </h2>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">From Email</label>
                <input
                  type="email"
                  required
                  value={formData.from_email}
                  onChange={(e) => setFormData({ ...formData, from_email: e.target.value })}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">From Name</label>
                <input
                  type="text"
                  value={formData.from_name}
                  onChange={(e) => setFormData({ ...formData, from_name: e.target.value })}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">Daily Cap</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={formData.daily_cap}
                  onChange={(e) => setFormData({ ...formData, daily_cap: e.target.value })}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">SMTP Host</label>
                <input
                  type="text"
                  value={formData.smtp_host}
                  onChange={(e) => setFormData({ ...formData, smtp_host: e.target.value })}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">SMTP Port</label>
                <input
                  type="number"
                  value={formData.smtp_port}
                  onChange={(e) => setFormData({ ...formData, smtp_port: e.target.value })}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">SMTP Username</label>
                <input
                  type="text"
                  value={formData.smtp_username}
                  onChange={(e) => setFormData({ ...formData, smtp_username: e.target.value })}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">SMTP Password</label>
                <input
                  type="password"
                  value={formData.smtp_password}
                  onChange={(e) => setFormData({ ...formData, smtp_password: e.target.value })}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={cancelForm}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                {editingMailbox ? "Update" : "Create"} Mailbox
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Mailboxes List */}
      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <ul className="divide-y divide-gray-200">
          {mailboxes.map((mailbox) => (
            <li key={mailbox.id} className="px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-3">
                    <div className="flex-shrink-0">
                      <div className={`h-3 w-3 rounded-full ${mailbox.is_active ? 'bg-green-400' : 'bg-gray-400'}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {mailbox.name}
                      </p>
                      <p className="text-sm text-gray-500 truncate">
                        {mailbox.from_email}
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-4">
                  {/* Usage Stats */}
                  <div className="text-right">
                    <p className="text-sm text-gray-900">
                      {mailbox.used_today} / {mailbox.daily_cap}
                    </p>
                    <p className="text-xs text-gray-500">
                      {mailbox.remaining_today} remaining
                    </p>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="w-20">
                    <div className="bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${
                          mailbox.used_today / mailbox.daily_cap > 0.8
                            ? 'bg-red-500'
                            : mailbox.used_today / mailbox.daily_cap > 0.6
                            ? 'bg-yellow-500'
                            : 'bg-green-500'
                        }`}
                        style={{
                          width: `${Math.min((mailbox.used_today / mailbox.daily_cap) * 100, 100)}%`
                        }}
                      />
                    </div>
                  </div>
                  
                  {/* Actions */}
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleWarmupToggle(mailbox.id, mailbox.is_active)}
                      className={`p-2 rounded-md ${
                        mailbox.is_active
                          ? 'text-red-600 hover:bg-red-50'
                          : 'text-green-600 hover:bg-green-50'
                      }`}
                      title={mailbox.is_active ? 'Stop Warmup' : 'Start Warmup'}
                    >
                      {mailbox.is_active ? (
                        <StopIcon className="h-4 w-4" />
                      ) : (
                        <PlayIcon className="h-4 w-4" />
                      )}
                    </button>
                    
                    <button
                      onClick={() => handleEdit(mailbox)}
                      className="p-2 text-gray-400 hover:text-gray-500 hover:bg-gray-50 rounded-md"
                      title="Edit Mailbox"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                    
                    <button
                      onClick={() => handleDelete(mailbox.id)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md"
                      title="Delete Mailbox"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
        
        {mailboxes.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No mailboxes found. Create your first mailbox to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
} 
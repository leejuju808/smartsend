"use client";

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@/lib/supabase';
import { 
  Plus, 
  Edit, 
  Trash2, 
  Save, 
  X, 
  MessageSquare, 
  Phone, 
  Mail,
  Building,
  Stethoscope,
  Scale,
  Home,
  Briefcase
} from 'lucide-react';

interface AIScript {
  id: string;
  industry: string;
  script_name: string;
  script_type: 'sms' | 'call' | 'email';
  script_content: any;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface IndustryScriptsProps {
  userId: string;
}

const industryIcons = {
  hvac: Building,
  med_spa: Stethoscope,
  dental: Stethoscope,
  law: Scale,
  real_estate: Home,
  general: Briefcase
};

const industryNames = {
  hvac: 'HVAC',
  med_spa: 'Med Spa',
  dental: 'Dental',
  law: 'Law Firm',
  real_estate: 'Real Estate',
  general: 'General'
};

export default function IndustryScripts({ userId }: IndustryScriptsProps) {
  const [scripts, setScripts] = useState<AIScript[]>([]);
  const [editingScript, setEditingScript] = useState<AIScript | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'sms' | 'call' | 'email'>('all');
  const [industryFilter, setIndustryFilter] = useState<string>('all');

  const supabase = createClientComponentClient();

  useEffect(() => {
    loadScripts();
  }, [userId, filter, industryFilter]);

  const loadScripts = async () => {
    try {
      setLoading(true);
      
      let query = supabase
        .from('ai_scripts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (filter !== 'all') {
        query = query.eq('script_type', filter);
      }

      if (industryFilter !== 'all') {
        query = query.eq('industry', industryFilter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setScripts(data || []);
    } catch (error) {
      console.error('Error loading scripts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateScript = () => {
    const newScript: AIScript = {
      id: '',
      industry: 'general',
      script_name: '',
      script_type: 'sms',
      script_content: {
        greeting: '',
        qualifying_questions: [],
        booking_flow: {
          trigger_phrases: [],
          response: '',
          confirmation: ''
        },
        fallback: ''
      },
      is_active: true,
      created_at: '',
      updated_at: ''
    };
    setEditingScript(newScript);
    setIsCreating(true);
  };

  const handleEditScript = (script: AIScript) => {
    setEditingScript({ ...script });
    setIsCreating(false);
  };

  const handleSaveScript = async () => {
    if (!editingScript) return;

    try {
      if (isCreating) {
        const { error } = await supabase
          .from('ai_scripts')
          .insert({
            user_id: userId,
            industry: editingScript.industry,
            script_name: editingScript.script_name,
            script_type: editingScript.script_type,
            script_content: editingScript.script_content,
            is_active: editingScript.is_active
          });

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('ai_scripts')
          .update({
            industry: editingScript.industry,
            script_name: editingScript.script_name,
            script_type: editingScript.script_type,
            script_content: editingScript.script_content,
            is_active: editingScript.is_active,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingScript.id);

        if (error) throw error;
      }

      setEditingScript(null);
      setIsCreating(false);
      loadScripts();
    } catch (error) {
      console.error('Error saving script:', error);
      alert('Failed to save script. Please try again.');
    }
  };

  const handleDeleteScript = async (scriptId: string) => {
    if (!confirm('Are you sure you want to delete this script?')) return;

    try {
      const { error } = await supabase
        .from('ai_scripts')
        .delete()
        .eq('id', scriptId);

      if (error) throw error;
      loadScripts();
    } catch (error) {
      console.error('Error deleting script:', error);
      alert('Failed to delete script. Please try again.');
    }
  };

  const getScriptIcon = (type: string) => {
    switch (type) {
      case 'sms': return <MessageSquare className="w-4 h-4" />;
      case 'call': return <Phone className="w-4 h-4" />;
      case 'email': return <Mail className="w-4 h-4" />;
      default: return <MessageSquare className="w-4 h-4" />;
    }
  };

  const getIndustryIcon = (industry: string) => {
    const IconComponent = industryIcons[industry as keyof typeof industryIcons] || industryIcons.general;
    return <IconComponent className="w-4 h-4" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Industry Scripts</h2>
          <p className="text-gray-600">Manage AI conversation scripts for different industries</p>
        </div>
        <button
          onClick={handleCreateScript}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Script
        </button>
      </div>

      {/* Filters */}
      <div className="flex space-x-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm"
          >
            <option value="all">All Types</option>
            <option value="sms">SMS</option>
            <option value="call">Call</option>
            <option value="email">Email</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
          <select
            value={industryFilter}
            onChange={(e) => setIndustryFilter(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm"
          >
            <option value="all">All Industries</option>
            {Object.entries(industryNames).map(([key, name]) => (
              <option key={key} value={key}>{name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Scripts List */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {scripts.length === 0 ? (
          <div className="col-span-full text-center py-12 text-gray-500">
            No scripts found. Create your first script to get started.
          </div>
        ) : (
          scripts.map((script) => (
            <div
              key={script.id}
              className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center space-x-2">
                  {getScriptIcon(script.script_type)}
                  {getIndustryIcon(script.industry)}
                </div>
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => handleEditScript(script)}
                    className="p-1 text-gray-400 hover:text-blue-600"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteScript(script.id)}
                    className="p-1 text-gray-400 hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <h3 className="font-medium text-gray-900 mb-1">{script.script_name}</h3>
              <p className="text-sm text-gray-600 mb-2">
                {industryNames[script.industry as keyof typeof industryNames]} • {script.script_type.toUpperCase()}
              </p>
              
              <div className="text-xs text-gray-500">
                <div>Greeting: {script.script_content.greeting?.substring(0, 50)}...</div>
                <div>Questions: {script.script_content.qualifying_questions?.length || 0}</div>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <span className={`px-2 py-1 rounded-full text-xs ${
                  script.is_active 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {script.is_active ? 'Active' : 'Inactive'}
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(script.updated_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Edit Modal */}
      {editingScript && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">
                  {isCreating ? 'Create New Script' : 'Edit Script'}
                </h3>
                <button
                  onClick={() => setEditingScript(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
                    <select
                      value={editingScript.industry}
                      onChange={(e) => setEditingScript({
                        ...editingScript,
                        industry: e.target.value
                      })}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    >
                      {Object.entries(industryNames).map(([key, name]) => (
                        <option key={key} value={key}>{name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                    <select
                      value={editingScript.script_type}
                      onChange={(e) => setEditingScript({
                        ...editingScript,
                        script_type: e.target.value as any
                      })}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    >
                      <option value="sms">SMS</option>
                      <option value="call">Call</option>
                      <option value="email">Email</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Script Name</label>
                  <input
                    type="text"
                    value={editingScript.script_name}
                    onChange={(e) => setEditingScript({
                      ...editingScript,
                      script_name: e.target.value
                    })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    placeholder="Enter script name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Greeting</label>
                  <textarea
                    value={editingScript.script_content.greeting || ''}
                    onChange={(e) => setEditingScript({
                      ...editingScript,
                      script_content: {
                        ...editingScript.script_content,
                        greeting: e.target.value
                      }
                    })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    rows={2}
                    placeholder="Enter greeting message"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Qualifying Questions</label>
                  <textarea
                    value={editingScript.script_content.qualifying_questions?.join('\n') || ''}
                    onChange={(e) => setEditingScript({
                      ...editingScript,
                      script_content: {
                        ...editingScript.script_content,
                        qualifying_questions: e.target.value.split('\n').filter(q => q.trim())
                      }
                    })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    rows={3}
                    placeholder="Enter questions, one per line"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Booking Response</label>
                  <textarea
                    value={editingScript.script_content.booking_flow?.response || ''}
                    onChange={(e) => setEditingScript({
                      ...editingScript,
                      script_content: {
                        ...editingScript.script_content,
                        booking_flow: {
                          ...editingScript.script_content.booking_flow,
                          response: e.target.value
                        }
                      }
                    })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    rows={2}
                    placeholder="Enter booking response message"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fallback Message</label>
                  <textarea
                    value={editingScript.script_content.fallback || ''}
                    onChange={(e) => setEditingScript({
                      ...editingScript,
                      script_content: {
                        ...editingScript.script_content,
                        fallback: e.target.value
                      }
                    })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    rows={2}
                    placeholder="Enter fallback message"
                  />
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={editingScript.is_active}
                    onChange={(e) => setEditingScript({
                      ...editingScript,
                      is_active: e.target.checked
                    })}
                    className="mr-2"
                  />
                  <label htmlFor="is_active" className="text-sm text-gray-700">
                    Active
                  </label>
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setEditingScript(null)}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveScript}
                  className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save Script
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
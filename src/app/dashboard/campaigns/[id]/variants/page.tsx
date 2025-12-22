'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { createClientComponentClient } from '@/lib/supabase';
import { 
  Plus, 
  Edit3, 
  Trash2, 
  Trophy, 
  Pause, 
  Play, 
  BarChart3,
  Target,
  Eye,
  MousePointer,
  MessageSquare
} from 'lucide-react';

interface Variant {
  id: string;
  name: string;
  subject: string;
  body_html: string;
  body_text: string;
  objective: 'open' | 'click' | 'reply';
  min_impressions: number;
  is_winner: boolean;
  is_paused: boolean;
  created_at: string;
  metrics: {
    impressions: number;
    opens: number;
    clicks: number;
    replies: number;
    open_rate: number;
    click_rate: number;
    reply_rate: number;
  };
}

interface Campaign {
  id: string;
  name: string;
  is_sequence: boolean;
}

export default function CampaignVariantsPage() {
  const params = useParams();
  const campaignId = params.id as string;
  const [stepIndex, setStepIndex] = useState(0);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingVariant, setEditingVariant] = useState<Variant | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const supabase = createClientComponentClient();

  useEffect(() => {
    if (campaignId) {
      fetchCampaignAndVariants();
    }
  }, [campaignId, stepIndex]);

  const fetchCampaignAndVariants = async () => {
    try {
      setLoading(true);
      
      // Fetch campaign details
      const { data: campaignData, error: campaignError } = await supabase
        .from('campaigns')
        .select('id, name, is_sequence')
        .eq('id', campaignId)
        .single();

      if (campaignError) throw campaignError;
      setCampaign(campaignData);

      // Fetch variants for this step
      const { data: variantsData, error: variantsError } = await supabase
        .from('campaign_variants')
        .select('*')
        .eq('campaign_id', campaignId)
        .eq('step_index', stepIndex)
        .order('name');

      if (variantsError) throw variantsError;
      setVariants(variantsData || []);
    } catch (error) {
      console.error('Error fetching campaign variants:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveVariants = async (variantsToSave: Omit<Variant, 'id' | 'created_at' | 'metrics'>[]) => {
    try {
      setSaving(true);
      
      const response = await fetch('/api/variants/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: campaignId,
          step_index: stepIndex,
          variants: variantsToSave
        })
      });

      if (!response.ok) {
        throw new Error('Failed to save variants');
      }

      await fetchCampaignAndVariants();
      setShowAddForm(false);
      setEditingVariant(null);
    } catch (error) {
      console.error('Error saving variants:', error);
      alert('Failed to save variants');
    } finally {
      setSaving(false);
    }
  };

  const handleDeclareWinner = async (variantId: string) => {
    try {
      const response = await fetch('/api/variants/winner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: campaignId,
          step_index: stepIndex,
          variant_id: variantId,
          action: 'declare_winner'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to declare winner');
      }

      await fetchCampaignAndVariants();
    } catch (error) {
      console.error('Error declaring winner:', error);
      alert('Failed to declare winner');
    }
  };

  const handlePauseVariant = async (variantId: string, pause: boolean) => {
    try {
      const response = await fetch('/api/variants/winner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: campaignId,
          step_index: stepIndex,
          variant_id: variantId,
          action: pause ? 'pause' : 'resume'
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to ${pause ? 'pause' : 'resume'} variant`);
      }

      await fetchCampaignAndVariants();
    } catch (error) {
      console.error(`Error ${pause ? 'pausing' : 'resuming'} variant:`, error);
      alert(`Failed to ${pause ? 'pause' : 'resume'} variant`);
    }
  };

  const getObjectiveIcon = (objective: string) => {
    switch (objective) {
      case 'open': return <Eye className="w-4 h-4" />;
      case 'click': return <MousePointer className="w-4 h-4" />;
      case 'reply': return <MessageSquare className="w-4 h-4" />;
      default: return <Target className="w-4 h-4" />;
    }
  };

  const getObjectiveColor = (objective: string) => {
    switch (objective) {
      case 'open': return 'text-blue-600 bg-blue-100';
      case 'click': return 'text-green-600 bg-green-100';
      case 'reply': return 'text-purple-600 bg-purple-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="text-center py-8">
        <h2 className="text-xl font-semibold text-gray-900">Campaign not found</h2>
        <p className="text-gray-600 mt-2">The campaign you're looking for doesn't exist.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campaign Variants</h1>
          <p className="text-gray-600 mt-1">
            {campaign.name} • A/B/n Testing with Thompson Sampling
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Variants
        </button>
      </div>

      {/* Step Navigation for Sequences */}
      {campaign.is_sequence && (
        <div className="bg-white shadow rounded-lg p-4">
          <h3 className="text-lg font-medium text-gray-900 mb-3">Step Selection</h3>
          <div className="flex space-x-2">
            {[0, 1, 2, 3, 4].map((step) => (
              <button
                key={step}
                onClick={() => setStepIndex(step)}
                className={`px-3 py-2 text-sm font-medium rounded-md ${
                  stepIndex === step
                    ? 'bg-blue-100 text-blue-700 border-blue-300'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Step {step}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Variants List */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            Variants for {campaign.is_sequence ? `Step ${stepIndex}` : 'Campaign'}
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            Thompson Sampling automatically allocates traffic to optimize performance
          </p>
        </div>

        {variants.length === 0 ? (
          <div className="text-center py-12">
            <BarChart3 className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No variants yet</h3>
            <p className="mt-1 text-sm text-gray-500">
              Get started by creating your first A/B test variants.
            </p>
            <div className="mt-6">
              <button
                onClick={() => setShowAddForm(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Variants
              </button>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {variants.map((variant) => (
              <div key={variant.id} className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-3">
                      <h4 className="text-lg font-medium text-gray-900">{variant.name}</h4>
                      {variant.is_winner && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          <Trophy className="w-4 h-4 mr-1" />
                          Winner
                        </span>
                      )}
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getObjectiveColor(variant.objective)}`}>
                        {getObjectiveIcon(variant.objective)}
                        <span className="ml-1">{variant.objective}</span>
                      </span>
                    </div>
                    
                    <div className="space-y-2">
                      <div>
                        <span className="text-sm font-medium text-gray-500">Subject:</span>
                        <span className="ml-2 text-sm text-gray-900">{variant.subject}</span>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-500">Body:</span>
                        <span className="ml-2 text-sm text-gray-900 line-clamp-2">
                          {variant.body_text || variant.body_html.replace(/<[^>]*>/g, '').substring(0, 100)}...
                        </span>
                      </div>
                    </div>

                    {/* Metrics */}
                    <div className="mt-4 grid grid-cols-4 gap-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-gray-900">{variant.metrics.impressions}</div>
                        <div className="text-xs text-gray-500">Impressions</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-blue-600">{variant.metrics.open_rate}%</div>
                        <div className="text-xs text-gray-500">Open Rate</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-600">{variant.metrics.click_rate}%</div>
                        <div className="text-xs text-gray-500">Click Rate</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-purple-600">{variant.metrics.reply_rate}%</div>
                        <div className="text-xs text-gray-500">Reply Rate</div>
                      </div>
                    </div>
                  </div>

                  <div className="ml-6 flex space-x-2">
                    {!variant.is_winner && (
                      <button
                        onClick={() => handleDeclareWinner(variant.id)}
                        className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-yellow-600 hover:bg-yellow-700"
                      >
                        <Trophy className="w-4 h-4 mr-1" />
                        Declare Winner
                      </button>
                    )}
                    <button
                      onClick={() => handlePauseVariant(variant.id, !variant.is_paused)}
                      className={`inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md ${
                        variant.is_paused
                          ? 'text-white bg-green-600 hover:bg-green-700'
                          : 'text-white bg-gray-600 hover:bg-gray-700'
                      }`}
                    >
                      {variant.is_paused ? (
                        <>
                          <Play className="w-4 h-4 mr-1" />
                          Resume
                        </>
                      ) : (
                        <>
                          <Pause className="w-4 h-4 mr-1" />
                          Pause
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => setEditingVariant(variant)}
                      className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                    >
                      <Edit3 className="w-4 h-4 mr-1" />
                      Edit
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Variants Modal */}
      {(showAddForm || editingVariant) && (
        <VariantsForm
          variants={editingVariant ? [editingVariant] : []}
          onSave={handleSaveVariants}
          onCancel={() => {
            setShowAddForm(false);
            setEditingVariant(null);
          }}
          saving={saving}
        />
      )}
    </div>
  );
}

// Variants Form Component
interface VariantsFormProps {
  variants: Variant[];
  onSave: (variants: Omit<Variant, 'id' | 'created_at' | 'metrics'>[]) => void;
  onCancel: () => void;
  saving: boolean;
}

function VariantsForm({ variants, onSave, onCancel, saving }: VariantsFormProps) {
  const [formVariants, setFormVariants] = useState<Array<{
    name: string;
    subject: string;
    body_html: string;
    body_text: string;
    objective: 'open' | 'click' | 'reply';
    min_impressions: number;
    is_winner: boolean;
    is_paused: boolean;
  }>>(
          variants.length > 0 ? variants.map(v => ({
        name: v.name,
        subject: v.subject,
        body_html: v.body_html,
        body_text: v.body_text,
        objective: v.objective,
        min_impressions: v.min_impressions,
        is_winner: v.is_winner,
        is_paused: v.is_paused
      })) : [
        {
          name: 'Variant A',
          subject: '',
          body_html: '',
          body_text: '',
          objective: 'reply',
          min_impressions: 100,
          is_winner: false,
          is_paused: false
        },
        {
          name: 'Variant B',
          subject: '',
          body_html: '',
          body_text: '',
          objective: 'reply',
          min_impressions: 100,
          is_winner: false,
          is_paused: false
        }
      ]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formVariants);
  };

  const addVariant = () => {
    setFormVariants([...formVariants, {
      name: `Variant ${String.fromCharCode(65 + formVariants.length)}`,
      subject: '',
      body_html: '',
      body_text: '',
      objective: 'reply',
      min_impressions: 100,
      is_winner: false,
      is_paused: false
    }]);
  };

  const removeVariant = (index: number) => {
    if (formVariants.length > 1) {
      setFormVariants(formVariants.filter((_, i) => i !== index));
    }
  };

  const updateVariant = (index: number, field: string, value: any) => {
    const newVariants = [...formVariants];
    newVariants[index] = { ...newVariants[index], [field]: value };
    setFormVariants(newVariants);
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white">
        <div className="mt-3">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            {variants.length > 0 ? 'Edit Variants' : 'Add Variants'}
          </h3>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            {formVariants.map((variant, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-md font-medium text-gray-900">{variant.name}</h4>
                  {formVariants.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeVariant(index)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Subject Line</label>
                    <input
                      type="text"
                      value={variant.subject}
                      onChange={(e) => updateVariant(index, 'subject', e.target.value)}
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Email Body (HTML)</label>
                    <textarea
                      value={variant.body_html}
                      onChange={(e) => updateVariant(index, 'body_html', e.target.value)}
                      rows={6}
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Objective</label>
                      <select
                        value={variant.objective}
                        onChange={(e) => updateVariant(index, 'objective', e.target.value)}
                        className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="reply">Reply Rate</option>
                        <option value="click">Click Rate</option>
                        <option value="open">Open Rate</option>
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Min Impressions</label>
                      <input
                        type="number"
                        value={variant.min_impressions}
                        onChange={(e) => updateVariant(index, 'min_impressions', parseInt(e.target.value))}
                        min="50"
                        className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
            
            <div className="flex justify-between">
              <button
                type="button"
                onClick={addVariant}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Another Variant
              </button>
              
              <div className="space-x-3">
                <button
                  type="button"
                  onClick={onCancel}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Variants'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
} 
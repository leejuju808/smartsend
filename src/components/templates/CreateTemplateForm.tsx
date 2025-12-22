'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@/lib/supabase';

interface TemplateFormData {
  name: string;
  description: string;
  kind: 'sequence' | 'campaign';
  tags: string[];
  is_paid: boolean;
  price_cents: number;
  cover_url?: string;
  payload: any;
}

export default function CreateTemplateForm() {
  const [formData, setFormData] = useState<TemplateFormData>({
    name: '',
    description: '',
    kind: 'sequence',
    tags: [],
    is_paid: false,
    price_cents: 0,
    cover_url: '',
    payload: {}
  });
  const [loading, setLoading] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const router = useRouter();
  const supabase = createClientComponentClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('Please sign in to create templates');
        return;
      }

      // Create template
      const response = await fetch('/api/marketplace/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          price_cents: formData.is_paid ? formData.price_cents : 0,
          author: user.email
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create template');
      }

      const template = await response.json();
      alert('Template created successfully!');
      router.push(`/templates/${template.id}`);
    } catch (error) {
      console.error('Error creating template:', error);
      alert(error instanceof Error ? error.message : 'Failed to create template');
    } finally {
      setLoading(false);
    }
  };

  const addTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, tagInput.trim()]
      }));
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Create New Template</h1>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Template Name *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Welcome Sequence, Product Launch Campaign"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description *
            </label>
            <textarea
              required
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Describe what this template does and who it's for..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Template Type *
            </label>
            <select
              required
              value={formData.kind}
              onChange={(e) => setFormData(prev => ({ ...prev, kind: e.target.value as 'sequence' | 'campaign' }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="sequence">Email Sequence</option>
              <option value="campaign">Single Campaign</option>
            </select>
          </div>
        </div>

        {/* Tags */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tags
          </label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyPress={handleKeyPress}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Add a tag and press Enter"
            />
            <button
              type="button"
              onClick={addTag}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
            >
              Add
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {formData.tags.map(tag => (
              <span
                key={tag}
                className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 text-sm rounded-full"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="ml-2 text-blue-600 hover:text-blue-800"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Cover Image */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Cover Image URL (optional)
          </label>
          <input
            type="url"
            value={formData.cover_url}
            onChange={(e) => setFormData(prev => ({ ...prev, cover_url: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="https://example.com/image.jpg"
          />
        </div>

        {/* Pricing */}
        <div className="space-y-4">
          <div className="flex items-center">
            <input
              type="checkbox"
              id="is_paid"
              checked={formData.is_paid}
              onChange={(e) => setFormData(prev => ({ 
                ...prev, 
                is_paid: e.target.checked,
                price_cents: e.target.checked ? prev.price_cents : 0
              }))}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="is_paid" className="ml-2 text-sm font-medium text-gray-700">
              This is a paid template
            </label>
          </div>

          {formData.is_paid && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Price (USD) *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-500">$</span>
                <input
                  type="number"
                  required={formData.is_paid}
                  min="0.01"
                  step="0.01"
                  value={formData.price_cents / 100}
                  onChange={(e) => setFormData(prev => ({ 
                    ...prev, 
                    price_cents: Math.round(parseFloat(e.target.value) * 100)
                  }))}
                  className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0.00"
                />
              </div>
            </div>
          )}
        </div>

        {/* Template Content */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Template Content (JSON) *
          </label>
          <textarea
            required
            rows={8}
            value={JSON.stringify(formData.payload, null, 2)}
            onChange={(e) => {
              try {
                const payload = JSON.parse(e.target.value);
                setFormData(prev => ({ ...prev, payload }));
              } catch (error) {
                // Allow invalid JSON during typing
              }
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
            placeholder={`{
  "name": "Template Name",
  "subject": "Email Subject",
  "body": "Email body content..."
}`}
          />
          <p className="text-xs text-gray-500 mt-1">
            Enter valid JSON for your template. For sequences, include steps array. For campaigns, include subject and body.
          </p>
        </div>

        {/* Submit */}
        <div className="flex gap-4">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Template'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
} 
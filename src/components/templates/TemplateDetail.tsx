'use client';

import { SaveButton } from './SaveButton';
import StarRater from './StarRater';

interface TemplateDetailProps {
  id: string;
  title: string;
  body: string;
  variables: string[];
  tags: string[];
  owner_id: string;
  updated_at: string;
}

export function TemplateDetail({ id, title, body, variables, tags, updated_at }: TemplateDetailProps) {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="border-b border-gray-200 pb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">{title}</h1>
        <div className="flex flex-wrap gap-2 mb-4">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800"
            >
              {tag}
            </span>
          ))}
        </div>
        <div className="text-sm text-gray-500">
          Last updated {new Date(updated_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })}
        </div>
      </div>

      {/* Variables Section */}
      {variables.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Template Variables</h2>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-3">
              This template uses the following variables. Replace them with your actual content:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {variables.map((variable) => (
                <div
                  key={variable}
                  className="bg-white border border-gray-200 rounded-md px-3 py-2 text-sm font-mono text-gray-800"
                >
                  {`{{${variable}}}`}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Template Preview */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Template Preview</h2>
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="prose max-w-none">
            <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans leading-relaxed">
              {body}
            </pre>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="border-t border-gray-200 pt-6">
        <div className="flex items-center justify-between">
          <SaveButton templateId={id} />
          <div className="text-sm text-gray-500">
            Template ID: {id}
          </div>
        </div>
      </div>

      {/* Ratings */}
      <div className="mt-8">
        <div className="mb-2 text-sm font-medium">Rate this template</div>
        <StarRater templateId={id} />
      </div>
    </div>
  );
} 
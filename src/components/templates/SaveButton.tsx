'use client';

import { useState, useTransition } from 'react';

interface SaveButtonProps {
  templateId: string;
}

export function SaveButton({ templateId }: SaveButtonProps) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSave = () => {
    startTransition(async () => {
      setMessage(null);
      try {
        const response = await fetch('/api/templates/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ templateId })
        });

        const data = await response.json();

        if (response.status === 401) {
          setMessage('Please sign in to save templates');
          return;
        }

        if (!response.ok || !data.ok) {
          throw new Error(data.error?.msg || 'Failed to save template');
        }

        setSaved(true);
        setMessage('Template saved successfully!');
        
        // Clear success message after 3 seconds
        setTimeout(() => setMessage(null), 3000);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Something went wrong');
      }
    });
  };

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleSave}
        disabled={pending || saved}
        className={`px-6 py-2 rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
          saved
            ? 'bg-green-100 text-green-800 border border-green-200 cursor-not-allowed'
            : 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500'
        } ${pending ? 'opacity-75 cursor-not-allowed' : ''}`}
      >
        {pending ? 'Saving...' : saved ? 'Saved!' : 'Save Template'}
      </button>
      
      {message && (
        <span
          className={`text-sm ${
            saved ? 'text-green-600' : 'text-red-600'
          }`}
        >
          {message}
        </span>
      )}
    </div>
  );
} 
'use client';

import { useState } from 'react';
import { X, Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/src/components/ui/sheet';

interface PreviewEmailProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  html: string;
  subject?: string;
}

const previewVariables = {
  first_name: 'Ava',
  last_name: 'Chen',
  company: 'Acme Co',
  title: 'VP of Sales',
  email: 'ava@acme.co',
  unsubscribe_link: '#unsubscribe',
  booking_link: '#book',
};

function replaceVariables(text: string, vars: Record<string, string>): string {
  let result = text;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}

export function PreviewEmail({ open, onOpenChange, html, subject }: PreviewEmailProps) {
  const [darkMode, setDarkMode] = useState(false);

  const previewHtml = replaceVariables(html, previewVariables);
  const previewSubject = subject ? replaceVariables(subject, previewVariables) : '';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center justify-between">
            <SheetTitle>Email Preview</SheetTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDarkMode(!darkMode)}
              >
                {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <SheetDescription>
            Preview how your email will look in Gmail
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6">
          {/* Gmail-style header */}
          <div className={`border rounded-lg ${darkMode ? 'bg-gray-900' : 'bg-white'}`}>
            <div className={`px-4 py-3 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-8 h-8 rounded-full ${darkMode ? 'bg-blue-600' : 'bg-blue-500'} flex items-center justify-center text-white text-sm font-semibold`}>
                  {previewVariables.first_name[0]}
                </div>
                <div>
                  <div className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    {previewVariables.first_name} {previewVariables.last_name}
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    {previewVariables.email}
                  </div>
                </div>
              </div>
              <div className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {previewSubject || '(No subject)'}
              </div>
            </div>

            {/* Email body */}
            <div 
              className={`px-4 py-4 prose prose-sm max-w-none ${darkMode ? 'prose-invert' : ''}`}
              dangerouslySetInnerHTML={{ __html: previewHtml }}
              style={{
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                fontSize: '14px',
                lineHeight: '1.5',
                color: darkMode ? '#e5e7eb' : '#111827',
              }}
            />
          </div>

          {/* Mobile preview */}
          <div className="mt-6">
            <div className="text-xs text-gray-500 mb-2">Mobile Preview</div>
            <div className="border rounded-lg p-2 bg-gray-100 max-w-xs">
              <div className="bg-white rounded p-3">
                <div className="text-xs font-semibold mb-1">{previewSubject || '(No subject)'}</div>
                <div 
                  className="text-xs prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}


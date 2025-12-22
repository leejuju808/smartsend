"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Hash } from "lucide-react";

interface ComposerToolbarProps {
  onInsertVariable: (variable: string) => void;
}

export function ComposerToolbar({ onInsertVariable }: ComposerToolbarProps) {
  const [isOpen, setIsOpen] = useState(false);

  const variables = [
    { label: "First Name", value: "{{first_name}}" },
    { label: "Last Name", value: "{{last_name}}" },
    { label: "Company", value: "{{company}}" },
    { label: "Title", value: "{{title}}" },
    { label: "Email", value: "{{email}}" },
    { label: "Location", value: "{{location}}" },
    { label: "Website", value: "{{website}}" },
    { label: "Phone", value: "{{phone}}" },
  ];

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Hash className="h-4 w-4" />
        Variables
      </Button>
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 z-20 mt-1 w-56 rounded-md border bg-white shadow-lg">
            <div className="px-3 py-2 text-xs font-semibold text-gray-600 border-b">
              Insert Personalization
            </div>
            <div className="py-1">
              {variables.map((variable) => (
                <button
                  key={variable.value}
                  onClick={() => {
                    onInsertVariable(variable.value);
                    setIsOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer flex items-center justify-between"
                >
                  <span>{variable.label}</span>
                  <code className="text-xs bg-gray-100 px-1 rounded">
                    {variable.value}
                  </code>
                </button>
              ))}
            </div>
            <div className="border-t px-3 py-2 text-xs text-gray-500">
              Use in subject or body
            </div>
          </div>
        </>
      )}
    </div>
  );
}


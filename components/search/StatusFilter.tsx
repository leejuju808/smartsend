"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

const STATUS_OPTIONS = [
  { value: "HOT", label: "Hot" },
  { value: "WARM", label: "Warm" },
  { value: "FOLLOW_UP", label: "Follow Up" },
  { value: "NEW", label: "New" },
  { value: "NOT_INTERESTED", label: "Not Interested" },
  { value: "OUT_OF_SCOPE", label: "Out of Scope" },
];

interface StatusFilterProps {
  value?: string;
  onChange: (value?: string) => void;
}

export function StatusFilter({ value, onChange }: StatusFilterProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm border border-gray-300 rounded-md bg-white hover:bg-gray-50"
      >
        <span className={value ? "text-gray-900" : "text-gray-500"}>
          {value
            ? STATUS_OPTIONS.find((opt) => opt.value === value)?.label
            : "Status"}
        </span>
        <ChevronDown className="h-4 w-4 text-gray-400" />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg">
            <div className="py-1">
              <button
                type="button"
                onClick={() => {
                  onChange(undefined);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 ${
                  !value ? "bg-gray-100 font-medium" : "text-gray-900"
                }`}
              >
                All Statuses
              </button>
              {STATUS_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 ${
                    value === option.value
                      ? "bg-gray-100 font-medium"
                      : "text-gray-900"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}






















































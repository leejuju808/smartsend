"use client";

import { useState } from "react";
import { Wrench, CheckCircle } from "lucide-react";
import { ContactCSVRow } from "@/lib/validation/contact-validator";

interface BulkFixToolsProps {
  rows: ContactCSVRow[];
  onFixed: (fixedRows: ContactCSVRow[]) => void;
}

export default function BulkFixTools({ rows, onFixed }: BulkFixToolsProps) {
  const [appliedFixes, setAppliedFixes] = useState<Set<string>>(new Set());

  const applyFix = (fixType: string, fixFn: (row: ContactCSVRow) => ContactCSVRow) => {
    const fixed = rows.map(fixFn);
    setAppliedFixes(new Set([...appliedFixes, fixType]));
    onFixed(fixed);
  };

  const capitalizeNames = (row: ContactCSVRow): ContactCSVRow => {
    const fixed = { ...row };
    if (fixed.first_name) {
      fixed.first_name = fixed.first_name
        .split(" ")
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(" ");
    }
    if (fixed.last_name) {
      fixed.last_name = fixed.last_name
        .split(" ")
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(" ");
    }
    return fixed;
  };

  const lowercaseEmails = (row: ContactCSVRow): ContactCSVRow => {
    const fixed = { ...row };
    if (fixed.email) {
      fixed.email = fixed.email.toLowerCase().trim();
    }
    return fixed;
  };

  const trimSpaces = (row: ContactCSVRow): ContactCSVRow => {
    const fixed = { ...row };
    Object.keys(fixed).forEach(key => {
      if (typeof fixed[key] === "string") {
        fixed[key] = fixed[key].trim();
      }
    });
    return fixed;
  };

  const removeEmojis = (row: ContactCSVRow): ContactCSVRow => {
    const fixed = { ...row };
    if (fixed.first_name) {
      fixed.first_name = fixed.first_name.replace(/[\u{1F300}-\u{1F9FF}]/gu, "");
    }
    if (fixed.last_name) {
      fixed.last_name = fixed.last_name.replace(/[\u{1F300}-\u{1F9FF}]/gu, "");
    }
    return fixed;
  };

  const applyAllFixes = () => {
    let fixed = [...rows];
    fixed = fixed.map(trimSpaces);
    fixed = fixed.map(lowercaseEmails);
    fixed = fixed.map(capitalizeNames);
    fixed = fixed.map(removeEmojis);
    setAppliedFixes(new Set(["all"]));
    onFixed(fixed);
  };

  return (
    <div className="border rounded-lg p-4 bg-gray-50">
      <div className="flex items-center gap-2 mb-4">
        <Wrench className="h-5 w-5 text-gray-600" />
        <h3 className="text-lg font-semibold text-gray-900">Bulk Fix Tools</h3>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <button
          onClick={() => applyFix("trim", trimSpaces)}
          disabled={appliedFixes.has("trim")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            appliedFixes.has("trim")
              ? "bg-green-100 text-green-800 cursor-not-allowed"
              : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
          }`}
        >
          {appliedFixes.has("trim") && <CheckCircle className="h-4 w-4 inline mr-1" />}
          Trim Spaces
        </button>

        <button
          onClick={() => applyFix("lowercase", lowercaseEmails)}
          disabled={appliedFixes.has("lowercase")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            appliedFixes.has("lowercase")
              ? "bg-green-100 text-green-800 cursor-not-allowed"
              : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
          }`}
        >
          {appliedFixes.has("lowercase") && <CheckCircle className="h-4 w-4 inline mr-1" />}
          Lowercase Emails
        </button>

        <button
          onClick={() => applyFix("capitalize", capitalizeNames)}
          disabled={appliedFixes.has("capitalize")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            appliedFixes.has("capitalize")
              ? "bg-green-100 text-green-800 cursor-not-allowed"
              : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
          }`}
        >
          {appliedFixes.has("capitalize") && <CheckCircle className="h-4 w-4 inline mr-1" />}
          Capitalize Names
        </button>

        <button
          onClick={() => applyFix("emoji", removeEmojis)}
          disabled={appliedFixes.has("emoji")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            appliedFixes.has("emoji")
              ? "bg-green-100 text-green-800 cursor-not-allowed"
              : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
          }`}
        >
          {appliedFixes.has("emoji") && <CheckCircle className="h-4 w-4 inline mr-1" />}
          Remove Emojis
        </button>
      </div>

      <button
        onClick={applyAllFixes}
        disabled={appliedFixes.has("all")}
        className={`mt-4 w-full px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          appliedFixes.has("all")
            ? "bg-green-100 text-green-800 cursor-not-allowed"
            : "bg-blue-600 text-white hover:bg-blue-700"
        }`}
      >
        {appliedFixes.has("all") && <CheckCircle className="h-4 w-4 inline mr-1" />}
        Apply All Fixes
      </button>
    </div>
  );
}





























































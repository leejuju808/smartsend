"use client";

import { useState } from "react";
import { ExternalLink, Download, Eye, Shield, DollarSign, FileCheck, Building2 } from "lucide-react";

interface DocumentCardProps {
  doc: {
    id: string;
    title: string | null;
    doc_type: string;
    file_url: string;
    signed_url?: string | null;
    file_ext: string | null;
    file_size: number | null;
    uploaded_at: string;
    uploaded_by_profile?: {
      full_name: string | null;
      email: string | null;
    };
    auto_categorized?: boolean;
    categorization_confidence?: number | null;
    extracted_data?: {
      claim_number?: string;
      insurance_carrier?: string;
      amount?: number;
      permit_number?: string;
      [key: string]: any;
    };
    linked_to_insurance_flow?: boolean;
    linked_to_payment_tracking?: boolean;
    view_count?: number;
  };
}

export function DocumentCard({ doc }: DocumentCardProps) {
  const [imageError, setImageError] = useState(false);
  const isImage = ["jpg", "jpeg", "png", "webp", "gif"].includes(
    doc.file_ext?.toLowerCase() || ""
  );

  const displayTitle = doc.title || doc.doc_type.replace(/_/g, " ");
  const fileUrl = doc.signed_url || doc.file_url;

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${Math.round(bytes / (1024 * 1024))} MB`;
  };

  return (
    <div className="border border-zinc-800 rounded-lg bg-zinc-950 shadow-sm p-3 text-xs space-y-2 hover:border-zinc-700 transition-colors">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-zinc-50 truncate">{displayTitle}</p>
          {doc.auto_categorized && (
            <p className="text-[10px] text-blue-400 mt-0.5">
              AI categorized
              {doc.categorization_confidence !== null &&
                ` (${Math.round((doc.categorization_confidence || 0) * 100)}%)`}
            </p>
          )}
        </div>
        {doc.file_ext && (
          <span className="text-[10px] text-zinc-500 uppercase ml-2 flex-shrink-0">
            {doc.file_ext}
          </span>
        )}
      </div>

      {/* Image Preview */}
      {isImage && !imageError && (
        <div className="relative w-full h-40 bg-zinc-900 rounded-md overflow-hidden">
          <img
            src={fileUrl}
            alt={displayTitle}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        </div>
      )}

      {/* Extracted Data Badges */}
      {doc.extracted_data && Object.keys(doc.extracted_data).length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {doc.extracted_data.claim_number && (
            <span className="px-2 py-0.5 bg-green-900/30 text-green-400 rounded text-[10px] flex items-center gap-1">
              <Shield className="w-3 h-3" />
              Claim: {doc.extracted_data.claim_number}
            </span>
          )}
          {doc.extracted_data.insurance_carrier && (
            <span className="px-2 py-0.5 bg-blue-900/30 text-blue-400 rounded text-[10px]">
              {doc.extracted_data.insurance_carrier}
            </span>
          )}
          {doc.extracted_data.amount && (
            <span className="px-2 py-0.5 bg-yellow-900/30 text-yellow-400 rounded text-[10px] flex items-center gap-1">
              <DollarSign className="w-3 h-3" />
              ${doc.extracted_data.amount.toLocaleString()}
            </span>
          )}
          {doc.extracted_data.permit_number && (
            <span className="px-2 py-0.5 bg-purple-900/30 text-purple-400 rounded text-[10px] flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              Permit: {doc.extracted_data.permit_number}
            </span>
          )}
        </div>
      )}

      {/* Link Indicators */}
      <div className="flex gap-2 pt-1">
        {doc.linked_to_insurance_flow && (
          <span className="text-[10px] text-green-400 flex items-center gap-1">
            <Shield className="w-3 h-3" />
            Insurance
          </span>
        )}
        {doc.linked_to_payment_tracking && (
          <span className="text-[10px] text-yellow-400 flex items-center gap-1">
            <DollarSign className="w-3 h-3" />
            Payment
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
        <div className="flex items-center gap-3">
          <a
            href={fileUrl}
            target="_blank"
            rel="noreferrer"
            className="text-blue-400 hover:text-blue-300 text-xs flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3" />
            Open
          </a>
          <a
            href={fileUrl}
            download
            className="text-zinc-400 hover:text-zinc-300 text-xs flex items-center gap-1"
          >
            <Download className="w-3 h-3" />
            Download
          </a>
        </div>
        {doc.view_count !== undefined && doc.view_count > 0 && (
          <span className="text-[10px] text-zinc-500 flex items-center gap-1">
            <Eye className="w-3 h-3" />
            {doc.view_count}
          </span>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-1 border-t border-zinc-800">
        <span>
          {formatFileSize(doc.file_size)}
          {doc.file_size && " • "}
          {new Date(doc.uploaded_at).toLocaleDateString()}
        </span>
        {doc.uploaded_by_profile?.full_name && (
          <span className="truncate ml-2">
            {doc.uploaded_by_profile.full_name}
          </span>
        )}
      </div>
    </div>
  );
}




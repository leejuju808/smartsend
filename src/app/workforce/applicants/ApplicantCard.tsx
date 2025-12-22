"use client";

import { WorkforceApplicant } from "@/types/database";
import { FileText } from "lucide-react";

interface ApplicantCardProps {
  applicant: WorkforceApplicant;
}

export function ApplicantCard({ applicant }: ApplicantCardProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm hover:shadow-md transition-shadow">
      <div className="font-medium text-sm text-gray-900">
        {applicant.first_name} {applicant.last_name}
      </div>
      <div className="text-xs text-gray-600 mt-1">{applicant.position_applied}</div>
      {applicant.email && (
        <div className="text-xs text-gray-500 mt-1 truncate">{applicant.email}</div>
      )}
      {applicant.resume_url && (
        <div className="mt-2 flex items-center gap-1 text-xs text-blue-600">
          <FileText className="h-3 w-3" />
          <span>Resume</span>
        </div>
      )}
    </div>
  );
}

























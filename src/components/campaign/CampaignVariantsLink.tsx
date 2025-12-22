import Link from 'next/link';
import { BarChart3 } from 'lucide-react';

interface CampaignVariantsLinkProps {
  campaignId: string;
  className?: string;
}

export default function CampaignVariantsLink({ campaignId, className = '' }: CampaignVariantsLinkProps) {
  return (
    <Link
      href={`/dashboard/campaigns/${campaignId}/variants`}
      className={`inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 ${className}`}
    >
      <BarChart3 className="w-4 h-4 mr-2" />
      Variants
    </Link>
  );
} 
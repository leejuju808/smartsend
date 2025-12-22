import Link from "next/link";
import { ArrowLeftIcon, ChartBarIcon } from "@heroicons/react/24/outline";

export default function AnalyticsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  return (
    <div className="space-y-6">
      {/* Navigation Header */}
      <div className="flex items-center space-x-4">
        <Link
          href={`/dashboard/campaigns/${params.id}`}
          className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          <ArrowLeftIcon className="h-4 w-4 mr-2" />
          Back to Campaign
        </Link>
        
        <div className="flex items-center space-x-2">
          <ChartBarIcon className="h-5 w-5 text-gray-400" />
          <span className="text-sm text-gray-500">Analytics</span>
        </div>
      </div>

      {/* Page Content */}
      {children}
    </div>
  );
} 
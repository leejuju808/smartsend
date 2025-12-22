"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, ListOrdered, MailCheck, TrendingUp } from "lucide-react";

function CampaignNavTabs({ campaignId }: { campaignId: string }) {
  const pathname = usePathname();

  const tabs = [
    {
      href: `/campaigns/${campaignId}`,
      label: "Overview",
      path: `/campaigns/${campaignId}`,
    },
    {
      href: `/campaigns/${campaignId}/sequence`,
      label: "Sequence",
      path: `/campaigns/${campaignId}/sequence`,
      icon: ListOrdered,
    },
    {
      href: `/campaigns/${campaignId}/delivery`,
      label: "Delivery",
      path: `/campaigns/${campaignId}/delivery`,
      icon: MailCheck,
    },
    {
      href: `/campaigns/${campaignId}/analytics`,
      label: "Analytics",
      path: `/campaigns/${campaignId}/analytics`,
      icon: BarChart3,
    },
    {
      href: `/campaigns/${campaignId}/results`,
      label: "Results",
      path: `/campaigns/${campaignId}/results`,
      icon: TrendingUp,
    },
  ];

  const isActive = (path: string) => {
    if (path === `/campaigns/${campaignId}`) {
      return pathname === path;
    }
    return pathname?.startsWith(path) ?? false;
  };

  return (
    <div className="border-b border-gray-200">
      <nav className="-mb-px flex space-x-8">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = isActive(tab.path);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`${
                active
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              } border-b-2 py-2 px-1 text-sm font-medium flex items-center gap-2`}
            >
              {Icon && <Icon className="w-4 h-4" />}
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export default function CampaignLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  // Note: In Next.js 15, params is a Promise, but for layout we can use it directly
  // We'll need to handle this in the client component
  return (
    <div className="space-y-4">
      <CampaignNavTabsWrapper>{children}</CampaignNavTabsWrapper>
    </div>
  );
}

function CampaignNavTabsWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const campaignId = pathname?.split("/")[2] || "";

  if (!campaignId) {
    return <>{children}</>;
  }

  return (
    <>
      <CampaignNavTabs campaignId={campaignId} />
      {children}
    </>
  );
}


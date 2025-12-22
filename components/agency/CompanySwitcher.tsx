"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Building2, ChevronDown, Check } from "lucide-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

interface Company {
  company_id: string;
  company_name: string;
  company_type: string;
}

interface CompanySwitcherProps {
  agencyId: string;
  companies: Company[];
}

export function CompanySwitcher({ agencyId, companies }: CompanySwitcherProps) {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  const handleSwitchCompany = async (companyId: string) => {
    // Set company context in cookie/localStorage
    document.cookie = `active_company_id=${companyId}; path=/; max-age=31536000`;
    localStorage.setItem("active_company_id", companyId);
    
    setSelectedCompanyId(companyId);
    
    // Redirect to company dashboard
    router.push(`/dashboard?company_id=${companyId}`);
    router.refresh();
  };

  const selectedCompany = companies.find(c => c.company_id === selectedCompanyId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="min-w-[200px] justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            <span className="text-sm font-medium">
              {selectedCompany ? selectedCompany.company_name : "Agency Mode"}
            </span>
          </div>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[250px]">
        <DropdownMenuLabel>Agency Mode</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            document.cookie = `active_company_id=; path=/; max-age=0`;
            localStorage.removeItem("active_company_id");
            setSelectedCompanyId(null);
            router.push("/agency/dashboard");
            router.refresh();
          }}
          className="cursor-pointer"
        >
          <Building2 className="h-4 w-4 mr-2" />
          Agency Dashboard
          {!selectedCompanyId && <Check className="h-4 w-4 ml-auto" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Switch to Company</DropdownMenuLabel>
        {companies.length === 0 ? (
          <DropdownMenuItem disabled>
            <span className="text-sm text-muted-foreground">No companies yet</span>
          </DropdownMenuItem>
        ) : (
          companies.map((company) => (
            <DropdownMenuItem
              key={company.company_id}
              onClick={() => handleSwitchCompany(company.company_id)}
              className="cursor-pointer"
            >
              <Building2 className="h-4 w-4 mr-2" />
              <div className="flex-1">
                <div className="font-medium">{company.company_name}</div>
                <div className="text-xs text-muted-foreground">{company.company_type}</div>
              </div>
              {selectedCompanyId === company.company_id && (
                <Check className="h-4 w-4 ml-auto" />
              )}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}




























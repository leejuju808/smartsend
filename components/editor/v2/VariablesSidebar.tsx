"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type VariableCategory = {
  name: string;
  variables: Array<{ token: string; label: string }>;
};

const VARIABLE_CATEGORIES: VariableCategory[] = [
  {
    name: "Contact Info",
    variables: [
      { token: "{first_name}", label: "First Name" },
      { token: "{last_name}", label: "Last Name" },
      { token: "{full_name}", label: "Full Name" },
      { token: "{email}", label: "Email" },
      { token: "{phone}", label: "Phone" },
    ],
  },
  {
    name: "Location Data",
    variables: [
      { token: "{city}", label: "City" },
      { token: "{state}", label: "State" },
      { token: "{zip}", label: "ZIP Code" },
      { token: "{county}", label: "County" },
      { token: "{storm_region}", label: "Storm Region" },
    ],
  },
  {
    name: "Roofing Enrichment",
    variables: [
      { token: "{roof_type_guess}", label: "Roof Type" },
      { token: "{property_type_guess}", label: "Property Type" },
    ],
  },
  {
    name: "Business Info",
    variables: [
      { token: "{company_name}", label: "Company Name" },
      { token: "{company_phone}", label: "Company Phone" },
      { token: "{owner_name}", label: "Owner Name" },
    ],
  },
];

interface VariablesSidebarProps {
  onInsertVariable: (variable: string) => void;
  className?: string;
}

export function VariablesSidebar({ onInsertVariable, className }: VariablesSidebarProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(VARIABLE_CATEGORIES.map((c) => c.name))
  );

  const toggleCategory = (categoryName: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryName)) {
      newExpanded.delete(categoryName);
    } else {
      newExpanded.add(categoryName);
    }
    setExpandedCategories(newExpanded);
  };

  return (
    <div
      className={cn(
        "w-64 border-r bg-muted/30 p-4 overflow-y-auto h-full",
        className
      )}
    >
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-foreground">Variables</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Click to insert at cursor
        </p>
      </div>

      <div className="space-y-2">
        {VARIABLE_CATEGORIES.map((category) => {
          const isExpanded = expandedCategories.has(category.name);
          return (
            <div key={category.name} className="border rounded-md">
              <button
                onClick={() => toggleCategory(category.name)}
                className="w-full px-3 py-2 text-left text-xs font-medium hover:bg-muted/50 flex items-center justify-between"
              >
                <span>{category.name}</span>
                <span className="text-muted-foreground">
                  {isExpanded ? "−" : "+"}
                </span>
              </button>
              {isExpanded && (
                <div className="px-3 pb-2 space-y-1">
                  {category.variables.map((variable) => (
                    <Button
                      key={variable.token}
                      variant="ghost"
                      size="xs"
                      className="w-full justify-start text-xs font-mono"
                      onClick={() => onInsertVariable(variable.token)}
                    >
                      <span className="text-muted-foreground">{variable.token}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {variable.label}
                      </span>
                    </Button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}





























































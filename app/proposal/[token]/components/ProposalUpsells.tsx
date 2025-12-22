// Block 57000 — Optional Add-On Upsells Component

"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

interface Upsell {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url?: string;
  category: string;
}

interface ProposalUpsellsProps {
  proposalId: string;
  selectedUpsells: Upsell[];
  onToggle: (upsell: Upsell) => void;
}

export function ProposalUpsells({ proposalId, selectedUpsells, onToggle }: ProposalUpsellsProps) {
  const [upsells, setUpsells] = useState<Upsell[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUpsells();
  }, [proposalId]);

  const loadUpsells = async () => {
    try {
      const response = await fetch(`/api/proposals/${proposalId}/upsells`);
      if (response.ok) {
        const data = await response.json();
        setUpsells(data.upsells || []);
      }
    } catch (error) {
      console.error("Error loading upsells:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <Card><CardContent className="pt-6">Loading upgrades...</CardContent></Card>;
  }

  if (upsells.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Optional Upgrades</CardTitle>
        <p className="text-sm text-gray-600">
          Enhance your roofing project with these optional add-ons
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {upsells.map((upsell) => {
            const isSelected = selectedUpsells.some((u) => u.id === upsell.id);
            return (
              <div
                key={upsell.id}
                className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                  isSelected ? "border-blue-500 bg-blue-50" : "border-gray-200"
                }`}
                onClick={() => onToggle(upsell)}
              >
                <div className="flex items-start gap-4">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => onToggle(upsell)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold">{upsell.name}</h4>
                      <Badge variant="outline">${upsell.price.toLocaleString()}</Badge>
                    </div>
                    {upsell.description && (
                      <p className="text-sm text-gray-600 mb-2">{upsell.description}</p>
                    )}
                    {upsell.image_url && (
                      <img
                        src={upsell.image_url}
                        alt={upsell.name}
                        className="w-full h-32 object-cover rounded mt-2"
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {selectedUpsells.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-sm text-gray-600">
              {selectedUpsells.length} upgrade{selectedUpsells.length > 1 ? "s" : ""} selected
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

































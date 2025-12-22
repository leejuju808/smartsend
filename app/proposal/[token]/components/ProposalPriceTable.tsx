// Block 57000 — Editable Price Table Component

"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface LineItem {
  id: string;
  item_name: string;
  description?: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  category: string;
}

interface ProposalPriceTableProps {
  proposalId: string;
}

export function ProposalPriceTable({ proposalId }: ProposalPriceTableProps) {
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [subtotal, setSubtotal] = useState(0);

  useEffect(() => {
    loadLineItems();
  }, [proposalId]);

  useEffect(() => {
    const total = lineItems.reduce((sum, item) => sum + item.total_price, 0);
    setSubtotal(total);
  }, [lineItems]);

  const loadLineItems = async () => {
    try {
      const response = await fetch(`/api/proposals/${proposalId}/line-items`);
      if (response.ok) {
        const data = await response.json();
        setLineItems(data.line_items || []);
      }
    } catch (error) {
      console.error("Error loading line items:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">Loading pricing...</CardContent>
      </Card>
    );
  }

  if (lineItems.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pricing Breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead className="text-right">Unit Price</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lineItems.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <div>
                    <p className="font-medium">{item.item_name}</p>
                    {item.description && (
                      <p className="text-sm text-gray-500">{item.description}</p>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  {item.quantity} {item.unit}
                </TableCell>
                <TableCell className="text-right">
                  ${item.unit_price.toLocaleString()}
                </TableCell>
                <TableCell className="text-right font-semibold">
                  ${item.total_price.toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="font-bold">
              <TableCell colSpan={3} className="text-right">
                Subtotal
              </TableCell>
              <TableCell className="text-right">
                ${subtotal.toLocaleString()}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

































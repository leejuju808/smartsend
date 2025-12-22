// Block 220000 — SmartSend Roofing Estimates → Proposals → Contracts → E-Sign → Job Pipeline
// Page: Estimates Dashboard
// Create estimates with line items, materials, quantities, auto-totals

"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { Plus, Trash2, Search, Save, FileText } from "lucide-react";
import { PaymentMomentPaywallModal } from "@/components/roofing/PaymentMomentPaywallModal";

interface LineItem {
  id: string;
  material: string;
  quantity: number;
  unit_price: number;
  total: number;
}

function isPendingMoneyLabel(estimate: any, days: number) {
  const status = String(estimate?.status || "");
  if (status !== "sent" && status !== "waiting") return false;
  if (estimate?.approved_at) return false;
  if (!estimate?.sent_at) return false;
  const sentAt = new Date(estimate.sent_at).getTime();
  if (!Number.isFinite(sentAt)) return false;
  const ageDays = (Date.now() - sentAt) / (1000 * 60 * 60 * 24);
  return ageDays >= days;
}

export default function EstimatesPage() {
  const searchParams = useSearchParams();
  const [estimates, setEstimates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [companies, setCompanies] = useState<any[]>([]);
  const [homeowners, setHomeowners] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredHomeowners, setFilteredHomeowners] = useState<any[]>([]);
  const [billingStatus, setBillingStatus] = useState<{
    estimates_sent: number;
    gate_active: boolean;
    subscription: { plan: "starter" | "growth" | "domination"; status: string; renewed_at: string | null } | null;
  } | null>(null);

  // Form state
  const [selectedCompany, setSelectedCompany] = useState<string>("");
  const [selectedHomeowner, setSelectedHomeowner] = useState<string>("");
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [taxRate, setTaxRate] = useState<number>(0.0825); // Default 8.25%
  const [notes, setNotes] = useState<string>("");

  useEffect(() => {
    loadEstimates();
    loadCompanies();
    loadHomeowners();

    // Operator Mode deep-link: /dashboard/estimates?create=1&homeowner_id=...&email=...&name=...
    try {
      const create = searchParams?.get("create");
      if (create === "1") setShowCreateForm(true);

      const hid = searchParams?.get("homeowner_id");
      if (hid) setSelectedHomeowner(hid);

      const name = searchParams?.get("name");
      const email = searchParams?.get("email");
      const q = (name || email || "").trim();
      if (q) setSearchQuery(q);
    } catch {
      // ignore
    }

    // Stripe return toast (v1 simple)
    const params = new URLSearchParams(window.location.search);
    if (params.get("payment") === "success") {
      alert("SmartSend is live. Let’s close jobs.");
      window.history.replaceState({}, "", "/dashboard/estimates");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // If deep-linked with homeowner_id, lock in the display text once homeowners are loaded
    if (!selectedHomeowner) return;
    if (!homeowners?.length) return;
    const h = homeowners.find((x: any) => x?.id === selectedHomeowner);
    if (h) {
      const label = String(h?.name || h?.email || "").trim();
      if (label) setSearchQuery(label);
      setFilteredHomeowners([]);
    }
  }, [selectedHomeowner, homeowners]);

  useEffect(() => {
    if (!selectedCompany) return;
    (async () => {
      try {
        const res = await fetch(`/api/roofing/billing/status?company_id=${selectedCompany}`);
        if (!res.ok) return;
        const data = await res.json();
        setBillingStatus({
          estimates_sent: data.estimates_sent || 0,
          gate_active: !!data.gate_active,
          subscription: data.subscription || null,
        });
      } catch {
        // ignore
      }
    })();
  }, [selectedCompany]);

  useEffect(() => {
    if (searchQuery) {
      const filtered = homeowners.filter((h) =>
        h.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        h.email?.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredHomeowners(filtered);
    } else {
      setFilteredHomeowners([]);
    }
  }, [searchQuery, homeowners]);

  const loadEstimates = async () => {
    try {
      const response = await fetch("/api/estimates/list");
      if (response.ok) {
        const data = await response.json();
        setEstimates(data.estimates || []);
      }
    } catch (error) {
      console.error("Error loading estimates:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadCompanies = async () => {
    try {
      const response = await fetch("/api/roofing-companies/list");
      if (response.ok) {
        const data = await response.json();
        setCompanies(data.companies || []);
        if (data.companies?.length > 0) {
          setSelectedCompany(data.companies[0].id);
        }
      }
    } catch (error) {
      console.error("Error loading companies:", error);
    }
  };

  const loadHomeowners = async () => {
    try {
      const response = await fetch("/api/homeowners/list");
      if (response.ok) {
        const data = await response.json();
        setHomeowners(data.homeowners || []);
      }
    } catch (error) {
      console.error("Error loading homeowners:", error);
    }
  };

  const addLineItem = () => {
    const newItem: LineItem = {
      id: Date.now().toString(),
      material: "",
      quantity: 1,
      unit_price: 0,
      total: 0,
    };
    setLineItems([...lineItems, newItem]);
  };

  const removeLineItem = (id: string) => {
    setLineItems(lineItems.filter((item) => item.id !== id));
  };

  const updateLineItem = (id: string, field: keyof LineItem, value: any) => {
    setLineItems(
      lineItems.map((item) => {
        if (item.id === id) {
          const updated = { ...item, [field]: value };
          if (field === "quantity" || field === "unit_price") {
            updated.total = updated.quantity * updated.unit_price;
          }
          return updated;
        }
        return item;
      })
    );
  };

  const calculateTotals = () => {
    const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
    const tax = subtotal * taxRate;
    const total = subtotal + tax;
    return { subtotal, tax, total };
  };

  const handleSaveEstimate = async () => {
    if (!selectedCompany) {
      alert("Please select a company");
      return;
    }

    if (lineItems.length === 0) {
      alert("Please add at least one line item");
      return;
    }

    try {
      const response = await fetch("/api/estimates/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: selectedCompany,
          homeowner_id: selectedHomeowner || null,
          line_items: lineItems,
          tax_rate: taxRate,
          notes: notes || null,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        alert("Estimate created successfully!");
        setShowCreateForm(false);
        setLineItems([]);
        setNotes("");
        setSelectedHomeowner("");
        loadEstimates();
      } else {
        const error = await response.json();
        if (response.status === 402 && error?.code === "PAYWALL") {
          setPaywallOpen(true);
          return;
        }
        alert(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error("Error creating estimate:", error);
      alert("Failed to create estimate");
    }
  };

  const { subtotal, tax, total } = calculateTotals();
  const pendingDays = Number(process.env.NEXT_PUBLIC_ESTIMATE_PENDING_DAYS || "5");
  const pendingThreshold = Number.isFinite(pendingDays) ? pendingDays : 5;

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PaymentMomentPaywallModal
        open={paywallOpen}
        onOpenChange={setPaywallOpen}
        companyId={selectedCompany}
      />

      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Estimates</h1>
          <p className="text-gray-600">
            Create estimates with line items, materials, and auto-calculated totals
          </p>
        </div>
        <Button onClick={() => setShowCreateForm(!showCreateForm)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Estimate
        </Button>
      </div>

      {/* BLOCK 268000 — Money Clarity: Subscription Status */}
      {selectedCompany && (
        <div className="mb-6 rounded-lg border bg-white p-4">
          {billingStatus?.subscription?.status === "past_due" && (
            <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Update payment to continue sending estimates.
            </div>
          )}

          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm text-gray-500">Subscription Status</div>
              <div className="text-base font-semibold">
                {(billingStatus?.subscription?.plan || "starter").toUpperCase()}{" "}
                <span className="text-sm font-normal text-gray-500">
                  ({billingStatus?.subscription?.status || "trial"})
                </span>
              </div>
              {billingStatus?.subscription?.renewed_at && (
                <div className="text-sm text-gray-500">
                  Renewal: {new Date(billingStatus.subscription.renewed_at).toLocaleDateString()}
                </div>
              )}
            </div>

            <Button variant="outline" onClick={() => setPaywallOpen(true)}>
              Upgrade
            </Button>
          </div>
        </div>
      )}

      {/* Create Estimate Form */}
      {showCreateForm && (
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6 border">
          <h2 className="text-xl font-semibold mb-4">New Estimate</h2>

          {/* Company Selection */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Company</label>
            <select
              value={selectedCompany}
              onChange={(e) => setSelectedCompany(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            >
              <option value="">Select Company</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>

          {/* Homeowner Search */}
          <div className="mb-4 relative">
            <label className="block text-sm font-medium mb-2">Homeowner</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                type="text"
                placeholder="Search homeowners..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            {filteredHomeowners.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {filteredHomeowners.map((homeowner) => (
                  <button
                    key={homeowner.id}
                    onClick={() => {
                      setSelectedHomeowner(homeowner.id);
                      setSearchQuery(homeowner.name || homeowner.email || "");
                      setFilteredHomeowners([]);
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-gray-100"
                  >
                    <div className="font-medium">{homeowner.name}</div>
                    <div className="text-sm text-gray-500">{homeowner.email}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Line Items */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium">Line Items</label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addLineItem}
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Item
              </Button>
            </div>
            <div className="space-y-2">
              {lineItems.map((item) => (
                <div key={item.id} className="flex gap-2 items-center">
                  <Input
                    placeholder="Material/Description"
                    value={item.material}
                    onChange={(e) =>
                      updateLineItem(item.id, "material", e.target.value)
                    }
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    placeholder="Qty"
                    value={item.quantity}
                    onChange={(e) =>
                      updateLineItem(item.id, "quantity", parseFloat(e.target.value) || 0)
                    }
                    className="w-24"
                  />
                  <Input
                    type="number"
                    placeholder="Unit Price"
                    value={item.unit_price}
                    onChange={(e) =>
                      updateLineItem(item.id, "unit_price", parseFloat(e.target.value) || 0)
                    }
                    className="w-32"
                  />
                  <div className="w-32 text-right font-medium">
                    ${item.total.toFixed(2)}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeLineItem(item.id)}
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Tax Rate */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">
              Tax Rate (%)
            </label>
            <Input
              type="number"
              step="0.0001"
              value={(taxRate * 100).toFixed(4)}
              onChange={(e) =>
                setTaxRate(parseFloat(e.target.value) / 100 || 0)
              }
              className="w-48"
            />
          </div>

          {/* Totals */}
          <div className="mb-4 p-4 bg-gray-50 rounded-lg">
            <div className="flex justify-between mb-2">
              <span className="font-medium">Subtotal:</span>
              <span className="font-medium">${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between mb-2">
              <span>Tax ({(taxRate * 100).toFixed(2)}%):</span>
              <span>${tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between pt-2 border-t">
              <span className="text-lg font-bold">Total:</span>
              <span className="text-lg font-bold text-blue-600">
                ${total.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Notes */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              rows={3}
              placeholder="Additional notes..."
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button onClick={handleSaveEstimate}>
              <Save className="w-4 h-4 mr-2" />
              Save Draft
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateForm(false);
                setLineItems([]);
                setNotes("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Estimates List */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Homeowner
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Total
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Created
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {estimates.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                  No estimates yet. Create your first estimate above.
                </td>
              </tr>
            ) : (
              estimates.map((estimate) => (
                <tr key={estimate.id}>
                  <td className="px-6 py-4 text-sm">
                    {estimate.id.slice(0, 8)}...
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {estimate.homeowner?.name || "N/A"}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium">
                    ${parseFloat(estimate.total || 0).toFixed(2)}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {isPendingMoneyLabel(estimate, pendingThreshold) && (
                        <span className="px-2 py-1 text-xs rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                          ${parseFloat(estimate.total || 0).toFixed(0)} pending
                        </span>
                      )}
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${
                          estimate.status === "draft"
                            ? "bg-gray-100 text-gray-800"
                            : estimate.status === "sent"
                            ? "bg-blue-100 text-blue-800"
                            : estimate.status === "waiting"
                            ? "bg-amber-100 text-amber-800"
                            : estimate.status === "approved"
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {estimate.status}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(estimate.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <Link href={`/dashboard/estimates/${estimate.id}`}>
                      <Button variant="outline" size="sm">
                        <FileText className="w-4 h-4 mr-1" />
                        View / Send
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}


























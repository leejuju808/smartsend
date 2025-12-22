// Block 220000 — SmartSend Roofing Digital Contract Page
// Page: Convert Proposal to Contract and Manage E-Signature

"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/Input";
import { FileText, Send, CheckCircle } from "lucide-react";

export default function ContractPage() {
  const params = useParams();
  const router = useRouter();
  const proposalId = params.id as string;

  const [proposal, setProposal] = useState<any>(null);
  const [contract, setContract] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [terms, setTerms] = useState<string>("");
  const [scopeOfWork, setScopeOfWork] = useState<string>("");
  const [warranty, setWarranty] = useState<string>("");
  const [paymentSchedule, setPaymentSchedule] = useState<any[]>([]);

  useEffect(() => {
    if (proposalId) {
      loadProposal();
      checkExistingContract();
    }
  }, [proposalId]);

  const loadProposal = async () => {
    try {
      const response = await fetch(`/api/proposals/${proposalId}`);
      if (response.ok) {
        const data = await response.json();
        setProposal(data.proposal);
      }
    } catch (error) {
      console.error("Error loading proposal:", error);
    } finally {
      setLoading(false);
    }
  };

  const checkExistingContract = async () => {
    try {
      const response = await fetch(`/api/contracts/by-proposal/${proposalId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.contract) {
          setContract(data.contract);
        }
      }
    } catch (error) {
      // Contract doesn't exist yet, that's fine
    }
  };

  const handleCreateContract = async () => {
    try {
      const response = await fetch("/api/contracts/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposal_id: proposalId,
          terms_and_conditions: terms || null,
          scope_of_work: scopeOfWork || null,
          warranty: warranty || null,
          payment_schedule: paymentSchedule,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setContract(data.contract);
        alert("Contract created successfully!");
      } else {
        const error = await response.json();
        alert(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error("Error creating contract:", error);
      alert("Failed to create contract");
    }
  };

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

  if (!proposal) {
    return (
      <div className="p-6">
        <p>Proposal not found</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Digital Contract</h1>
        <p className="text-gray-600">
          Convert proposal to contract and enable e-signature
        </p>
      </div>

      {contract ? (
        <div className="space-y-6">
          {/* Contract Created Success */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-6">
            <div className="flex items-center mb-4">
              <CheckCircle className="w-6 h-6 text-green-600 mr-2" />
              <h3 className="text-lg font-semibold text-green-800">
                Contract Created
              </h3>
            </div>
            <p className="text-green-700 mb-4">
              Your contract is ready for e-signature. Share the link below with the homeowner.
            </p>
            <div className="bg-white rounded p-4 mb-4">
              <p className="text-sm text-gray-600 mb-2">Contract Link:</p>
              <div className="flex items-center gap-2">
                <Input
                  value={`${process.env.NEXT_PUBLIC_APP_URL || 'https://app.smartsendhq.com'}/contracts/${contract.public_token}`}
                  readOnly
                  className="flex-1"
                />
                <Button
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.smartsendhq.com'}/contracts/${contract.public_token}`
                    );
                    alert("Link copied to clipboard!");
                  }}
                >
                  Copy
                </Button>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  window.open(
                    `/contracts/${contract.public_token}`,
                    "_blank"
                  );
                }}
              >
                <FileText className="w-4 h-4 mr-2" />
                View Contract
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push("/dashboard/estimates")}
              >
                Back to Estimates
              </Button>
            </div>
          </div>

          {/* Contract Status */}
          <div className="bg-white rounded-lg shadow-sm p-6 border">
            <h3 className="font-semibold mb-4">Contract Status</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Status:</span>
                <span
                  className={`px-3 py-1 rounded-full text-sm ${
                    contract.status === "signed"
                      ? "bg-green-100 text-green-800"
                      : contract.status === "awaiting_signature"
                      ? "bg-yellow-100 text-yellow-800"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {contract.status}
                </span>
              </div>
              {contract.signature_date && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Signed:</span>
                  <span className="font-medium">
                    {new Date(contract.signature_date).toLocaleString()}
                  </span>
                </div>
              )}
              {contract.signed_by_name && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Signed By:</span>
                  <span className="font-medium">{contract.signed_by_name}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Contract Form */}
          <div className="bg-white rounded-lg shadow-sm p-6 border">
            <h3 className="font-semibold mb-4">Contract Details</h3>

            {/* Terms and Conditions */}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">
                Terms and Conditions
              </label>
              <textarea
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
                rows={6}
                placeholder="Enter terms and conditions..."
              />
            </div>

            {/* Scope of Work */}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">
                Scope of Work
              </label>
              <textarea
                value={scopeOfWork}
                onChange={(e) => setScopeOfWork(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
                rows={4}
                placeholder="Describe the scope of work..."
              />
            </div>

            {/* Warranty */}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Warranty</label>
              <textarea
                value={warranty}
                onChange={(e) => setWarranty(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
                rows={3}
                placeholder="Enter warranty information..."
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button onClick={handleCreateContract}>
                <FileText className="w-4 h-4 mr-2" />
                Create Contract
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push("/dashboard/estimates")}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


























// Block 32711 — SmartSend Roofing "AI Proposal Builder + Dynamic Contract Generator" v1
// Page: View Proposal

"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ProposalViewer } from "@/components/proposals/ProposalViewer";
import { ContractSigner } from "@/components/proposals/ContractSigner";
import { Button } from "@/components/ui/button";

export default function ProposalPage() {
  const params = useParams();
  const router = useRouter();
  const [proposal, setProposal] = useState<any>(null);
  const [contract, setContract] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showContractSigner, setShowContractSigner] = useState(false);

  useEffect(() => {
    loadProposal();
  }, [params.id]);

  const loadProposal = async () => {
    try {
      const response = await fetch(`/api/proposals/${params.id}`);
      if (!response.ok) {
        throw new Error("Failed to load proposal");
      }
      const data = await response.json();
      setProposal(data.proposal);
      
      // Load contract if exists
      if (data.proposal.contract_documents && data.proposal.contract_documents.length > 0) {
        setContract(data.proposal.contract_documents[0]);
      }
    } catch (error) {
      console.error("Error loading proposal:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleConvertToContract = async () => {
    try {
      const response = await fetch(`/api/proposals/${params.id}/contract`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contract_type: proposal.insurance_mode?.is_insurance_claim ? "insurance" : "standard",
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create contract");
      }

      const data = await response.json();
      setContract(data.contract);
      setShowContractSigner(true);
    } catch (error) {
      console.error("Error creating contract:", error);
      alert("Failed to create contract");
    }
  };

  const handleContractSigned = () => {
    setShowContractSigner(false);
    loadProposal(); // Reload to get updated status
    router.refresh();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div>Loading proposal...</div>
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div>Proposal not found</div>
      </div>
    );
  }

  if (showContractSigner && contract) {
    return (
      <div className="container mx-auto py-8">
        <Button
          variant="outline"
          onClick={() => setShowContractSigner(false)}
          className="mb-4"
        >
          ← Back to Proposal
        </Button>
        <ContractSigner contract={contract} onSigned={handleContractSigned} />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <ProposalViewer
        proposal={proposal}
        onConvertToContract={handleConvertToContract}
        onEdit={() => router.push(`/dashboard/proposals/${params.id}/edit`)}
      />
    </div>
  );
}


































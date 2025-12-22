// Block 32711 — SmartSend Roofing "AI Proposal Builder + Dynamic Contract Generator" v1
// Component: Contract Signer with E-Signature

"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/Input";

interface ContractSignerProps {
  contract: any;
  onSigned?: () => void;
}

export function ContractSigner({ contract, onSigned }: ContractSignerProps) {
  const [signing, setSigning] = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [signedByName, setSignedByName] = useState("");
  const [signedByEmail, setSignedByEmail] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dataUrl = canvas.toDataURL();
    setSignatureData(dataUrl);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureData(null);
  };

  const handleSign = async () => {
    if (!signatureData || !signedByName) {
      alert("Please provide a signature and your name");
      return;
    }

    setSigning(true);

    try {
      const response = await fetch(`/api/contracts/${contract.id}/sign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          signature_data_url: signatureData,
          signed_by_name: signedByName,
          signed_by_email: signedByEmail,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to sign contract");
      }

      if (onSigned) {
        onSigned();
      }
    } catch (error: any) {
      alert(error.message || "Failed to sign contract");
    } finally {
      setSigning(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-6">Sign Contract</h2>

      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">Your Name *</label>
        <Input
          value={signedByName}
          onChange={(e) => setSignedByName(e.target.value)}
          placeholder="John Doe"
          required
        />
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">Your Email</label>
        <Input
          type="email"
          value={signedByEmail}
          onChange={(e) => setSignedByEmail(e.target.value)}
          placeholder="john@example.com"
        />
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">Signature *</label>
        <div className="border-2 border-dashed border-gray-300 rounded p-4">
          <canvas
            ref={canvasRef}
            width={600}
            height={200}
            className="border border-gray-200 rounded cursor-crosshair"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
          <div className="mt-2 flex gap-2">
            <Button variant="outline" onClick={clearSignature} size="sm">
              Clear
            </Button>
            <p className="text-sm text-gray-500 self-center">
              Draw your signature above
            </p>
          </div>
        </div>
      </div>

      <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded">
        <p className="text-sm text-yellow-800">
          By signing, you agree to the terms and conditions outlined in this contract.
        </p>
      </div>

      <Button
        onClick={handleSign}
        disabled={signing || !signatureData || !signedByName}
        className="w-full"
      >
        {signing ? "Signing..." : "Sign Contract"}
      </Button>
    </div>
  );
}


































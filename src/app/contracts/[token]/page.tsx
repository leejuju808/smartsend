// Block 220000 — SmartSend Roofing Public Contract Signing Page
// Page: Homeowner-facing contract signing with e-signature

"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/Input";
import { CheckCircle, X } from "lucide-react";

export default function ContractSigningPage() {
  const params = useParams();
  const token = params.token as string;

  const [contract, setContract] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);
  const [signature, setSignature] = useState<string>("");
  const [signedByName, setSignedByName] = useState<string>("");
  const [signedByEmail, setSignedByEmail] = useState<string>("");
  const [canvasRef, setCanvasRef] = useState<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    if (token) {
      loadContract();
    }
  }, [token]);

  const loadContract = async () => {
    try {
      const response = await fetch(`/api/contracts/public/${token}`);
      if (response.ok) {
        const data = await response.json();
        setContract(data.contract);
        if (data.contract.status === "signed") {
          setSigned(true);
        }
      }
    } catch (error) {
      console.error("Error loading contract:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canvasRef) {
      const ctx = canvasRef.getContext("2d");
      if (ctx) {
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
      }
    }
  }, [canvasRef]);

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = canvasRef;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(
      e.clientX - rect.left,
      e.clientY - rect.top
    );
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !canvasRef) return;

    const rect = canvasRef.getBoundingClientRect();
    const ctx = canvasRef.getContext("2d");
    if (!ctx) return;

    ctx.lineTo(
      e.clientX - rect.left,
      e.clientY - rect.top
    );
    ctx.stroke();
  };

  const handleCanvasMouseUp = () => {
    setIsDrawing(false);
    if (canvasRef) {
      setSignature(canvasRef.toDataURL());
    }
  };

  const clearSignature = () => {
    if (canvasRef) {
      const ctx = canvasRef.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.width, canvasRef.height);
        setSignature("");
      }
    }
  };

  const handleSignContract = async () => {
    if (!signature || !signedByName || !signedByEmail) {
      alert("Please provide signature, name, and email");
      return;
    }

    setSigning(true);
    try {
      const response = await fetch("/api/contracts/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contract_token: token,
          signature,
          signed_by_name: signedByName,
          signed_by_email: signedByEmail,
        }),
      });

      if (response.ok) {
        setSigned(true);
        alert("Contract signed successfully! The contractor will be notified.");
      } else {
        const error = await response.json();
        alert(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error("Error signing contract:", error);
      alert("Failed to sign contract");
    } finally {
      setSigning(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-center">
          <div className="h-8 bg-gray-200 rounded w-64 mb-4"></div>
          <p className="text-gray-600">Loading contract...</p>
        </div>
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <X className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Contract Not Found</h1>
          <p className="text-gray-600">
            The contract you're looking for doesn't exist or has been removed.
          </p>
        </div>
      </div>
    );
  }

  if (signed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Contract Signed!</h1>
          <p className="text-gray-600 mb-4">
            Thank you for signing the contract. The contractor has been notified and will be in touch soon.
          </p>
          <p className="text-sm text-gray-500">
            Signed on {new Date(contract.signature_date).toLocaleString()}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Contract Content */}
        <div className="bg-white rounded-lg shadow-sm mb-6 p-8">
          <div
            dangerouslySetInnerHTML={{ __html: contract.contract_html }}
          />
        </div>

        {/* Signature Section */}
        {contract.requires_signature && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-bold mb-4">Sign Contract</h2>

            {/* Signature Canvas */}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">
                Your Signature
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                <canvas
                  ref={setCanvasRef}
                  width={600}
                  height={200}
                  className="border border-gray-200 rounded cursor-crosshair w-full"
                  onMouseDown={handleCanvasMouseDown}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseUp={handleCanvasMouseUp}
                  onMouseLeave={handleCanvasMouseUp}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={clearSignature}
                className="mt-2"
              >
                Clear
              </Button>
            </div>

            {/* Name and Email */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Full Name
                </label>
                <Input
                  type="text"
                  value={signedByName}
                  onChange={(e) => setSignedByName(e.target.value)}
                  placeholder="Enter your full name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Email
                </label>
                <Input
                  type="email"
                  value={signedByEmail}
                  onChange={(e) => setSignedByEmail(e.target.value)}
                  placeholder="Enter your email"
                />
              </div>
            </div>

            {/* Sign Button */}
            <Button
              onClick={handleSignContract}
              disabled={!signature || !signedByName || !signedByEmail || signing}
              className="w-full"
              size="lg"
            >
              {signing ? "Signing..." : "Sign Contract"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}


























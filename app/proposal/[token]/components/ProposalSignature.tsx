// Block 57000 — Digital Signature Component
// Supports type-to-sign, mouse/touchpad sign, and mobile touch sign

"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SignatureType = "typed" | "drawn" | "touch";

interface ProposalSignatureProps {
  onSign: (signature: { type: SignatureType; data: string; name: string }) => void;
}

export function ProposalSignature({ onSign }: ProposalSignatureProps) {
  const [signatureType, setSignatureType] = useState<SignatureType>("typed");
  const [typedName, setTypedName] = useState("");
  const [drawnSignature, setDrawnSignature] = useState<string>("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    if (signatureType === "drawn" && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
      }
    }
  }, [signatureType]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (isDrawing && canvasRef.current) {
      const signature = canvasRef.current.toDataURL();
      setDrawnSignature(signature);
    }
    setIsDrawing(false);
  };

  const clearSignature = () => {
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
    setDrawnSignature("");
  };

  const handleSign = () => {
    let signatureData = "";
    let name = "";

    if (signatureType === "typed") {
      if (!typedName.trim()) {
        alert("Please enter your name");
        return;
      }
      signatureData = typedName;
      name = typedName;
    } else if (signatureType === "drawn" || signatureType === "touch") {
      if (!drawnSignature) {
        alert("Please sign using your mouse or touch");
        return;
      }
      signatureData = drawnSignature;
      name = "Homeowner";
    }

    onSign({
      type: signatureType,
      data: signatureData,
      name,
    });
  };

  return (
    <div className="space-y-4">
      {/* Signature Type Selector */}
      <div className="flex gap-2">
        <Button
          variant={signatureType === "typed" ? "default" : "outline"}
          size="sm"
          onClick={() => setSignatureType("typed")}
        >
          Type Name
        </Button>
        <Button
          variant={signatureType === "drawn" ? "default" : "outline"}
          size="sm"
          onClick={() => setSignatureType("drawn")}
        >
          Draw Signature
        </Button>
        <Button
          variant={signatureType === "touch" ? "default" : "outline"}
          size="sm"
          onClick={() => setSignatureType("touch")}
        >
          Touch Sign
        </Button>
      </div>

      {/* Typed Signature */}
      {signatureType === "typed" && (
        <div className="space-y-2">
          <Label htmlFor="signature-name">Your Name</Label>
          <Input
            id="signature-name"
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            placeholder="Enter your full name"
          />
        </div>
      )}

      {/* Drawn/Touch Signature */}
      {(signatureType === "drawn" || signatureType === "touch") && (
        <div className="space-y-2">
          <Label>Sign Here</Label>
          <div className="border-2 border-gray-300 rounded-lg bg-white">
            <canvas
              ref={canvasRef}
              width={600}
              height={200}
              className="w-full cursor-crosshair touch-none"
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
            />
          </div>
          <Button variant="outline" size="sm" onClick={clearSignature}>
            Clear
          </Button>
        </div>
      )}

      {/* Legal Compliance */}
      <div className="bg-gray-50 p-4 rounded-lg text-sm">
        <p className="font-semibold mb-2">Legal Compliance</p>
        <p className="text-gray-600">
          By signing this proposal, you acknowledge that you have read and agree to the terms
          and conditions. Your signature will be stored with IP address and timestamp for legal
          compliance.
        </p>
      </div>

      {/* Sign Button */}
      <Button onClick={handleSign} className="w-full" size="lg">
        Sign Proposal
      </Button>
    </div>
  );
}

































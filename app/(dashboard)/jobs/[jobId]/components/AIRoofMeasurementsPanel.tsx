// Block 190000 — SmartSend Roofing AI Roof Measurements v1
// Enhanced Measurement Panel with Aerial, Photo, and AR support

"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Camera,
  Upload,
  Ruler,
  MapPin,
  Satellite,
  Download,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Package,
  FileText,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import useSWR from "swr";

interface RoofMeasurement {
  id: string;
  method: "aerial" | "photo" | "ar";
  squares: number;
  pitch: string;
  facets: number;
  ridges_length: number;
  eaves_length: number;
  hips_length: number;
  valleys_length: number;
  waste_factor: number;
  confidence: number;
  materials: any;
  raw_output: any;
  image_urls: string[];
  created_at: string;
}

interface AIRoofMeasurementsPanelProps {
  jobId: string;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function AIRoofMeasurementsPanel({
  jobId,
}: AIRoofMeasurementsPanelProps) {
  const supabase = createClient();
  const [selectedMethod, setSelectedMethod] = useState<"aerial" | "photo">("aerial");
  const [measuring, setMeasuring] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fetch existing measurements
  const { data: measurementsData, mutate } = useSWR<{ measurements: RoofMeasurement[] }>(
    `/api/jobs/${jobId}/measurements`,
    fetcher
  );

  const measurements = measurementsData?.measurements || [];
  const latestMeasurement = measurements.length > 0 ? measurements[0] : null;

  const handleAerialMeasurement = async () => {
    setMeasuring(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/jobs/${jobId}/measurements/aerial`, {
        method: "POST",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to measure roof");
      }

      const data = await response.json();
      setSuccess("Aerial measurement completed successfully!");
      mutate();
    } catch (err: any) {
      setError(err.message || "Failed to measure roof");
    } finally {
      setMeasuring(false);
    }
  };

  const handlePhotoUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setUploading(true);
    setError(null);

    try {
      // Upload images to storage first
      const uploadedUrls: string[] = [];

      for (const file of Array.from(files)) {
        const fileExt = file.name.split(".").pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${jobId}/measurements/${fileName}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("job-photos")
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from("job-photos").getPublicUrl(filePath);

        uploadedUrls.push(publicUrl);
      }

      setUploadedImages(uploadedUrls);
    } catch (err: any) {
      setError(err.message || "Failed to upload images");
      setUploading(false);
    }
  };

  const handlePhotoMeasurement = async () => {
    if (uploadedImages.length === 0) {
      setError("Please upload at least one photo");
      return;
    }

    setMeasuring(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/jobs/${jobId}/measurements/photo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrls: uploadedImages }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to measure roof");
      }

      const data = await response.json();
      setSuccess("Photo-based measurement completed successfully!");
      setUploadedImages([]);
      mutate();
    } catch (err: any) {
      setError(err.message || "Failed to measure roof");
    } finally {
      setMeasuring(false);
    }
  };

  const handleGenerateReport = async (measurementId: string) => {
    try {
      const response = await fetch(
        `/api/jobs/${jobId}/measurements/${measurementId}/report`
      );

      if (!response.ok) {
        throw new Error("Failed to generate report");
      }

      const html = await response.text();
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `roof-measurement-report-${measurementId}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || "Failed to generate report");
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return "bg-green-500";
    if (confidence >= 0.6) return "bg-yellow-500";
    return "bg-red-500";
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.8) return "High";
    if (confidence >= 0.6) return "Medium";
    return "Low";
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ruler className="h-5 w-5" />
            AI Roof Measurements
          </CardTitle>
          <CardDescription>
            Instant roof measurements using aerial imagery, photos, or AR scanning
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={selectedMethod} onValueChange={(v) => setSelectedMethod(v as any)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="aerial">
                <Satellite className="h-4 w-4 mr-2" />
                Aerial (Satellite)
              </TabsTrigger>
              <TabsTrigger value="photo">
                <Camera className="h-4 w-4 mr-2" />
                Photo Upload
              </TabsTrigger>
            </TabsList>

            <TabsContent value="aerial" className="space-y-4 mt-4">
              <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-900">
                <div className="flex items-start gap-3">
                  <Satellite className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-blue-900 dark:text-blue-100">
                      Aerial Measurement
                    </h3>
                    <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                      Uses satellite imagery to instantly measure your roof. Perfect for quick
                      estimates and initial assessments. Works best for residential roofs with
                      clear satellite visibility.
                    </p>
                  </div>
                </div>
              </div>

              <Button
                onClick={handleAerialMeasurement}
                disabled={measuring}
                size="lg"
                className="w-full"
              >
                {measuring ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Measuring Roof...
                  </>
                ) : (
                  <>
                    <Satellite className="h-4 w-4 mr-2" />
                    Measure with Aerial Imagery
                  </>
                )}
              </Button>
            </TabsContent>

            <TabsContent value="photo" className="space-y-4 mt-4">
              <div className="p-4 bg-purple-50 dark:bg-purple-950/20 rounded-lg border border-purple-200 dark:border-purple-900">
                <div className="flex items-start gap-3">
                  <Camera className="h-5 w-5 text-purple-600 dark:text-purple-400 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-purple-900 dark:text-purple-100">
                      Photo-Based Measurement
                    </h3>
                    <p className="text-sm text-purple-700 dark:text-purple-300 mt-1">
                      Upload 3-6 photos from different angles (front, sides, rear, up-close slope,
                      optional drone). AI analyzes all images for the most accurate measurements.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-6">
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => handlePhotoUpload(e.target.files)}
                      disabled={uploading}
                    />
                    <div className="text-center">
                      <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {uploading
                          ? "Uploading..."
                          : uploadedImages.length > 0
                          ? `${uploadedImages.length} image(s) uploaded`
                          : "Click to upload roof photos"}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                        Recommended: 3-6 images from different angles
                      </p>
                    </div>
                  </label>
                </div>

                {uploadedImages.length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {uploadedImages.map((url, i) => (
                      <img
                        key={i}
                        src={url}
                        alt={`Upload ${i + 1}`}
                        className="rounded-lg object-cover h-32 w-full"
                      />
                    ))}
                  </div>
                )}

                <Button
                  onClick={handlePhotoMeasurement}
                  disabled={measuring || uploadedImages.length === 0}
                  size="lg"
                  className="w-full"
                >
                  {measuring ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Measuring Roof...
                    </>
                  ) : (
                    <>
                      <Camera className="h-4 w-4 mr-2" />
                      Measure from Photos
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded text-red-600 dark:text-red-400 text-sm mt-4">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded text-green-600 dark:text-green-400 text-sm mt-4">
              <CheckCircle2 className="h-4 w-4" />
              {success}
            </div>
          )}
        </CardContent>
      </Card>

      {latestMeasurement && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Latest Measurement</span>
              <div className="flex gap-2">
                <Badge variant="outline" className="capitalize">
                  {latestMeasurement.method}
                </Badge>
                <Badge className={getConfidenceColor(latestMeasurement.confidence)}>
                  {getConfidenceLabel(latestMeasurement.confidence)} Confidence
                </Badge>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Squares</p>
                <p className="text-2xl font-bold">{latestMeasurement.squares}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Pitch</p>
                <p className="text-2xl font-bold">{latestMeasurement.pitch}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Facets</p>
                <p className="text-2xl font-bold">{latestMeasurement.facets}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Waste Factor</p>
                <p className="text-2xl font-bold">
                  {(latestMeasurement.waste_factor * 100).toFixed(0)}%
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Ridge</p>
                <p className="text-lg font-semibold">{latestMeasurement.ridges_length} ft</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Eaves</p>
                <p className="text-lg font-semibold">{latestMeasurement.eaves_length} ft</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Valleys</p>
                <p className="text-lg font-semibold">{latestMeasurement.valleys_length} ft</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Hips</p>
                <p className="text-lg font-semibold">{latestMeasurement.hips_length} ft</p>
              </div>
            </div>

            {latestMeasurement.materials && (
              <div className="pt-4 border-t">
                <h3 className="font-medium mb-3 flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Materials Needed
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {latestMeasurement.materials.bundles && (
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Bundles</p>
                      <p className="text-lg font-semibold">{latestMeasurement.materials.bundles}</p>
                    </div>
                  )}
                  {latestMeasurement.materials.starter && (
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Starter</p>
                      <p className="text-lg font-semibold">
                        {latestMeasurement.materials.starter}
                      </p>
                    </div>
                  )}
                  {latestMeasurement.materials.ridge && (
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Ridge</p>
                      <p className="text-lg font-semibold">{latestMeasurement.materials.ridge}</p>
                    </div>
                  )}
                  {latestMeasurement.materials.underlayment_rolls && (
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Underlayment</p>
                      <p className="text-lg font-semibold">
                        {latestMeasurement.materials.underlayment_rolls} rolls
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => handleGenerateReport(latestMeasurement.id)}
              >
                <FileText className="h-4 w-4 mr-2" />
                Generate PDF Report
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}



























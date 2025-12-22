"use client";

import { useState, useEffect } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Camera, 
  Upload, 
  Ruler, 
  TrendingUp, 
  AlertCircle,
  CheckCircle,
  Loader2,
  Image as ImageIcon
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface RoofPhoto {
  id: string;
  photo_url: string;
  angle: string;
  created_at: string;
}

interface RoofMeasurement {
  id: string;
  squares: number;
  pitch: string;
  eaves_length: number;
  rakes_length: number;
  hips_length: number;
  valleys_length: number;
  ridge_length: number;
  penetrations: Array<{ type: string; count: number }>;
  confidence: number;
  diagram_url?: string;
  created_at: string;
}

interface MaterialEstimate {
  id: string;
  material_type: string;
  quantity: number;
  unit: string;
}

interface RoofMeasurementPanelProps {
  jobId: string;
}

const ANGLE_OPTIONS = [
  { value: "front", label: "Front", required: true },
  { value: "back", label: "Back", required: true },
  { value: "left", label: "Left", required: true },
  { value: "right", label: "Right", required: true },
  { value: "drone", label: "Drone (Optional)", required: false },
  { value: "satellite", label: "Satellite (Optional)", required: false },
];

export function RoofMeasurementPanel({ jobId }: RoofMeasurementPanelProps) {
  const supabase = createClientComponentClient();
  const [photos, setPhotos] = useState<Record<string, RoofPhoto[]>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [measuring, setMeasuring] = useState(false);
  const [measurement, setMeasurement] = useState<RoofMeasurement | null>(null);
  const [materials, setMaterials] = useState<MaterialEstimate[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Load existing photos and measurement
  useEffect(() => {
    loadData();
  }, [jobId]);

  const loadData = async () => {
    try {
      // Load photos
      const { data: photosData } = await supabase
        .from("roof_photos")
        .select("*")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false });

      if (photosData) {
        const grouped = photosData.reduce((acc, photo) => {
          if (!acc[photo.angle]) acc[photo.angle] = [];
          acc[photo.angle].push(photo);
          return acc;
        }, {} as Record<string, RoofPhoto[]>);
        setPhotos(grouped);
      }

      // Load measurement
      const response = await fetch(`/api/jobs/${jobId}/measure-roof`);
      if (response.ok) {
        const data = await response.json();
        if (data.measurement) {
          setMeasurement(data.measurement);
          setMaterials(data.materials || []);
        }
      }
    } catch (err) {
      console.error("Error loading data:", err);
    }
  };

  const handleFileUpload = async (angle: string, files: FileList | null) => {
    if (!files || files.length === 0) return;

    setUploading({ ...uploading, [angle]: true });
    setError(null);

    try {
      const formData = new FormData();
      Array.from(files).forEach((file) => {
        formData.append("files", file);
      });
      formData.append("angle", angle);

      const response = await fetch(`/api/jobs/${jobId}/roof-photos`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to upload photos");
      }

      const data = await response.json();
      
      // Update photos state
      setPhotos((prev) => ({
        ...prev,
        [angle]: [...(prev[angle] || []), ...data.photos],
      }));

      setUploading({ ...uploading, [angle]: false });
    } catch (err: any) {
      setError(err.message || "Failed to upload photos");
      setUploading({ ...uploading, [angle]: false });
    }
  };

  const handleMeasure = async () => {
    // Check minimum photos
    const requiredAngles = ANGLE_OPTIONS.filter((a) => a.required);
    const hasRequired = requiredAngles.every(
      (angle) => photos[angle.value] && photos[angle.value].length > 0
    );

    if (!hasRequired) {
      setError("Please upload at least front, back, left, and right photos");
      return;
    }

    setMeasuring(true);
    setError(null);

    try {
      const response = await fetch(`/api/jobs/${jobId}/measure-roof`, {
        method: "POST",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to measure roof");
      }

      const data = await response.json();
      setMeasurement(data.measurement);
      setMaterials(data.materials || []);

      // Reload photos to get any updates
      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to measure roof");
    } finally {
      setMeasuring(false);
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
            AI Roof Measurement
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="photos" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="photos">Upload Photos</TabsTrigger>
              <TabsTrigger value="results">Measurement Results</TabsTrigger>
            </TabsList>

            <TabsContent value="photos" className="space-y-4 mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {ANGLE_OPTIONS.map((angle) => (
                  <Card key={angle.value} className="relative">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium">
                        {angle.label}
                        {angle.required && (
                          <span className="text-red-500 ml-1">*</span>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {photos[angle.value] && photos[angle.value].length > 0 ? (
                        <div className="space-y-2">
                          {photos[angle.value].map((photo) => (
                            <div
                              key={photo.id}
                              className="relative aspect-video bg-zinc-900 rounded overflow-hidden"
                            >
                              <img
                                src={photo.photo_url}
                                alt={angle.label}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="aspect-video border-2 border-dashed border-zinc-700 rounded flex items-center justify-center">
                          <ImageIcon className="h-8 w-8 text-zinc-500" />
                        </div>
                      )}

                      <label className="cursor-pointer">
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(e) => handleFileUpload(angle.value, e.target.files)}
                          disabled={uploading[angle.value]}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          disabled={uploading[angle.value]}
                        >
                          {uploading[angle.value] ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Uploading...
                            </>
                          ) : (
                            <>
                              <Upload className="h-4 w-4 mr-2" />
                              Upload
                            </>
                          )}
                        </Button>
                      </label>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-sm">
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  onClick={handleMeasure}
                  disabled={measuring}
                  size="lg"
                >
                  {measuring ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Measuring...
                    </>
                  ) : (
                    <>
                      <Ruler className="h-4 w-4 mr-2" />
                      Measure Roof
                    </>
                  )}
                </Button>
                {measurement && (
                  <Button
                    onClick={async () => {
                      try {
                        const response = await fetch(`/api/jobs/${jobId}/sync-measurement`, {
                          method: "POST",
                        });
                        if (response.ok) {
                          alert("Measurement synced to proposal and materials!");
                        } else {
                          alert("Failed to sync measurement");
                        }
                      } catch (err) {
                        alert("Error syncing measurement");
                      }
                    }}
                    variant="outline"
                    size="lg"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Use in Proposal
                  </Button>
                )}
              </div>
            </TabsContent>

            <TabsContent value="results" className="space-y-4 mt-4">
              {measurement ? (
                <div className="space-y-4">
                  {/* Confidence Score */}
                  <div className="flex items-center justify-between p-4 bg-zinc-900 rounded-lg">
                    <div>
                      <p className="text-sm text-zinc-400">Confidence Score</p>
                      <p className="text-2xl font-bold mt-1">
                        {Math.round(measurement.confidence * 100)}%
                      </p>
                    </div>
                    <Badge
                      className={`${getConfidenceColor(
                        measurement.confidence
                      )} text-white`}
                    >
                      {getConfidenceLabel(measurement.confidence)} Confidence
                    </Badge>
                  </div>

                  {/* Key Measurements */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card>
                      <CardContent className="pt-4">
                        <p className="text-sm text-zinc-400">Squares</p>
                        <p className="text-2xl font-bold mt-1">
                          {measurement.squares}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <p className="text-sm text-zinc-400">Pitch</p>
                        <p className="text-2xl font-bold mt-1">
                          {measurement.pitch}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <p className="text-sm text-zinc-400">Eaves</p>
                        <p className="text-2xl font-bold mt-1">
                          {measurement.eaves_length} ft
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <p className="text-sm text-zinc-400">Ridge</p>
                        <p className="text-2xl font-bold mt-1">
                          {measurement.ridge_length} ft
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Diagram */}
                  {measurement.diagram_url && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm">Roof Diagram</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <img
                          src={measurement.diagram_url}
                          alt="Roof diagram"
                          className="w-full rounded"
                        />
                      </CardContent>
                    </Card>
                  )}

                  {/* Detailed Measurements */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Detailed Measurements</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Rakes Length:</span>
                        <span className="font-medium">{measurement.rakes_length} ft</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Hips Length:</span>
                        <span className="font-medium">{measurement.hips_length} ft</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Valleys Length:</span>
                        <span className="font-medium">{measurement.valleys_length} ft</span>
                      </div>
                      {measurement.penetrations && measurement.penetrations.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-zinc-800">
                          <p className="text-sm font-medium mb-2">Penetrations:</p>
                          {measurement.penetrations.map((p, i) => (
                            <div key={i} className="flex justify-between text-sm">
                              <span className="text-zinc-400 capitalize">{p.type}:</span>
                              <span className="font-medium">{p.count}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <div className="text-center py-12 text-zinc-400">
                  <Ruler className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No measurement yet. Upload photos and click "Measure Roof" to get started.</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

































"use client";

import { useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Camera, Plus, Upload } from "lucide-react";
// Note: Using img tag instead of Next.js Image for external URLs
// import Image from "next/image";

interface JobPhotosGalleryProps {
  jobId: string;
  photos: Array<{
    id: string;
    photo_url: string;
    label: 'before' | 'during' | 'after' | null;
    created_at: string;
  }>;
}

export function JobPhotosGallery({ jobId, photos: initialPhotos }: JobPhotosGalleryProps) {
  const supabase = createClientComponentClient();
  const [photos, setPhotos] = useState(initialPhotos);
  const [uploading, setUploading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      // Upload to Supabase Storage (you'll need to configure this)
      const fileExt = file.name.split('.').pop();
      const fileName = `${jobId}/${Date.now()}.${fileExt}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('job-photos')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('job-photos')
        .getPublicUrl(fileName);

      // Create photo record
      const { data, error } = await supabase
        .from('job_photos')
        .insert({
          job_id: jobId,
          photo_url: publicUrl,
          label: null, // User can set this later
        })
        .select()
        .single();

      if (error) throw error;

      setPhotos([...photos, data]);
    } catch (error) {
      console.error('Error uploading photo:', error);
      alert('Failed to upload photo. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const photosByLabel = {
    before: photos.filter(p => p.label === 'before'),
    during: photos.filter(p => p.label === 'during'),
    after: photos.filter(p => p.label === 'after'),
    unlabeled: photos.filter(p => !p.label),
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Photos
          </CardTitle>
          <div>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
              id="photo-upload"
              disabled={uploading}
            />
            <Button
              onClick={() => document.getElementById('photo-upload')?.click()}
              size="sm"
              disabled={uploading}
            >
              <Upload className="h-4 w-4 mr-2" />
              {uploading ? 'Uploading...' : 'Upload Photo'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {photos.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Camera className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No photos uploaded yet.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(photosByLabel).map(([label, labelPhotos]) => {
              if (labelPhotos.length === 0) return null;
              return (
                <div key={label}>
                  <h3 className="text-sm font-medium mb-3 capitalize">{label} Photos</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {labelPhotos.map((photo) => (
                      <div key={photo.id} className="relative aspect-square rounded-lg overflow-hidden border">
                        <img
                          src={photo.photo_url}
                          alt={`${label} photo`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}



































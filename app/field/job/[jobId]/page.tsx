"use client";

// Block 22750 — SmartSend Roofing Field App v1
// Field Job Page — Core Field UI for a Single Job
// /field/job/[jobId]

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/src/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Clock,
  Camera,
  FileText,
  Upload,
  X,
  Image as ImageIcon,
} from "lucide-react";
import Image from "next/image";

type Job = {
  id: string;
  title: string;
  status: string;
  job_value: number;
  scheduled_start_date: string;
  progress_percent: number | null;
  workspace_id?: string;
};

type FieldSession = {
  id: string;
  check_in_at: string;
  check_out_at: string | null;
  progress_percent: number | null;
  notes: string | null;
} | null;

type Photo = {
  id: string;
  storage_path: string;
  tag: string;
  caption: string | null;
  url: string;
  created_at: string;
};

type Note = {
  id: string;
  note_type: string;
  content: string;
  created_at: string;
};

const NOTE_TEMPLATES = [
  "Decking replaced",
  "Extra layer discovered",
  "Material delivered",
  "Weather delay",
  "Homeowner on site",
  "Issue found - needs approval",
];

export default function FieldJobPage({ params }: { params: { jobId: string } }) {
  const router = useRouter();
  const { jobId } = params;
  const [job, setJob] = useState<Job | null>(null);
  const [session, setSession] = useState<FieldSession>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [progress, setProgress] = useState(0);
  const [checkoutNotes, setCheckoutNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [addingNote, setAddingNote] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [noteType, setNoteType] = useState("general");

  useEffect(() => {
    fetchJobData();
  }, [jobId]);

  const fetchJobData = async () => {
    try {
      setLoading(true);
      // Fetch field activity (which includes job info via sessions)
      const activityResponse = await fetch(`/api/field/job/${jobId}/activity`);
      if (activityResponse.ok) {
        const activityData = await activityResponse.json();
        // Find active session
        const activeSession = activityData.sessions?.find(
          (s: any) => !s.check_out_at
        );
        setSession(activeSession || null);
        setPhotos(activityData.photos || []);
        setNotes(activityData.notes || []);
        
        // Get workspace_id from first session if available
        const firstSession = activityData.sessions?.[0];
        if (firstSession?.workspace_id && !job) {
          // Fetch job from today's list to get basic info
          const todayResponse = await fetch("/api/field/today");
          if (todayResponse.ok) {
            const todayData = await todayResponse.json();
            const foundJob = todayData.jobs?.find((j: any) => j.id === jobId);
            if (foundJob) {
              setJob({
                ...foundJob,
                workspace_id: firstSession.workspace_id,
              });
              setProgress(foundJob.progress_percent || 0);
            }
          }
        }
      }
    } catch (err) {
      console.error("Error fetching job data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckIn = async () => {
    if (!job) return;
    try {
      setCheckingIn(true);
      const response = await fetch("/api/field/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          workspace_id: job.workspace_id || "", // You'll need to get this from job
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to check in");
      }

      const data = await response.json();
      setSession(data.session);
      await fetchJobData();
    } catch (err: any) {
      alert(err.message || "Failed to check in");
    } finally {
      setCheckingIn(false);
    }
  };

  const handleCheckOut = async () => {
    if (!job || !session) return;
    try {
      setCheckingOut(true);
      const response = await fetch("/api/field/check-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          field_session_id: session.id,
          job_id: jobId,
          workspace_id: job.workspace_id || "",
          progress_percent: progress,
          notes: checkoutNotes,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to check out");
      }

      await fetchJobData();
      router.push("/field/today");
    } catch (err: any) {
      alert(err.message || "Failed to check out");
    } finally {
      setCheckingOut(false);
    }
  };

  const handlePhotoUpload = async (files: FileList | null) => {
    if (!files || !job || !session) return;
    try {
      setUploadingPhotos(true);
      const formData = new FormData();
      formData.append("job_id", jobId);
      formData.append("workspace_id", job.workspace_id || "");
      formData.append("field_session_id", session.id);
      formData.append("tag", "during");

      Array.from(files).forEach((file) => {
        formData.append("files", file);
      });

      const response = await fetch("/api/field/photos", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to upload photos");
      }

      const data = await response.json();
      setPhotos([...photos, ...data.photos]);
    } catch (err: any) {
      alert(err.message || "Failed to upload photos");
    } finally {
      setUploadingPhotos(false);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim() || !job || !session) return;
    try {
      setAddingNote(true);
      const response = await fetch("/api/field/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          workspace_id: job.workspace_id || "",
          field_session_id: session.id,
          note_type: noteType,
          content: newNote,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to add note");
      }

      const data = await response.json();
      setNotes([data.note, ...notes]);
      setNewNote("");
      setNoteType("general");
    } catch (err: any) {
      alert(err.message || "Failed to add note");
    } finally {
      setAddingNote(false);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  };

  if (loading) {
    return (
      <div className="container mx-auto p-4">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto"></div>
            <p className="mt-4 text-sm text-zinc-400">Loading job...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="container mx-auto p-4">
        <Card className="border-red-500">
          <CardContent className="pt-6">
            <p className="text-red-400">Job not found</p>
            <Button onClick={() => router.push("/field/today")} className="mt-4" variant="outline">
              Back to Today
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <Button
          onClick={() => router.push("/field/today")}
          variant="ghost"
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Today
        </Button>
        <h1 className="text-2xl font-bold text-white mb-2">{job.title}</h1>
        <p className="text-sm text-zinc-400">
          Scheduled: {new Date(job.scheduled_start_date).toLocaleDateString("en-US")}
        </p>
      </div>

      {/* Check In/Out Section */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Check In / Out</CardTitle>
        </CardHeader>
        <CardContent>
          {!session ? (
            <div className="space-y-4">
              <p className="text-sm text-zinc-400">Not checked in yet</p>
              <Button
                onClick={handleCheckIn}
                disabled={checkingIn}
                className="w-full"
                size="lg"
              >
                {checkingIn ? "Checking in..." : "Check In"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-5 w-5 text-green-400" />
                <span className="text-zinc-300">
                  Checked in at {formatTime(session.check_in_at)}
                </span>
              </div>
              {!session.check_out_at && (
                <div className="space-y-4">
                  <div>
                    <Label className="mb-2 block">Progress: {progress}%</Label>
                    <Slider
                      value={[progress]}
                      onValueChange={(value) => setProgress(value[0])}
                      max={100}
                      step={5}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <Label htmlFor="checkout-notes" className="mb-2 block">
                      Notes (optional)
                    </Label>
                    <Textarea
                      id="checkout-notes"
                      value={checkoutNotes}
                      onChange={(e) => setCheckoutNotes(e.target.value)}
                      placeholder="Add any notes about today's work..."
                      rows={3}
                    />
                  </div>
                  <Button
                    onClick={handleCheckOut}
                    disabled={checkingOut}
                    className="w-full"
                    size="lg"
                    variant="outline"
                  >
                    {checkingOut ? "Checking out..." : "Check Out"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Photo Upload Section */}
      {session && !session.check_out_at && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Photos</CardTitle>
            <CardDescription>Upload photos from the job site</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="photo-upload" className="mb-2 block">
                  Upload Photos
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="photo-upload"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => handlePhotoUpload(e.target.files)}
                    disabled={uploadingPhotos}
                    className="hidden"
                  />
                  <Button
                    onClick={() => document.getElementById("photo-upload")?.click()}
                    disabled={uploadingPhotos}
                    variant="outline"
                    className="w-full"
                  >
                    <Camera className="h-4 w-4 mr-2" />
                    {uploadingPhotos ? "Uploading..." : "Choose Photos"}
                  </Button>
                </div>
              </div>
              {photos.length > 0 && (
                <div className="grid grid-cols-2 gap-4 mt-4">
                  {photos.map((photo) => (
                    <div key={photo.id} className="relative aspect-square rounded-lg overflow-hidden">
                      <Image
                        src={photo.url}
                        alt={photo.caption || "Field photo"}
                        fill
                        className="object-cover"
                      />
                      {photo.caption && (
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-2 text-xs text-white">
                          {photo.caption}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notes Section */}
      {session && !session.check_out_at && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Notes</CardTitle>
            <CardDescription>Add notes about today's work</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="note-type" className="mb-2 block">
                  Note Type
                </Label>
                <Select value={noteType} onValueChange={setNoteType}>
                  <SelectTrigger id="note-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="progress">Progress</SelectItem>
                    <SelectItem value="issue">Issue</SelectItem>
                    <SelectItem value="material">Material</SelectItem>
                    <SelectItem value="safety">Safety</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="note-content" className="mb-2 block">
                  Note
                </Label>
                <Textarea
                  id="note-content"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Type your note or select a template..."
                  rows={3}
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  {NOTE_TEMPLATES.map((template) => (
                    <Button
                      key={template}
                      variant="outline"
                      size="sm"
                      onClick={() => setNewNote(template)}
                      className="text-xs"
                    >
                      {template}
                    </Button>
                  ))}
                </div>
              </div>
              <Button
                onClick={handleAddNote}
                disabled={!newNote.trim() || addingNote}
                className="w-full"
              >
                {addingNote ? "Adding..." : "Add Note"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Existing Notes Display */}
      {notes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {notes.map((note) => (
                <div key={note.id} className="border-b border-zinc-800 pb-3 last:border-0">
                  <div className="flex items-start justify-between mb-1">
                    <Badge variant="outline" className="text-xs">
                      {note.note_type}
                    </Badge>
                    <span className="text-xs text-zinc-500">
                      {new Date(note.created_at).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-300">{note.content}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}


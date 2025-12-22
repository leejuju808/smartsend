"use client";

// Block 22750 — SmartSend Roofing Field App v1
// Job Field Activity Panel — Office View of Field Activity
// Shows sessions, photos, and notes from field crews

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Calendar,
  Clock,
  Camera,
  FileText,
  CheckCircle2,
  Circle,
  Image as ImageIcon,
} from "lucide-react";
import Image from "next/image";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type FieldSession = {
  id: string;
  check_in_at: string;
  check_out_at: string | null;
  progress_percent: number | null;
  notes: string | null;
  crew: {
    id: string;
    name: string;
    color: string;
  } | null;
};

type FieldPhoto = {
  id: string;
  storage_path: string;
  tag: string;
  caption: string | null;
  url: string;
  created_at: string;
  crew: {
    id: string;
    name: string;
    color: string;
  } | null;
};

type FieldNote = {
  id: string;
  note_type: string;
  content: string;
  created_at: string;
  crew: {
    id: string;
    name: string;
    color: string;
  } | null;
};

type FieldActivityData = {
  sessions: FieldSession[];
  photos: FieldPhoto[];
  notes: FieldNote[];
};

export function JobFieldActivityPanel({ jobId }: { jobId: string }) {
  const { data, error, mutate } = useSWR<FieldActivityData>(
    `/api/field/job/${jobId}/activity`,
    fetcher
  );

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getTagColor = (tag: string) => {
    const colors: Record<string, string> = {
      before: "bg-blue-500/20 text-blue-400 border-blue-500/50",
      during: "bg-yellow-500/20 text-yellow-400 border-yellow-500/50",
      after: "bg-green-500/20 text-green-400 border-green-500/50",
      issue: "bg-red-500/20 text-red-400 border-red-500/50",
      material: "bg-purple-500/20 text-purple-400 border-purple-500/50",
      safety: "bg-orange-500/20 text-orange-400 border-orange-500/50",
    };
    return colors[tag] || "bg-zinc-500/20 text-zinc-400 border-zinc-500/50";
  };

  if (!data && !error) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <p className="text-xs text-zinc-400">Loading field activity…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <p className="text-xs text-red-400">
          Error: {error instanceof Error ? error.message : "Failed to load field activity"}
        </p>
      </div>
    );
  }

  const { sessions = [], photos = [], notes = [] } = data || {};

  // Group photos by tag
  const photosByTag: Record<string, FieldPhoto[]> = {};
  photos.forEach((photo) => {
    if (!photosByTag[photo.tag]) {
      photosByTag[photo.tag] = [];
    }
    photosByTag[photo.tag].push(photo);
  });

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
      <div className="mb-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1">
          Field Activity
        </h3>
        <p className="text-xs text-zinc-400">
          Crew check-ins, photos, and notes from the field
        </p>
      </div>

      {sessions.length === 0 && photos.length === 0 && notes.length === 0 ? (
        <div className="text-center py-8">
          <Circle className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
          <p className="text-xs text-zinc-400">No field activity yet</p>
        </div>
      ) : (
        <Tabs defaultValue="sessions" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="sessions" className="text-xs">
              Sessions ({sessions.length})
            </TabsTrigger>
            <TabsTrigger value="photos" className="text-xs">
              Photos ({photos.length})
            </TabsTrigger>
            <TabsTrigger value="notes" className="text-xs">
              Notes ({notes.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sessions" className="mt-4">
            <div className="space-y-3">
              {sessions.length === 0 ? (
                <p className="text-xs text-zinc-400 text-center py-4">
                  No check-ins yet
                </p>
              ) : (
                sessions.map((session) => (
                  <div
                    key={session.id}
                    className="border border-zinc-800 rounded-lg p-3 space-y-2"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        {session.check_out_at ? (
                          <CheckCircle2 className="h-4 w-4 text-green-400" />
                        ) : (
                          <Circle className="h-4 w-4 text-yellow-400" />
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-zinc-300">
                              {session.check_out_at ? "Checked Out" : "Checked In"}
                            </span>
                            {session.crew && (
                              <Badge
                                variant="outline"
                                style={{
                                  borderColor: session.crew.color || "#71717a",
                                  color: session.crew.color || "#71717a",
                                }}
                                className="text-xs"
                              >
                                {session.crew.name}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-zinc-400">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              <span>In: {formatTime(session.check_in_at)}</span>
                            </div>
                            {session.check_out_at && (
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                <span>Out: {formatTime(session.check_out_at)}</span>
                              </div>
                            )}
                            {session.progress_percent !== null && (
                              <span className="text-zinc-300">
                                {session.progress_percent}% complete
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    {session.notes && (
                      <p className="text-xs text-zinc-400 mt-2 pl-6">{session.notes}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="photos" className="mt-4">
            {photos.length === 0 ? (
              <p className="text-xs text-zinc-400 text-center py-4">No photos yet</p>
            ) : (
              <div className="space-y-4">
                {Object.entries(photosByTag).map(([tag, tagPhotos]) => (
                  <div key={tag}>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className={getTagColor(tag)}>
                        {tag.charAt(0).toUpperCase() + tag.slice(1)}
                      </Badge>
                      <span className="text-xs text-zinc-400">
                        {tagPhotos.length} photo{tagPhotos.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {tagPhotos.map((photo) => (
                        <div
                          key={photo.id}
                          className="relative aspect-square rounded-lg overflow-hidden border border-zinc-800"
                        >
                          <Image
                            src={photo.url}
                            alt={photo.caption || "Field photo"}
                            fill
                            className="object-cover"
                          />
                          {photo.caption && (
                            <div className="absolute bottom-0 left-0 right-0 bg-black/70 p-2">
                              <p className="text-xs text-white">{photo.caption}</p>
                            </div>
                          )}
                          <div className="absolute top-2 right-2">
                            <span className="text-xs text-white bg-black/50 px-2 py-1 rounded">
                              {formatDate(photo.created_at)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="notes" className="mt-4">
            <div className="space-y-3">
              {notes.length === 0 ? (
                <p className="text-xs text-zinc-400 text-center py-4">No notes yet</p>
              ) : (
                notes.map((note) => (
                  <div
                    key={note.id}
                    className="border border-zinc-800 rounded-lg p-3 space-y-2"
                  >
                    <div className="flex items-start justify-between">
                      <Badge variant="outline" className="text-xs">
                        {note.note_type}
                      </Badge>
                      <span className="text-xs text-zinc-500">
                        {formatDate(note.created_at)} {formatTime(note.created_at)}
                      </span>
                    </div>
                    {note.crew && (
                      <Badge
                        variant="outline"
                        style={{
                          borderColor: note.crew.color || "#71717a",
                          color: note.crew.color || "#71717a",
                        }}
                        className="text-xs"
                      >
                        {note.crew.name}
                      </Badge>
                    )}
                    <p className="text-xs text-zinc-300">{note.content}</p>
                  </div>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}








































// Block 16500 — Conversation Thread Component
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import { Mail, MailInbox, User, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ConversationThreadProps {
  threads: Array<{
    id: string;
    subject: string;
    updated_at: string;
    messages: Array<{
      id: string;
      body_text: string;
      body_html: string | null;
      from_email: string;
      to_email: string;
      sent_at: string;
      is_reply: boolean;
      sender: {
        id: string;
        email: string;
        full_name: string | null;
      } | null;
    }>;
  }>;
  contactEmail: string;
}

export function ConversationThread({ threads, contactEmail }: ConversationThreadProps) {
  if (!threads || threads.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            <span>Conversation</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <MailInbox className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No conversation history yet</p>
            <p className="text-sm mt-1">Emails and replies will appear here</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          <span>Full Inbox Thread</span>
          <Badge variant="outline" className="ml-auto">
            {threads.length} {threads.length === 1 ? "thread" : "threads"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {threads.map((thread) => (
          <div key={thread.id} className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b">
              <h3 className="font-semibold">{thread.subject || "No Subject"}</h3>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDistanceToNow(new Date(thread.updated_at), { addSuffix: true })}
              </div>
            </div>
            <div className="space-y-3">
              {thread.messages?.map((message) => {
                const isFromContact = message.from_email.toLowerCase() === contactEmail.toLowerCase();
                return (
                  <div
                    key={message.id}
                    className={`flex gap-3 ${isFromContact ? "flex-row-reverse" : ""}`}
                  >
                    <div className={`flex-1 ${isFromContact ? "text-right" : ""}`}>
                      <div
                        className={`inline-block p-3 rounded-lg ${
                          isFromContact
                            ? "bg-blue-100 text-blue-900"
                            : "bg-gray-100 text-gray-900"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          {isFromContact ? (
                            <MailInbox className="h-4 w-4" />
                          ) : (
                            <Mail className="h-4 w-4" />
                          )}
                          <span className="text-xs font-medium">
                            {message.sender?.full_name || message.from_email}
                          </span>
                          {message.is_reply && (
                            <Badge variant="outline" className="text-xs">
                              Reply
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm whitespace-pre-wrap">
                          {message.body_text || message.body_html?.replace(/<[^>]*>/g, "") || "No content"}
                        </div>
                        <div className="text-xs text-muted-foreground mt-2">
                          {new Date(message.sent_at).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}






















































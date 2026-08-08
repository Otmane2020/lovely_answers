"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCw, Mail, Inbox, Send, Search } from "lucide-react";

type SentEmail = {
  id: string;
  to: string[] | string;
  from: string;
  subject: string;
  created_at: string;
  last_event?: string;
};

type ReceivedEmail = {
  id: string;
  from_email: string;
  from_name: string | null;
  to_email: string;
  subject: string;
  body_text: string | null;
  received_at: string;
  is_read: boolean;
};

const statusColor: Record<string, string> = {
  delivered: "bg-emerald-500/15 text-emerald-700",
  sent: "bg-blue-500/15 text-blue-700",
  bounced: "bg-destructive/15 text-destructive",
  complained: "bg-amber-500/15 text-amber-700",
  opened: "bg-violet-500/15 text-violet-700",
  clicked: "bg-violet-500/15 text-violet-700",
};

export function AdminEmails() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<SentEmail[]>([]);
  const [received, setReceived] = useState<ReceivedEmail[]>([]);
  const [query, setQuery] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("admin-resend-emails");
      if (error) throw error;
      if (data?.error) setError(data.error);
      setSent(data?.sent ?? []);
      setReceived(data?.received ?? []);
    } catch (e: any) {
      setError(e?.message || "Failed to load emails");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filterSent = (e: SentEmail) => {
    if (!query) return true;
    const q = query.toLowerCase();
    const to = Array.isArray(e.to) ? e.to.join(",") : String(e.to ?? "");
    return (
      to.toLowerCase().includes(q) ||
      e.subject?.toLowerCase().includes(q) ||
      e.from?.toLowerCase().includes(q)
    );
  };
  const filterRecv = (e: ReceivedEmail) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      e.from_email?.toLowerCase().includes(q) ||
      e.subject?.toLowerCase().includes(q) ||
      (e.body_text ?? "").toLowerCase().includes(q)
    );
  };

  const sentFiltered = sent.filter(filterSent);
  const recvFiltered = received.filter(filterRecv);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Emails (Resend)</h2>
        </div>
        <div className="flex items-center gap-2 flex-1 max-w-md ml-auto">
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search subject, from, to..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {error && (
        <Card className="p-4 border-destructive/30 bg-destructive/5 text-sm text-destructive">
          {error}
        </Card>
      )}

      <Tabs defaultValue="sent" className="w-full">
        <TabsList>
          <TabsTrigger value="sent" className="gap-2">
            <Send className="h-4 w-4" /> Sent ({sentFiltered.length})
          </TabsTrigger>
          <TabsTrigger value="received" className="gap-2">
            <Inbox className="h-4 w-4" /> Received ({recvFiltered.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sent">
          <Card className="overflow-hidden">
            {loading ? (
              <div className="p-10 flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : sentFiltered.length === 0 ? (
              <div className="p-10 text-center text-muted-foreground text-sm">
                No sent emails found.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead className="text-right">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sentFiltered.map((e) => {
                    const status = (e.last_event ?? "sent").toLowerCase();
                    const to = Array.isArray(e.to) ? e.to.join(", ") : e.to;
                    return (
                      <TableRow key={e.id}>
                        <TableCell>
                          <Badge className={statusColor[status] ?? "bg-muted text-foreground"}>
                            {status}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{to}</TableCell>
                        <TableCell className="max-w-md truncate">{e.subject}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{e.from}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(e.created_at).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="received">
          <Card className="overflow-hidden">
            {loading ? (
              <div className="p-10 flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : recvFiltered.length === 0 ? (
              <div className="p-10 text-center text-muted-foreground text-sm">
                No received emails found. Configure Resend Inbound to capture replies.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>From</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Preview</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recvFiltered.map((e) => (
                    <TableRow key={e.id} className={e.is_read ? "" : "bg-primary/5"}>
                      <TableCell className="text-xs">
                        <div className="font-semibold">{e.from_name || e.from_email}</div>
                        <div className="font-mono text-muted-foreground">{e.from_email}</div>
                      </TableCell>
                      <TableCell className="max-w-xs truncate font-medium">{e.subject}</TableCell>
                      <TableCell className="max-w-md truncate text-xs text-muted-foreground">
                        {e.body_text}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(e.received_at).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

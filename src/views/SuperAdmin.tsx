"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  MessageCircle, Send, Users, CreditCard, UserX, Shield, 
  LogOut, Clock, CheckCircle, AlertCircle, Mail, BarChart3,
  Plus, Trash2, Globe, Building, Phone, RefreshCw, Rocket, Megaphone,
  Brain, Key, Target, TrendingUp, Lightbulb, Tag, Play
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { enUS } from "date-fns/locale";
import { VisitorAnalytics } from "@/components/admin/VisitorAnalytics";
import { OnboardingTracking } from "@/components/admin/OnboardingTracking";
import { AdminUsersList } from "@/components/admin/AdminUsersList";
import { ActiveArticleUsers } from "@/components/admin/ActiveArticleUsers";
import { GoogleAdsManager } from "@/components/admin/GoogleAdsManager";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { AdminEmails } from "@/components/admin/AdminEmails";
import { VideoAnalytics } from "@/components/admin/VideoAnalytics";

interface SupportTicket {
  id: string;
  user_id: string;
  user_email: string;
  subject: string;
  message: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface SupportMessage {
  id: string;
  ticket_id: string;
  sender_type: string;
  message: string;
  created_at: string;
}

interface UserProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  created_at: string | null;
}

interface SubscriptionInfo {
  user_id: string;
  email: string;
  subscribed: boolean;
  product_id: string | null;
  subscription_end: string | null;
}

interface AdminProspect {
  id: string;
  email: string;
  full_name: string | null;
  company: string | null;
  website: string | null;
  phone: string | null;
  source: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

const ADMIN_EMAIL = "oben.rockman@gmail.com";

const SuperAdmin = () => {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingAdminProspects, setIsLoadingAdminProspects] = useState(false);
  
  // Support state
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [replyMessage, setReplyMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  // Resend mailbox state
  const [resendSent, setResendSent] = useState<any[]>([]);
  const [resendInbox, setResendInbox] = useState<any[]>([]);
  const [isLoadingResend, setIsLoadingResend] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<any | null>(null);
  const [emailReply, setEmailReply] = useState("");
  const [isSendingEmailReply, setIsSendingEmailReply] = useState(false);
  const [emailViewMode, setEmailViewMode] = useState<"preview" | "html" | "text">("preview");
  const [composeRecipients, setComposeRecipients] = useState<string[]>([]);
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [isComposing, setIsComposing] = useState(false);
  const [composeAttachments, setComposeAttachments] = useState<File[]>([]);
  const [replyAttachments, setReplyAttachments] = useState<File[]>([]);
  const [allUsers, setAllUsers] = useState<{ id: string; email: string; full_name: string | null }[]>([]);
  const [userSearch, setUserSearch] = useState("");
  
  // Users state
  const [subscribers, setSubscribers] = useState<SubscriptionInfo[]>([]);
  const [prospects, setProspects] = useState<UserProfile[]>([]);
  const [adminProspects, setAdminProspects] = useState<AdminProspect[]>([]);
  
  // Add prospect form state
  const [isAddProspectOpen, setIsAddProspectOpen] = useState(false);
  const [newProspect, setNewProspect] = useState({
    email: "",
    full_name: "",
    company: "",
    website: "",
    phone: "",
    source: "",
    notes: "",
    status: "new"
  });

  // Force light theme
  useEffect(() => {
    document.documentElement.classList.remove("dark");
  }, []);

  useEffect(() => {
    checkAdminAuth();
  }, []);

  const checkAdminAuth = async () => {
    try {
      // Use getSession to ensure the session is fully ready for RLS
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        console.log("[SuperAdmin] No active session");
        setIsAuthenticated(false);
        return;
      }
      
      const user = session.user;
      console.log("[SuperAdmin] User authenticated:", user?.email);
      
      if (user?.email === ADMIN_EMAIL) {
        setIsAuthenticated(true);
        // Small delay to ensure token is propagated for RLS
        await new Promise(resolve => setTimeout(resolve, 250));
        loadAllData();
      } else {
        setIsAuthenticated(false);
      }
    } catch (error) {
      console.error("[SuperAdmin] Auth check error:", error);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  const loadAllData = async () => {
    await Promise.all([
      loadTickets(),
      loadSubscribers(),
      loadProspects(),
      loadAdminProspects(),
      loadResendInbox(),
      loadAllUsers(),
    ]);
  };

  const loadTickets = async () => {
    try {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTickets(data || []);
    } catch (error) {
      console.error("Error loading tickets:", error);
    }
  };

  const loadResendSent = async () => {
    setIsLoadingResend(true);
    try {
      const { data, error } = await supabase.functions.invoke("resend-mailbox", {
        body: { action: "list_sent" },
      });
      if (error) throw error;
      setResendSent(data?.data || []);
    } catch (e: any) {
      toast({ title: "Erreur Resend", description: e.message, variant: "destructive" });
    } finally {
      setIsLoadingResend(false);
    }
  };

  const loadResendInbox = async () => {
    try {
      // Inbox = ALL incoming emails captured by email-webhook into inbox_emails
      const { data, error } = await supabase
        .from("inbox_emails")
        .select("id, from_email, from_name, to_email, subject, body_text, body_html, is_read, received_at")
        .order("received_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      setResendInbox(data || []);
    } catch (e: any) {
      console.error("Inbox load error:", e);
    }
  };

  const loadAllUsers = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .not("email", "is", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setAllUsers((data || []) as any);
    } catch (e: any) {
      console.error("Users load error:", e);
    }
  };

  const handleSendCompose = async () => {
    if (!composeSubject.trim() || !composeBody.trim() || composeRecipients.length === 0) {
      toast({ title: "Champs manquants", description: "Destinataires, sujet et message requis", variant: "destructive" });
      return;
    }
    setIsComposing(true);
    try {
      const htmlBody = composeBody;
      // Encode attachments to base64
      const encodedAttachments = await Promise.all(
        composeAttachments.map(async (f) => {
          const buf = await f.arrayBuffer();
          let binary = "";
          const bytes = new Uint8Array(buf);
          for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
          return { filename: f.name, content: btoa(binary), content_type: f.type || "application/octet-stream" };
        })
      );
      const results = await Promise.allSettled(
        composeRecipients.map((to) =>
          supabase.functions.invoke("send-email", {
            body: { type: "custom", to, subject: composeSubject, html: htmlBody, attachments: encodedAttachments },
          })
        )
      );
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const fail = results.length - ok;
      toast({ title: "Envoi terminé", description: `${ok} envoyés, ${fail} échecs` });
      if (ok > 0) {
        setComposeSubject("");
        setComposeBody("");
        setComposeRecipients([]);
        setComposeAttachments([]);
        loadResendSent();
      }
    } catch (e: any) {
      toast({ title: "Erreur d'envoi", description: e.message, variant: "destructive" });
    } finally {
      setIsComposing(false);
    }
  };


  const loadMessages = async (ticketId: string) => {
    try {
      const { data, error } = await supabase
        .from("support_messages")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      
      // Get the ticket to include the initial message
      const ticket = tickets.find(t => t.id === ticketId);
      const messagesData = data || [];
      
      // Always include the initial ticket message as the first message in the history
      if (ticket?.message) {
        const initialMessage: SupportMessage = {
          id: 'initial-' + ticketId,
          ticket_id: ticketId,
          sender_type: 'user',
          message: ticket.message,
          created_at: ticket.created_at,
        };
        
        // Check if we already have this message (to avoid duplicates)
        const firstMessage = messagesData[0];
        const isDuplicate = firstMessage && 
          firstMessage.message === ticket.message && 
          firstMessage.sender_type === 'user';
        
        if (isDuplicate) {
          setMessages(messagesData);
        } else {
          setMessages([initialMessage, ...messagesData]);
        }
      } else {
        setMessages(messagesData);
      }
    } catch (error) {
      console.error("Error loading messages:", error);
    }
  };

  const loadSubscribers = async () => {
    try {
      // Get all profiles and check their subscription via credits table
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, email, full_name, created_at");

      if (error) throw error;

      // Get credits info
      const { data: credits } = await supabase
        .from("credits")
        .select("user_id, credits_total");

      const creditsMap = new Map(credits?.map(c => [c.user_id, c.credits_total]) || []);
      
      // Filter subscribed users (those with credits > 0)
      const subscribedUsers: SubscriptionInfo[] = (profiles || [])
        .filter(p => (creditsMap.get(p.id) || 0) > 0)
        .map(p => ({
          user_id: p.id,
          email: p.email || "",
          subscribed: true,
          product_id: null,
          subscription_end: null,
        }));

      setSubscribers(subscribedUsers);
    } catch (error) {
      console.error("Error loading subscribers:", error);
    }
  };

  const loadProspects = async () => {
    try {
      // Get all profiles
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, email, full_name, created_at");

      if (error) throw error;

      // Get credits info
      const { data: credits } = await supabase
        .from("credits")
        .select("user_id, credits_total");

      const creditsMap = new Map(credits?.map(c => [c.user_id, c.credits_total]) || []);
      
      // Filter prospects (those without credits or credits = 0)
      const prospectUsers = (profiles || []).filter(p => !creditsMap.has(p.id) || creditsMap.get(p.id) === 0);

      setProspects(prospectUsers);
    } catch (error) {
      console.error("Error loading prospects:", error);
    }
  };

  const loadAdminProspects = async () => {
    const maxAttempts = 3;
    const baseDelayMs = 250;

    setIsLoadingAdminProspects(true);
    try {
      console.log("[SuperAdmin] Loading admin prospects...");

      // Verify session is active before querying
      const { data: { session } } = await supabase.auth.getSession();
      console.log("[SuperAdmin] Current session:", {
        hasSession: !!session,
        userEmail: session?.user?.email,
      });

      if (!session) {
        console.warn("[SuperAdmin] No session available while loading prospects; skipping");
        setAdminProspects([]);
        return;
      }

      let lastData: AdminProspect[] = [];
      let lastError: unknown = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const { data, error } = await supabase
          .from("admin_prospects")
          .select("*")
          .order("created_at", { ascending: false });

        console.log("[SuperAdmin] Admin prospects response:", {
          attempt,
          data,
          error,
          count: data?.length,
          firstItem: data?.[0],
        });

        if (error) {
          lastError = error;
          // No point retrying if we already have an explicit error
          break;
        }

        lastData = (data || []) as AdminProspect[];

        // Heuristic: if we get empty result immediately after login, it can be an auth/RLS propagation race.
        if (lastData.length > 0) break;
        if (attempt < maxAttempts) {
          const delay = baseDelayMs * attempt;
          console.warn(`[SuperAdmin] Prospects empty (attempt ${attempt}/${maxAttempts}). Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }

      if (lastError) {
        console.error("[SuperAdmin] Query error:", lastError);
        toast({
          title: "Erreur",
          description: "Impossible de charger les prospects (droits d'accès).",
          variant: "destructive",
        });
        setAdminProspects([]);
        return;
      }

      setAdminProspects(lastData);
    } catch (error) {
      console.error("[SuperAdmin] Error loading admin prospects:", error);
      toast({
        title: "Erreur",
        description: "Erreur inattendue lors du chargement des prospects.",
        variant: "destructive",
      });
      setAdminProspects([]);
    } finally {
      setIsLoadingAdminProspects(false);
    }
  };

  const handleAddProspect = async () => {
    if (!newProspect.email.trim()) {
      toast({
        title: "Erreur",
        description: "L'email est obligatoire",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from("admin_prospects")
        .insert({
          email: newProspect.email.trim(),
          full_name: newProspect.full_name.trim() || null,
          company: newProspect.company.trim() || null,
          website: newProspect.website.trim() || null,
          phone: newProspect.phone.trim() || null,
          source: newProspect.source.trim() || null,
          notes: newProspect.notes.trim() || null,
          status: newProspect.status,
        });

      if (error) {
        if (error.code === '23505') {
          toast({
            title: "Erreur",
            description: "Ce prospect existe déjà",
            variant: "destructive",
          });
        } else {
          throw error;
        }
        return;
      }

      toast({
        title: "Prospect ajouté",
        description: `${newProspect.email} a été ajouté à la liste`,
      });

      setNewProspect({
        email: "",
        full_name: "",
        company: "",
        website: "",
        phone: "",
        source: "",
        notes: "",
        status: "new"
      });
      setIsAddProspectOpen(false);
      loadAdminProspects();
    } catch (error) {
      console.error("Error adding prospect:", error);
      toast({
        title: "Erreur",
        description: "Impossible d'ajouter le prospect",
        variant: "destructive",
      });
    }
  };

  const handleDeleteProspect = async (id: string) => {
    try {
      const { error } = await supabase
        .from("admin_prospects")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Prospect supprimé",
      });
      loadAdminProspects();
    } catch (error) {
      console.error("Error deleting prospect:", error);
    }
  };

  const handleSelectTicket = (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    loadMessages(ticket.id);
  };

  const handleSendReply = async () => {
    if (!selectedTicket || !replyMessage.trim()) return;

    setIsSending(true);
    try {
      const { error } = await supabase.from("support_messages").insert({
        ticket_id: selectedTicket.id,
        sender_type: "admin",
        message: replyMessage,
      });

      if (error) throw error;

      // Update ticket status to in_progress if it was open
      if (selectedTicket.status === "open") {
        await supabase
          .from("support_tickets")
          .update({ status: "in_progress" })
          .eq("id", selectedTicket.id);
      }

      toast({
        title: "Reply sent",
        description: "Your reply has been sent to the user.",
      });

      setReplyMessage("");
      loadMessages(selectedTicket.id);
      loadTickets();
    } catch (error) {
      console.error("Error sending reply:", error);
      toast({
        title: "Error",
        description: "Unable to send the reply.",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleUpdateTicketStatus = async (ticketId: string, status: string) => {
    try {
      const { error } = await supabase
        .from("support_tickets")
        .update({ status })
        .eq("id", ticketId);

      if (error) throw error;

      toast({
        title: "Status updated",
      });
      loadTickets();
      if (selectedTicket?.id === ticketId) {
        setSelectedTicket({ ...selectedTicket, status });
      }
    } catch (error) {
      console.error("Error updating status:", error);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/auth");
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "open":
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20"><AlertCircle className="h-3 w-3 mr-1" />Open</Badge>;
      case "in_progress":
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20"><Clock className="h-3 w-3 mr-1" />In Progress</Badge>;
      case "resolved":
        return <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20"><CheckCircle className="h-3 w-3 mr-1" />Resolved</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Super Admin Access
            </CardTitle>
            <CardDescription>
              You must be logged in with the administrator account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Log in with the administrator account to access this page.
            </p>
            <Button onClick={() => router.push("/auth")} className="w-full">
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">Super Admin</h1>
          </div>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>

      {/* Main layout with sidebar */}
      <Tabs defaultValue="onboarding" className="flex min-h-[calc(100vh-65px)]">
        {/* Sidebar */}
        <aside className="w-60 shrink-0 border-r bg-card flex flex-col">
          {/* Stats summary */}
          <div className="p-4 space-y-3 border-b">
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 rounded-lg bg-yellow-500/10 text-center">
                <p className="text-lg font-bold text-yellow-600">{tickets.filter(t => t.status === "open").length}</p>
                <p className="text-[10px] text-muted-foreground">Open</p>
              </div>
              <div className="p-2 rounded-lg bg-blue-500/10 text-center">
                <p className="text-lg font-bold text-blue-600">{tickets.filter(t => t.status === "in_progress").length}</p>
                <p className="text-[10px] text-muted-foreground">In Progress</p>
              </div>
              <div className="p-2 rounded-lg bg-green-500/10 text-center">
                <p className="text-lg font-bold text-green-600">{subscribers.length}</p>
                <p className="text-[10px] text-muted-foreground">Subscribers</p>
              </div>
              <div className="p-2 rounded-lg bg-orange-500/10 text-center">
                <p className="text-lg font-bold text-orange-600">{prospects.length}</p>
                <p className="text-[10px] text-muted-foreground">Prospects</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <TabsList className="flex flex-col items-stretch h-auto bg-transparent p-2 gap-1">
            <TabsTrigger value="onboarding" className="justify-start gap-2 px-3 py-2.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-lg">
              <Rocket className="h-4 w-4" />
              Onboarding
            </TabsTrigger>
            <TabsTrigger value="users" className="justify-start gap-2 px-3 py-2.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-lg">
              <Users className="h-4 w-4" />
              Users
            </TabsTrigger>
            <TabsTrigger value="analytics" className="justify-start gap-2 px-3 py-2.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-lg">
              <BarChart3 className="h-4 w-4" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="support" className="justify-start gap-2 px-3 py-2.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-lg">
              <MessageCircle className="h-4 w-4" />
              Support
              {tickets.filter(t => t.status === "open").length > 0 && (
                <Badge variant="destructive" className="ml-auto text-[10px] h-5 min-w-5 px-1.5">
                  {tickets.filter(t => t.status === "open").length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="subscribers" className="justify-start gap-2 px-3 py-2.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-lg">
              <CreditCard className="h-4 w-4" />
              Subscribers
            </TabsTrigger>
            <TabsTrigger value="prospects" className="justify-start gap-2 px-3 py-2.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-lg">
              <UserX className="h-4 w-4" />
              Prospects
            </TabsTrigger>
            <TabsTrigger value="active-articles" className="justify-start gap-2 px-3 py-2.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-lg">
              <Globe className="h-4 w-4" />
              Articles Actifs
            </TabsTrigger>
            <TabsTrigger value="emails" className="justify-start gap-2 px-3 py-2.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-lg">
              <Mail className="h-4 w-4" />
              Emails
            </TabsTrigger>
            <TabsTrigger value="videos" className="justify-start gap-2 px-3 py-2.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-lg">
              <Play className="h-4 w-4" />
              Vidéos accueil
            </TabsTrigger>
            <Separator className="my-2" />
            <Button
              variant="ghost"
              className="justify-start gap-2 px-3 py-2.5 w-full font-normal rounded-lg hover:bg-primary/10 hover:text-primary"
              onClick={() => router.push("/superadmin/ads")}
            >
              <Megaphone className="h-4 w-4" />
              Ads Agency Dashboard
            </Button>
          </TabsList>
        </aside>

        {/* Content area */}
        <div className="flex-1 overflow-auto p-6">

          {/* Onboarding Tracking Tab */}
          <TabsContent value="onboarding">
            <OnboardingTracking />
          </TabsContent>

          {/* Active Articles Tab */}
          <TabsContent value="active-articles">
            <ActiveArticleUsers />
          </TabsContent>

          <TabsContent value="emails">
            <AdminEmails />
          </TabsContent>

          <TabsContent value="videos">
            <VideoAnalytics />
          </TabsContent>




          {/* Users Tab */}
          <TabsContent value="users">
            <AdminUsersList />
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics">
            <VisitorAnalytics />
          </TabsContent>

          {/* Support Tab */}
          <TabsContent value="support">
            <Tabs defaultValue="tickets" className="w-full" onValueChange={(v) => {
              if (v === "sent") loadResendSent();
              if (v === "inbox") loadResendInbox();
              if (v === "compose") loadAllUsers();
            }}>
              <TabsList className="mb-4">
                <TabsTrigger value="tickets"><MessageCircle className="h-4 w-4 mr-2" />Tickets</TabsTrigger>
                <TabsTrigger value="inbox"><Mail className="h-4 w-4 mr-2" />Boîte de réception</TabsTrigger>
                <TabsTrigger value="sent"><Send className="h-4 w-4 mr-2" />Boîte d'envoi</TabsTrigger>
                <TabsTrigger value="compose"><Plus className="h-4 w-4 mr-2" />Composer</TabsTrigger>
              </TabsList>

              <TabsContent value="tickets">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Tickets list */}
              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle>Tous les tickets</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-2">
                      {tickets.map((ticket) => (
                        <div
                          key={ticket.id}
                          className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                            selectedTicket?.id === ticket.id
                              ? "bg-primary/10 border-primary"
                              : "hover:bg-muted/50"
                          }`}
                          onClick={() => handleSelectTicket(ticket)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm line-clamp-1">{ticket.subject}</p>
                              <p className="text-xs text-muted-foreground">{ticket.user_email}</p>
                            </div>
                            {getStatusBadge(ticket.status)}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {format(new Date(ticket.created_at), "d MMM yyyy HH:mm", { locale: enUS })}
                          </p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Conversation */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>
                        {selectedTicket ? selectedTicket.subject : "Sélectionnez un ticket"}
                      </CardTitle>
                      {selectedTicket && (
                        <p className="text-sm text-muted-foreground">{selectedTicket.user_email}</p>
                      )}
                    </div>
                    {selectedTicket && (
                      <Select
                        value={selectedTicket.status}
                        onValueChange={(value) => handleUpdateTicketStatus(selectedTicket.id, value)}
                      >
                        <SelectTrigger className="w-[150px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">Ouvert</SelectItem>
                          <SelectItem value="in_progress">En cours</SelectItem>
                          <SelectItem value="resolved">Résolu</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {selectedTicket ? (
                    <div className="space-y-4">
                      <ScrollArea className="h-[350px] pr-4">
                        <div className="space-y-4">
                          {messages.map((msg) => (
                            <div
                              key={msg.id}
                              className={`flex ${msg.sender_type === "admin" ? "justify-end" : "justify-start"}`}
                            >
                              <div
                                className={`max-w-[80%] p-3 rounded-lg ${
                                  msg.sender_type === "admin"
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted"
                                }`}
                              >
                                <p className="text-xs font-medium mb-1">
                                  {msg.sender_type === "admin" ? "Admin" : "Utilisateur"}
                                </p>
                                <p className="text-sm">{msg.message}</p>
                                <p className={`text-xs mt-1 ${msg.sender_type === "admin" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                                  {format(new Date(msg.created_at), "d MMM yyyy HH:mm", { locale: enUS })}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                      <Separator />
                      <div className="flex gap-2">
                        <Textarea
                          placeholder="Votre réponse..."
                          value={replyMessage}
                          onChange={(e) => setReplyMessage(e.target.value)}
                          rows={2}
                          className="flex-1"
                        />
                        <Button onClick={handleSendReply} disabled={isSending || !replyMessage.trim()}>
                          <Send className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-20">
                      Sélectionnez un ticket pour voir la conversation
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
              </TabsContent>

              {/* Inbox Resend */}
              <TabsContent value="inbox">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" />Boîte de réception ({resendInbox.length})</CardTitle>
                      <Button variant="outline" size="sm" onClick={loadResendInbox}><RefreshCw className="h-4 w-4 mr-2" />Actualiser</Button>
                    </div>
                    <CardDescription>Réponses entrantes capturées via le webhook email</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[600px]">
                      <div className="space-y-3">
                        {resendInbox.length === 0 ? (
                          <p className="text-muted-foreground text-center py-10">Aucun message reçu</p>
                        ) : resendInbox.map((m: any) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={async () => {
                              setSelectedEmail(m);
                              setEmailReply("");
                              if (!m.is_read) {
                                await supabase.from("inbox_emails").update({ is_read: true }).eq("id", m.id);
                                setResendInbox((prev) => prev.map((x) => x.id === m.id ? { ...x, is_read: true } : x));
                              }
                            }}
                            className={`w-full text-left p-4 rounded-lg border hover:bg-muted/50 transition ${!m.is_read ? "bg-primary/5 border-primary/30 font-medium" : ""}`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <p className="font-medium text-sm">{m.from_name ? `${m.from_name} <${m.from_email}>` : m.from_email}</p>
                                <p className="text-xs text-muted-foreground">{m.subject || "(sans sujet)"}</p>
                              </div>
                              <p className="text-xs text-muted-foreground">{format(new Date(m.received_at), "d MMM yyyy HH:mm", { locale: enUS })}</p>
                            </div>
                            <p className="text-sm whitespace-pre-wrap line-clamp-2 text-muted-foreground">{m.body_text || m.body_html?.replace(/<[^>]+>/g, "") || ""}</p>
                          </button>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Sent Resend */}
              <TabsContent value="sent">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2"><Send className="h-5 w-5" />Boîte d'envoi Resend</CardTitle>
                      <Button variant="outline" size="sm" onClick={loadResendSent} disabled={isLoadingResend}>
                        <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingResend ? "animate-spin" : ""}`} />Actualiser
                      </Button>
                    </div>
                    <CardDescription>Emails envoyés via Resend</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[600px]">
                      {resendSent.length === 0 ? (
                        <p className="text-muted-foreground text-center py-10">
                          {isLoadingResend ? "Chargement..." : "Cliquez sur Actualiser pour charger les emails envoyés"}
                        </p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Destinataire</TableHead>
                              <TableHead>Sujet</TableHead>
                              <TableHead>Statut</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {resendSent.map((email: any) => (
                              <TableRow key={email.id}>
                                <TableCell className="text-xs">{email.created_at ? format(new Date(email.created_at), "d MMM HH:mm", { locale: enUS }) : "—"}</TableCell>
                                <TableCell className="text-sm">{Array.isArray(email.to) ? email.to.join(", ") : email.to}</TableCell>
                                <TableCell className="text-sm">{email.subject}</TableCell>
                                <TableCell><Badge variant="outline">{email.last_event || "sent"}</Badge></TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Compose */}
              <TabsContent value="compose">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5" />Composer un email</CardTitle>
                    <CardDescription>Sélectionnez un ou plusieurs utilisateurs comme destinataires</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label className="mb-2 block">Destinataires ({composeRecipients.length} sélectionnés)</Label>
                      <Input
                        placeholder="Rechercher un utilisateur..."
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        className="mb-2"
                      />
                      <div className="flex gap-2 mb-2">
                        <Button size="sm" variant="outline" onClick={() => {
                          const filtered = allUsers.filter(u => {
                            const q = userSearch.toLowerCase();
                            return !q || (u.email?.toLowerCase().includes(q) || u.full_name?.toLowerCase().includes(q));
                          });
                          setComposeRecipients(filtered.map(u => u.email).filter(Boolean) as string[]);
                        }}>Tout sélectionner (filtré)</Button>
                        <Button size="sm" variant="ghost" onClick={() => setComposeRecipients([])}>Tout désélectionner</Button>
                      </div>
                      <ScrollArea className="h-[250px] border rounded-lg p-2">
                        <div className="space-y-1">
                          {allUsers
                            .filter(u => {
                              const q = userSearch.toLowerCase();
                              return !q || (u.email?.toLowerCase().includes(q) || u.full_name?.toLowerCase().includes(q));
                            })
                            .map((u) => {
                              const checked = composeRecipients.includes(u.email);
                              return (
                                <label key={u.id} className="flex items-center gap-2 p-2 rounded hover:bg-muted/50 cursor-pointer text-sm">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) => {
                                      if (e.target.checked) setComposeRecipients([...composeRecipients, u.email]);
                                      else setComposeRecipients(composeRecipients.filter(r => r !== u.email));
                                    }}
                                  />
                                  <span className="font-medium">{u.full_name || "—"}</span>
                                  <span className="text-muted-foreground">{u.email}</span>
                                </label>
                              );
                            })}
                        </div>
                      </ScrollArea>
                    </div>
                    <div>
                      <Label className="mb-2 block">Sujet</Label>
                      <Input value={composeSubject} onChange={(e) => setComposeSubject(e.target.value)} placeholder="Sujet de l'email" />
                    </div>
                    <div>
                      <Label className="mb-2 block">Message</Label>
                      <RichTextEditor
                        value={composeBody}
                        onChange={setComposeBody}
                        placeholder="Votre message..."
                        minHeight={240}
                        attachments={composeAttachments}
                        onAttachmentsChange={setComposeAttachments}
                      />
                    </div>
                    <Button onClick={handleSendCompose} disabled={isComposing || composeRecipients.length === 0}>
                      <Send className="h-4 w-4 mr-2" />
                      {isComposing ? "Envoi..." : `Envoyer à ${composeRecipients.length} destinataire(s)`}
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </TabsContent>

          {/* Subscribers Tab */}
          <TabsContent value="subscribers">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Abonnés ({subscribers.length})
                </CardTitle>
                <CardDescription>Liste des utilisateurs avec un abonnement actif</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subscribers.map((sub) => (
                      <TableRow key={sub.user_id}>
                        <TableCell>{sub.email}</TableCell>
                        <TableCell>
                          <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Actif
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm">
                            <Mail className="h-4 w-4 mr-2" />
                            Contacter
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {subscribers.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground">
                          Aucun abonné pour le moment
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Prospects Tab */}
          <TabsContent value="prospects" className="space-y-6">
            {/* Manual Prospects Section */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Plus className="h-5 w-5" />
                      Prospects Manuels ({adminProspects.length})
                    </CardTitle>
                    <CardDescription>Prospects ajoutés manuellement par l'admin</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => loadAdminProspects()}
                       disabled={isLoadingAdminProspects}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                       {isLoadingAdminProspects ? "Chargement..." : "Rafraîchir"}
                    </Button>
                    <Dialog open={isAddProspectOpen} onOpenChange={setIsAddProspectOpen}>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="h-4 w-4 mr-2" />
                        Ajouter un prospect
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>Ajouter un prospect</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="email">Email *</Label>
                          <Input
                            id="email"
                            type="email"
                            placeholder="email@example.com"
                            value={newProspect.email}
                            onChange={(e) => setNewProspect({ ...newProspect, email: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="full_name">Nom complet</Label>
                          <Input
                            id="full_name"
                            placeholder="John Doe"
                            value={newProspect.full_name}
                            onChange={(e) => setNewProspect({ ...newProspect, full_name: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="company">Entreprise</Label>
                          <div className="flex items-center gap-2">
                            <Building className="h-4 w-4 text-muted-foreground" />
                            <Input
                              id="company"
                              placeholder="Nom de l'entreprise"
                              value={newProspect.company}
                              onChange={(e) => setNewProspect({ ...newProspect, company: e.target.value })}
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="website">Site web</Label>
                          <div className="flex items-center gap-2">
                            <Globe className="h-4 w-4 text-muted-foreground" />
                            <Input
                              id="website"
                              placeholder="https://example.com"
                              value={newProspect.website}
                              onChange={(e) => setNewProspect({ ...newProspect, website: e.target.value })}
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="phone">Téléphone</Label>
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            <Input
                              id="phone"
                              placeholder="+33 1 23 45 67 89"
                              value={newProspect.phone}
                              onChange={(e) => setNewProspect({ ...newProspect, phone: e.target.value })}
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="source">Source</Label>
                          <Select
                            value={newProspect.source}
                            onValueChange={(value) => setNewProspect({ ...newProspect, source: value })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="D'où vient ce prospect?" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="linkedin">LinkedIn</SelectItem>
                              <SelectItem value="email">Email</SelectItem>
                              <SelectItem value="referral">Recommandation</SelectItem>
                              <SelectItem value="cold_outreach">Cold Outreach</SelectItem>
                              <SelectItem value="event">Événement</SelectItem>
                              <SelectItem value="other">Autre</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="status">Statut</Label>
                          <Select
                            value={newProspect.status}
                            onValueChange={(value) => setNewProspect({ ...newProspect, status: value })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="new">Nouveau</SelectItem>
                              <SelectItem value="contacted">Contacté</SelectItem>
                              <SelectItem value="interested">Intéressé</SelectItem>
                              <SelectItem value="demo_scheduled">Demo planifiée</SelectItem>
                              <SelectItem value="negotiation">Négociation</SelectItem>
                              <SelectItem value="lost">Perdu</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="notes">Notes</Label>
                          <Textarea
                            id="notes"
                            placeholder="Notes sur ce prospect..."
                            value={newProspect.notes}
                            onChange={(e) => setNewProspect({ ...newProspect, notes: e.target.value })}
                            rows={3}
                          />
                        </div>
                        <Button onClick={handleAddProspect} className="w-full">
                          Ajouter le prospect
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Nom</TableHead>
                      <TableHead>Entreprise</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {adminProspects.map((prospect) => (
                      <TableRow key={prospect.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{prospect.email}</p>
                            {prospect.website && (
                              <a href={prospect.website} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline flex items-center gap-1">
                                <Globe className="h-3 w-3" />
                                {prospect.website.replace(/^https?:\/\//, '').slice(0, 30)}
                              </a>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{prospect.full_name || "-"}</TableCell>
                        <TableCell>{prospect.company || "-"}</TableCell>
                        <TableCell>
                          {prospect.source ? (
                            <Badge variant="outline" className="capitalize">
                              {prospect.source.replace("_", " ")}
                            </Badge>
                          ) : "-"}
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant="outline"
                            className={
                              prospect.status === "interested" ? "bg-green-500/10 text-green-500 border-green-500/20" :
                              prospect.status === "contacted" ? "bg-blue-500/10 text-blue-500 border-blue-500/20" :
                              prospect.status === "demo_scheduled" ? "bg-purple-500/10 text-purple-500 border-purple-500/20" :
                              prospect.status === "negotiation" ? "bg-orange-500/10 text-orange-500 border-orange-500/20" :
                              prospect.status === "lost" ? "bg-red-500/10 text-red-500 border-red-500/20" :
                              ""
                            }
                          >
                            {prospect.status === "new" ? "Nouveau" :
                             prospect.status === "contacted" ? "Contacté" :
                             prospect.status === "interested" ? "Intéressé" :
                             prospect.status === "demo_scheduled" ? "Demo" :
                             prospect.status === "negotiation" ? "Négo" :
                             prospect.status === "lost" ? "Perdu" :
                             prospect.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(prospect.created_at), "d MMM yyyy", { locale: enUS })}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" asChild>
                              <a href={`mailto:${prospect.email}`}>
                                <Mail className="h-4 w-4" />
                              </a>
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleDeleteProspect(prospect.id)}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {adminProspects.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">
                          Aucun prospect manuel ajouté. Cliquez sur "Ajouter un prospect" pour commencer.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Auto-detected Prospects Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserX className="h-5 w-5" />
                  Prospects Inscrits ({prospects.length})
                </CardTitle>
                <CardDescription>Utilisateurs inscrits mais n'ayant pas souscrit d'abonnement</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Nom</TableHead>
                      <TableHead>Inscription</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {prospects.map((prospect) => (
                      <TableRow key={prospect.id}>
                        <TableCell>{prospect.email}</TableCell>
                        <TableCell>{prospect.full_name || "-"}</TableCell>
                        <TableCell>
                          {prospect.created_at 
                            ? format(new Date(prospect.created_at), "d MMM yyyy", { locale: enUS })
                            : "-"
                          }
                        </TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm" asChild>
                            <a href={`mailto:${prospect.email}`}>
                              <Mail className="h-4 w-4 mr-2" />
                              Follow Up
                            </a>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {prospects.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                          No prospects at the moment
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>

      {/* Email read & reply dialog */}
      <Dialog open={!!selectedEmail} onOpenChange={(open) => { if (!open) { setSelectedEmail(null); setEmailReply(""); setReplyAttachments([]); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base">{selectedEmail?.subject || "(sans sujet)"}</DialogTitle>
            <DialogDescription className="text-xs">
              De: {selectedEmail?.from_name ? `${selectedEmail.from_name} <${selectedEmail.from_email}>` : selectedEmail?.from_email}
              {" · "}
              {selectedEmail?.received_at && format(new Date(selectedEmail.received_at), "d MMM yyyy HH:mm", { locale: enUS })}
            </DialogDescription>
          </DialogHeader>
          <Tabs value={emailViewMode} onValueChange={(v) => setEmailViewMode(v as any)} className="flex-1 flex flex-col min-h-0">
            <TabsList className="w-fit">
              <TabsTrigger value="preview">Aperçu</TabsTrigger>
              <TabsTrigger value="html" disabled={!selectedEmail?.body_html}>Code HTML</TabsTrigger>
              <TabsTrigger value="text" disabled={!selectedEmail?.body_text}>Texte brut</TabsTrigger>
            </TabsList>
            <TabsContent value="preview" className="flex-1 mt-2">
              <ScrollArea className="h-[40vh] border rounded-md p-4 bg-white">
                {selectedEmail?.body_html ? (
                  <iframe
                    title="Email preview"
                    sandbox=""
                    className="w-full h-full min-h-[35vh] border-0 bg-white"
                    srcDoc={selectedEmail.body_html}
                  />
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{selectedEmail?.body_text || "(vide)"}</p>
                )}
              </ScrollArea>
            </TabsContent>
            <TabsContent value="html" className="flex-1 mt-2">
              <div className="relative h-[40vh]">
                <Button
                  variant="outline"
                  size="sm"
                  className="absolute top-2 right-2 z-10"
                  onClick={() => {
                    navigator.clipboard.writeText(selectedEmail?.body_html || "");
                    toast({ title: "HTML copié" });
                  }}
                >
                  Copier
                </Button>
                <ScrollArea className="h-full border rounded-md bg-muted/30">
                  <pre className="text-xs p-4 whitespace-pre-wrap break-all font-mono">{selectedEmail?.body_html || ""}</pre>
                </ScrollArea>
              </div>
            </TabsContent>
            <TabsContent value="text" className="flex-1 mt-2">
              <ScrollArea className="h-[40vh] border rounded-md p-4 bg-muted/20">
                <pre className="text-sm whitespace-pre-wrap font-sans">{selectedEmail?.body_text || ""}</pre>
              </ScrollArea>
            </TabsContent>
          </Tabs>
          <div className="space-y-2 pt-2">
            <Label className="text-sm">Répondre à {selectedEmail?.from_email}</Label>
            <RichTextEditor
              value={emailReply}
              onChange={setEmailReply}
              placeholder="Tapez votre réponse..."
              minHeight={180}
              attachments={replyAttachments}
              onAttachmentsChange={setReplyAttachments}
            />
            <div className="flex justify-between items-center">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (!selectedEmail) return;
                  await supabase.from("inbox_emails").delete().eq("id", selectedEmail.id);
                  setResendInbox((prev) => prev.filter((x) => x.id !== selectedEmail.id));
                  setSelectedEmail(null);
                  toast({ title: "Supprimé" });
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" />Supprimer
              </Button>
              <Button
                disabled={!emailReply.replace(/<[^>]+>/g, "").trim() || isSendingEmailReply}
                onClick={async () => {
                  if (!selectedEmail || !emailReply.replace(/<[^>]+>/g, "").trim()) return;
                  setIsSendingEmailReply(true);
                  try {
                    const subject = selectedEmail.subject?.startsWith("Re:") ? selectedEmail.subject : `Re: ${selectedEmail.subject || "Votre message"}`;
                    const html = `<div style="font-family:-apple-system,sans-serif;line-height:1.6;color:#333;max-width:600px;">
                      <div>${emailReply}</div>
                      <hr style="margin:24px 0;border:none;border-top:1px solid #eee;">
                      <div style="font-size:12px;color:#888;">
                        <p>Le ${format(new Date(selectedEmail.received_at), "d MMM yyyy HH:mm", { locale: enUS })}, ${selectedEmail.from_email} a écrit :</p>
                        <blockquote style="border-left:3px solid #ddd;padding-left:12px;color:#666;">
                          ${(selectedEmail.body_text || selectedEmail.body_html?.replace(/<[^>]+>/g, "") || "").slice(0, 1000).replace(/</g, "&lt;").replace(/\n/g, "<br>")}
                        </blockquote>
                      </div>
                    </div>`;
                    const encodedAttachments = await Promise.all(
                      replyAttachments.map(async (f) => {
                        const buf = await f.arrayBuffer();
                        let binary = "";
                        const bytes = new Uint8Array(buf);
                        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
                        return { filename: f.name, content: btoa(binary), content_type: f.type || "application/octet-stream" };
                      })
                    );
                    const { error } = await supabase.functions.invoke("send-email", {
                      body: { type: "custom", to: selectedEmail.from_email, subject, html, message: emailReply, attachments: encodedAttachments },
                    });
                    if (error) throw error;
                    toast({ title: "Réponse envoyée ✅" });
                    setEmailReply("");
                    setReplyAttachments([]);
                    setSelectedEmail(null);
                  } catch (e: any) {
                    toast({ title: "Erreur d'envoi", description: e.message, variant: "destructive" });
                  } finally {
                    setIsSendingEmailReply(false);
                  }
                }}
              >
                <Send className="h-4 w-4 mr-2" />{isSendingEmailReply ? "Envoi..." : "Envoyer"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SuperAdmin;

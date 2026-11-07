"use client";
import { useState, useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { 
  AlertCircle, AlertTriangle, CheckCircle2, TrendingUp, 
  ArrowRight, Lightbulb, Target, Loader2, Pause, Play, 
  MinusCircle, PlusCircle, Zap, Send, MessageCircle, Bot, User
} from "lucide-react";

interface AdsAnalysisReportProps {
  text: string;
  isStreaming: boolean;
  onActionExecuted?: () => void;
}

interface ReportSection {
  title: string;
  severity: "critical" | "important" | "improvement" | "info";
  content: string;
  actions: ParsedAction[];
}

interface ParsedAction {
  text: string;
  type: "pause_ad_group" | "enable_ad_group" | "add_negative_keyword" | "create_ad_group" | "add_headlines" | "add_descriptions" | "pause_keyword" | "generic";
  targetName?: string;
}

function parseSeverity(title: string): "critical" | "important" | "improvement" | "info" {
  const lower = title.toLowerCase();
  if (lower.includes("🔴") || lower.includes("critique") || lower.includes("critical") || lower.includes("exclure") || lower.includes("pause")) return "critical";
  if (lower.includes("🟡") || lower.includes("important") || lower.includes("optimiser") || lower.includes("améliorer")) return "important";
  if (lower.includes("🟢") || lower.includes("amélioration") || lower.includes("conserver") || lower.includes("booster")) return "improvement";
  if (lower.includes("🔵") || lower.includes("ajouter") || lower.includes("créer")) return "info";
  return "info";
}

function detectActionType(text: string): ParsedAction {
  const lower = text.toLowerCase();
  
  // Detect pause keyword
  const pauseKwMatch = lower.match(/(?:mett(?:re|ez)\s+en\s+pause|pause[rz])\s+(?:le\s+)?(?:mot[- ]?clé)\s+["«]?([^"»,.\n]+)/i);
  if (pauseKwMatch) {
    return { text, type: "pause_keyword", targetName: pauseKwMatch[1]?.trim() };
  }

  // Detect pause ad group actions
  const pauseMatch = lower.match(/(?:mett(?:re|ez)\s+en\s+pause|pause[rz])\s+(?:le\s+|l')?(?:ad\s+group|groupe)\s+["«]?([^"»,.\n]+)/i)
    || lower.match(/(?:mett(?:re|ez)\s+en\s+pause|pause[rz])\s+["«]?([^"»,.\n]+)/i);
  if (pauseMatch || lower.includes("mettre en pause") || lower.includes("pausez")) {
    return { text, type: "pause_ad_group", targetName: pauseMatch?.[1]?.trim() };
  }

  // Detect enable/reactivate
  const enableMatch = lower.match(/(?:réactiv|activ|enabl)\w*\s+(?:le\s+)?(?:ad\s+group|groupe|mot-clé)\s+["«\[]?([^"»\],.\n]+)/i);
  if (enableMatch || lower.includes("réactiv") || lower.includes("activez")) {
    return { text, type: "enable_ad_group", targetName: enableMatch?.[1]?.trim() };
  }

  // Detect negative keywords
  if (lower.includes("négatif") || lower.includes("exclure") || lower.includes("negative keyword")) {
    return { text, type: "add_negative_keyword" };
  }

  // Detect create ad group
  if (lower.includes("créer") && (lower.includes("ad group") || lower.includes("groupe d'annonces") || lower.includes("groupe"))) {
    const createMatch = lower.match(/créer\s+(?:un\s+)?(?:nouvel?\s+)?(?:ad\s+group|groupe)\s+["«]?([^"»,.\n]+)/i);
    return { text, type: "create_ad_group", targetName: createMatch?.[1]?.trim() };
  }

  // Detect add headlines
  if (lower.includes("ajouter") && (lower.includes("headline") || lower.includes("titre"))) {
    return { text, type: "add_headlines" };
  }

  // Detect add descriptions
  if (lower.includes("ajouter") && lower.includes("description")) {
    return { text, type: "add_descriptions" };
  }

  return { text, type: "generic" };
}

function parseMarkdownSections(text: string): { summary: string; sections: ReportSection[] } {
  const lines = text.split("\n");
  let summary = "";
  const sections: ReportSection[] = [];
  let currentSection: ReportSection | null = null;
  let inSummary = true;
  let contentBuffer: string[] = [];

  for (const line of lines) {
    if (line.startsWith("### ")) {
      if (currentSection) {
        currentSection.content = contentBuffer.join("\n").trim();
        currentSection.actions = extractActions(currentSection.content);
        sections.push(currentSection);
        contentBuffer = [];
      }
      inSummary = false;
      const title = line.replace(/^###\s*/, "").trim();
      currentSection = { title, severity: parseSeverity(title), content: "", actions: [] };
    } else if (line.startsWith("## ") && !line.toLowerCase().includes("recommandation") && !line.toLowerCase().includes("analyse")) {
      if (currentSection) {
        currentSection.content = contentBuffer.join("\n").trim();
        currentSection.actions = extractActions(currentSection.content);
        sections.push(currentSection);
        contentBuffer = [];
      }
      if (!line.toLowerCase().includes("analyse globale") && !line.toLowerCase().includes("kpi")) {
        inSummary = false;
      }
      if (inSummary) summary += line + "\n";
    } else if (currentSection) {
      contentBuffer.push(line);
    } else if (inSummary) {
      summary += line + "\n";
    }
  }

  if (currentSection) {
    currentSection.content = contentBuffer.join("\n").trim();
    currentSection.actions = extractActions(currentSection.content);
    sections.push(currentSection);
  }

  return { summary: summary.trim(), sections };
}

function extractActions(content: string): ParsedAction[] {
  const actions: ParsedAction[] = [];
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    const isActionLine = 
      (trimmed.startsWith("*   **Action") || trimmed.startsWith("- **Action") || trimmed.startsWith("*  **Action")) ||
      (trimmed.match(/^\d+\.\s+\*\*/) && (trimmed.includes("Action") || trimmed.includes("Mettre") || trimmed.includes("Ajouter") || trimmed.includes("Optimiser") || trimmed.includes("Vérifi") || trimmed.includes("Créer") || trimmed.includes("Supprim") || trimmed.includes("Paus") || trimmed.includes("Réactiv"))) ||
      (trimmed.match(/^\d+\.\s+/) && (trimmed.includes("Mettre en pause") || trimmed.includes("Créer") || trimmed.includes("Ajouter")));
    
    if (isActionLine) {
      const cleaned = trimmed
        .replace(/^\*\s+/, "").replace(/^-\s+/, "").replace(/^\d+\.\s+/, "")
        .replace(/\*\*/g, "").replace(/^Action\s*:\s*/i, "").replace(/^Action concrète\s*:\s*/i, "")
        .trim();
      if (cleaned.length > 10) {
        actions.push(detectActionType(cleaned));
      }
    }
  }
  return actions.slice(0, 12);
}

const severityConfig = {
  critical: {
    color: "bg-red-50 border-red-200",
    badge: "bg-red-100 text-red-800 border-red-300",
    icon: AlertCircle,
    iconColor: "text-red-600",
    label: "Critique",
  },
  important: {
    color: "bg-amber-50 border-amber-200",
    badge: "bg-amber-100 text-amber-800 border-amber-300",
    icon: AlertTriangle,
    iconColor: "text-amber-600",
    label: "Important",
  },
  improvement: {
    color: "bg-green-50 border-green-200",
    badge: "bg-green-100 text-green-800 border-green-300",
    icon: CheckCircle2,
    iconColor: "text-green-600",
    label: "Amélioration",
  },
  info: {
    color: "bg-blue-50 border-blue-200",
    badge: "bg-blue-100 text-blue-800 border-blue-300",
    icon: Lightbulb,
    iconColor: "text-blue-600",
    label: "Info",
  },
};

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderMarkdownLine(text: string) {
  // Escape first, then apply markdown — prevents any HTML injection via captured groups.
  const escaped = escapeHtml(text);
  const parts = escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-xs font-mono">$1</code>');
  return <span dangerouslySetInnerHTML={{ __html: parts }} />;
}

function ActionButton({ action, onExecuted }: { action: ParsedAction; onExecuted?: () => void }) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [executed, setExecuted] = useState(false);

  const executeAction = async () => {
    if (action.type === "generic" || action.type === "add_headlines" || action.type === "add_descriptions") {
      // For headlines/descriptions, copy the text to clipboard as guidance
      if (action.type !== "generic") {
        await navigator.clipboard.writeText(action.text);
        toast({ title: "📋 Copié", description: "Suggestion copiée dans le presse-papier. Ajoutez-la dans Google Ads." });
        setExecuted(true);
      }
      return;
    }
    setIsExecuting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      if (action.type === "pause_ad_group" || action.type === "enable_ad_group") {
        const targetName = action.targetName?.replace(/['"«»\[\]]/g, "").trim();
        if (!targetName) {
          toast({ title: "Nom du groupe introuvable", description: "Impossible d'identifier l'ad group", variant: "destructive" });
          return;
        }

        const { data: ads } = await supabase
          .from("ads_sync")
          .select("google_ad_group_id, ad_group_name")
          .eq("user_id", session.user.id)
          .ilike("ad_group_name", `%${targetName}%`)
          .limit(1);

        const adGroupId = ads?.[0]?.google_ad_group_id;
        if (!adGroupId) {
          toast({ title: "Ad Group introuvable", description: `"${targetName}" non trouvé dans les données synchronisées`, variant: "destructive" });
          return;
        }

        const newStatus = action.type === "pause_ad_group" ? "PAUSED" : "ENABLED";
        const { data, error } = await supabase.functions.invoke("toggle-ad-group-status", {
          body: { adGroupId, action: newStatus },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        setExecuted(true);
        toast({
          title: newStatus === "PAUSED" ? "⏸️ Ad Group mis en pause" : "▶️ Ad Group activé",
          description: `"${ads?.[0]?.ad_group_name || targetName}" → ${newStatus}`,
        });
        onExecuted?.();

      } else if (action.type === "add_negative_keyword") {
        // Extract keyword from the action text
        const keywordMatch = action.text.match(/["«]([^"»]+)["»]/i) 
          || action.text.match(/(?:exclure|ajouter.*négatif|negative)\s+(?:le\s+)?(?:mot[- ]clé\s+)?["«]?([^"»,.\n]+)/i)
          || action.text.match(/:\s*["«]?([^"»,.\n]{3,40})/i);
        
        const keyword = keywordMatch?.[1]?.replace(/['"«»\[\]]/g, "").trim();
        if (!keyword) {
          toast({ title: "Mot-clé introuvable", description: "Impossible d'extraire le mot-clé négatif du texte", variant: "destructive" });
          return;
        }

        // Optionally find adGroupId or campaignId from context
        let adGroupId: string | undefined;
        const groupMatch = action.text.match(/(?:ad\s*group|groupe)\s+["«]?([^"»,.\n]+)/i);
        if (groupMatch) {
          const groupName = groupMatch[1].trim();
          const { data: ads } = await supabase
            .from("ads_sync")
            .select("google_ad_group_id")
            .eq("user_id", session.user.id)
            .ilike("ad_group_name", `%${groupName}%`)
            .limit(1);
          adGroupId = ads?.[0]?.google_ad_group_id || undefined;
        }

        const { data, error } = await supabase.functions.invoke("add-negative-keyword", {
          body: { keyword, adGroupId },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        setExecuted(true);
        toast({
          title: "🚫 Mot-clé négatif ajouté",
          description: `"${keyword}" exclu ${data?.level === "ad_group" ? "du groupe" : "de la campagne"}`,
        });
        onExecuted?.();

      } else if (action.type === "create_ad_group") {
        // Call competitor ad group creation function with explicit autopilotgeo context
        toast({ title: "🔍 Recherche de concurrents...", description: "Identification des concurrents et création de l'ad group en cours..." });
        
        const { data, error } = await supabase.functions.invoke("create-competitor-ad-group", {
          body: {
            websiteUrl: "https://autopilotgeo.com",
            brandName: "AutoPilot Geo",
            businessDescription: "AI-powered SEO and Answer Engine Optimization (AEO) platform that helps businesses get cited by AI chatbots like ChatGPT, Perplexity, and Gemini. Generates optimized content, articles, and Q&A to boost AI visibility.",
            language: "en",
            competitors: ["Surfer SEO", "MarketMuse", "Frase", "Clearscope"],
          },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        const competitorNames = data?.competitors?.map((c: any) => c.name).join(", ") || "concurrents";
        setExecuted(true);
        toast({
          title: "✅ Ad Group Concurrent créé",
          description: `Groupe "${data?.adGroupName}" créé avec mots-clés : ${competitorNames}. ${data?.keywordsCount || 0} keywords ajoutés.`,
        });
        onExecuted?.();

      } else if (action.type === "pause_keyword") {
        const targetName = action.targetName?.replace(/['"«»\[\]]/g, "").trim();
        if (!targetName) {
          toast({ title: "Mot-clé introuvable", variant: "destructive" });
          return;
        }

        // Find the keyword in keywords_sync
        const { data: keywords } = await supabase
          .from("keywords_sync")
          .select("google_keyword_id, keyword_text, google_ad_group_id")
          .eq("user_id", session.user.id)
          .ilike("keyword_text", `%${targetName}%`)
          .limit(1);

        if (!keywords?.[0]?.google_ad_group_id) {
          toast({ title: "Mot-clé introuvable dans les données sync", variant: "destructive" });
          return;
        }

        // Use add-negative-keyword to effectively pause it
        const { data, error } = await supabase.functions.invoke("add-negative-keyword", {
          body: { keyword: targetName, adGroupId: keywords[0].google_ad_group_id },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        setExecuted(true);
        toast({
          title: "⏸️ Mot-clé exclu",
          description: `"${targetName}" ajouté en négatif`,
        });
        onExecuted?.();
      }
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setIsExecuting(false);
    }
  };

  if (action.type === "generic") {
    return null;
  }

  const buttonConfig: Record<string, { icon: typeof Pause; label: string; variant: "destructive" | "default" | "outline" | "secondary" }> = {
    pause_ad_group: { icon: Pause, label: "Mettre en pause", variant: "destructive" },
    enable_ad_group: { icon: Play, label: "Activer", variant: "default" },
    add_negative_keyword: { icon: MinusCircle, label: "Ajouter négatif", variant: "outline" },
    pause_keyword: { icon: Pause, label: "Pauser mot-clé", variant: "destructive" },
    create_ad_group: { icon: PlusCircle, label: "Créer Ad Group", variant: "default" },
    add_headlines: { icon: PlusCircle, label: "Ajouter Headlines", variant: "secondary" },
    add_descriptions: { icon: PlusCircle, label: "Ajouter Descriptions", variant: "secondary" },
  };

  const config = buttonConfig[action.type] || buttonConfig.pause_ad_group;
  const Icon = config.icon;

  return (
    <Button
      size="sm"
      variant={executed ? "outline" : config.variant}
      className="h-7 text-xs gap-1 shrink-0"
      disabled={isExecuting || executed}
      onClick={executeAction}
    >
      {isExecuting ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : executed ? (
        <CheckCircle2 className="h-3 w-3 text-green-600" />
      ) : (
        <Icon className="h-3 w-3" />
      )}
      {executed ? "Fait ✓" : config.label}
    </Button>
  );
}

export function AdsAnalysisReport({ text, isStreaming, onActionExecuted }: AdsAnalysisReportProps) {
  if (!text && isStreaming) {
    return (
      <div className="flex items-center gap-3 py-8 justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span className="text-muted-foreground">Analyse en cours...</span>
      </div>
    );
  }

  if (!text) return null;

  const { summary, sections } = parseMarkdownSections(text);
  const kpis = extractKPIs(summary);

  return (
    <div className="space-y-6">
      {/* KPI Dashboard */}
      {kpis.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {kpis.map((kpi, i) => (
            <Card key={i} className="bg-muted/30">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">{kpi.label}</p>
                <p className="text-2xl font-bold mt-1">{kpi.value}</p>
                {kpi.status && (
                  <Badge variant="outline" className={`mt-1 text-[10px] ${
                    kpi.status === "bad" ? "text-red-600 border-red-300" : 
                    kpi.status === "ok" ? "text-amber-600 border-amber-300" : 
                    "text-green-600 border-green-300"
                  }`}>
                    {kpi.status === "bad" ? "⚠️ À corriger" : kpi.status === "ok" ? "Acceptable" : "✓ Bon"}
                  </Badge>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Summary */}
      {summary && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Synthèse
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground leading-relaxed space-y-2">
              {summary.split("\n").filter(l => l.trim() && !l.startsWith("#")).map((line, i) => (
                <p key={i}>{renderMarkdownLine(line)}</p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recommendation Cards */}
      {sections.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            {sections.length} Recommandation{sections.length > 1 ? "s" : ""}
          </h3>
          {sections.map((section, idx) => {
            const config = severityConfig[section.severity];
            const Icon = config.icon;
            const actionableItems = section.actions.filter(a => a.type !== "generic");

            return (
              <Card key={idx} className={`border ${config.color}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start gap-3">
                    <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${config.iconColor}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-sm font-semibold leading-tight">
                          {section.title.replace(/🔴|🟡|🟢|🔵/g, "").replace(/Critique\s*:|Important\s*:|Amélioration\s*:/i, "").trim()}
                        </CardTitle>
                        <Badge variant="outline" className={`text-[10px] shrink-0 ${config.badge}`}>
                          {config.label}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {/* Content */}
                  <div className="text-sm text-muted-foreground leading-relaxed space-y-1.5 mb-3">
                    {section.content.split("\n").filter(l => {
                      const t = l.trim();
                      return t && !t.startsWith("---") && !t.startsWith("###");
                    }).slice(0, 8).map((line, i) => {
                      const trimmed = line.trim();
                      if (trimmed.startsWith("*") || trimmed.startsWith("-")) {
                        const lineText = trimmed.replace(/^\*\s+/, "").replace(/^-\s+/, "");
                        return (
                          <div key={i} className="flex items-start gap-2 pl-1">
                            <ArrowRight className="h-3 w-3 mt-1 shrink-0 text-primary/60" />
                            <span>{renderMarkdownLine(lineText)}</span>
                          </div>
                        );
                      }
                      if (trimmed.match(/^\d+\./)) {
                        const lineText = trimmed.replace(/^\d+\.\s+/, "");
                        return (
                          <div key={i} className="flex items-start gap-2 pl-1">
                            <span className="text-primary font-bold text-xs mt-0.5 shrink-0">{trimmed.match(/^\d+/)?.[0]}.</span>
                            <span>{renderMarkdownLine(lineText)}</span>
                          </div>
                        );
                      }
                      return <p key={i}>{renderMarkdownLine(trimmed)}</p>;
                    })}
                  </div>

                  {/* Actionable CTA buttons */}
                  {section.actions.length > 0 && (
                    <>
                      <Separator className="my-3" />
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                          <Target className="h-3 w-3" /> Actions
                        </p>
                        {section.actions.map((action, ai) => (
                          <div key={ai} className="flex items-center gap-2 bg-background/80 rounded-lg p-2.5 border border-border/50">
                            <Zap className="h-4 w-4 shrink-0 text-primary" />
                            <span className="text-xs leading-relaxed flex-1">{renderMarkdownLine(action.text)}</span>
                            <ActionButton action={action} onExecuted={onActionExecuted} />
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Streaming indicator */}
      {isStreaming && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Analyse en cours...</span>
        </div>
      )}

      {/* Chat Discussion */}
      {text && !isStreaming && (
        <ReportChat reportContext={text} />
      )}
    </div>
  );
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function ReportChat({ reportContext }: { reportContext: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const resp = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ads-chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ reportContext, messages: newMessages }),
        }
      );

      if (!resp.ok || !resp.body) {
        const err = await resp.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `Error ${resp.status}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantText += content;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantText } : m);
                }
                return [...prev, { role: "assistant", content: assistantText }];
              });
            }
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }
    } catch (err: any) {
      toast({ title: "Erreur chat", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  if (!isOpen) {
    return (
      <Button
        variant="outline"
        className="w-full gap-2 border-dashed"
        onClick={() => { setIsOpen(true); setTimeout(() => inputRef.current?.focus(), 100); }}
      >
        <MessageCircle className="h-4 w-4" />
        Discuter avec l'IA à propos de ce rapport
      </Button>
    );
  }

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-primary" />
          Discussion
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Messages */}
        {messages.length > 0 && (
          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  </div>
                )}
                <div className={`rounded-lg px-3 py-2 text-sm max-w-[85%] ${
                  msg.role === "user" 
                    ? "bg-primary text-primary-foreground" 
                    : "bg-muted"
                }`}>
                  {msg.role === "assistant" ? (
                    <div className="space-y-1.5 leading-relaxed">
                      {msg.content.split("\n").filter(l => l.trim()).map((line, j) => (
                        <p key={j}>{renderMarkdownLine(line)}</p>
                      ))}
                    </div>
                  ) : (
                    <p>{msg.content}</p>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center shrink-0 mt-0.5">
                    <User className="h-3.5 w-3.5 text-primary-foreground" />
                  </div>
                )}
              </div>
            ))}
            {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex gap-2">
                <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="bg-muted rounded-lg px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        )}

        {/* Input */}
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
            placeholder="Ex: J'ai ajouté ça, que faire ensuite ?"
            disabled={isLoading}
            className="flex-1"
          />
          <Button size="icon" onClick={sendMessage} disabled={isLoading || !input.trim()}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function extractKPIs(summary: string): { label: string; value: string; status?: "bad" | "ok" | "good" }[] {
  const kpis: { label: string; value: string; status?: "bad" | "ok" | "good" }[] = [];

  const spendMatch = summary.match(/(\d+[.,]\d+)\s*€.*(?:dépens|spend)/i) || summary.match(/(?:dépens|spend).*?(\d+[.,]\d+)\s*€/i);
  if (spendMatch) kpis.push({ label: "Dépenses 7j", value: `${spendMatch[1]}€` });

  const clicksMatch = summary.match(/(\d+)\s*clics/i);
  if (clicksMatch) kpis.push({ label: "Clics 7j", value: clicksMatch[1] });

  const convMatch = summary.match(/(\d+)\s*conversion/i);
  if (convMatch) {
    const val = parseInt(convMatch[1]);
    kpis.push({ label: "Conversions", value: convMatch[1], status: val === 0 ? "bad" : val < 5 ? "ok" : "good" });
  }

  const ctrMatch = summary.match(/CTR.*?(\d+[.,]\d+)\s*%/i) || summary.match(/(\d+[.,]\d+)\s*%.*CTR/i);
  if (ctrMatch) {
    const val = parseFloat(ctrMatch[1].replace(",", "."));
    kpis.push({ label: "CTR moyen", value: `${ctrMatch[1]}%`, status: val < 2 ? "bad" : val < 5 ? "ok" : "good" });
  }

  const roasMatch = summary.match(/ROAS.*?(\d+[.,]\d+)/i);
  if (roasMatch) {
    const val = parseFloat(roasMatch[1].replace(",", "."));
    kpis.push({ label: "ROAS", value: roasMatch[1], status: val < 1 ? "bad" : val < 3 ? "ok" : "good" });
  }

  return kpis.slice(0, 4);
}

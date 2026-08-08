"use client";
import { Helmet } from "react-helmet-async";
import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Search, 
  Loader2, 
  CheckCircle, 
  AlertTriangle, 
  XCircle,
  Globe,
  Zap,
  History,
  Clock,
  FileText
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useActiveProject } from "@/hooks/useProjects";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface AuditResult {
  category: string;
  status: "pass" | "warning" | "fail";
  title: string;
  description: string;
  impact: string;
  recommendation: string;
}

interface AuditResponse {
  success: boolean;
  url: string;
  scores: {
    overall: number;
    seo: number;
    aeo: number;
  };
  results: AuditResult[];
}

interface SavedAudit {
  id: string;
  url: string;
  domain: string;
  scores: { overall: number; seo: number; aeo: number };
  results: AuditResult[];
  created_at: string;
}

export default function AeoSeoAudit() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [auditData, setAuditData] = useState<AuditResponse | null>(null);
  const [history, setHistory] = useState<SavedAudit[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const { project } = useActiveProject();
  const { toast } = useToast();

  // Load audit history
  useEffect(() => {
    if (!project) return;
    loadHistory();
  }, [project?.id]);

  const loadHistory = async () => {
    if (!project) return;
    setLoadingHistory(true);
    try {
      const { data } = await supabase
        .from("site_audits")
        .select("id, url, domain, scores, results, created_at")
        .eq("project_id", project.id)
        .order("created_at", { ascending: false })
        .limit(20);
      setHistory((data as any[]) || []);
    } catch {
      // ignore
    } finally {
      setLoadingHistory(false);
    }
  };

  const runAudit = async () => {
    if (!url || !project) {
      toast({ title: "Erreur", description: "Veuillez entrer une URL", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("seo-audit", {
        body: { projectId: project.id, url }
      });

      if (error) throw error;
      setAuditData(data);

      // Save to database
      try {
        const domain = new URL(url).hostname;
        await supabase.from("site_audits").insert({
          url,
          domain,
          scores: data.scores || { overall: 0, seo: 0, aeo: 0 },
          summary: data.summary || {},
          results: data.results || [],
          project_id: project.id,
        } as any);
        loadHistory();
      } catch (saveErr) {
        console.error("Failed to save audit:", saveErr);
      }

      toast({ title: "Audit terminé", description: "L'analyse SEO est terminée." });
    } catch (err: any) {
      toast({ title: "Audit échoué", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const loadSavedAudit = (audit: SavedAudit) => {
    setAuditData({
      success: true,
      url: audit.url,
      scores: audit.scores,
      results: audit.results as AuditResult[],
    });
    setUrl(audit.url);
    toast({ title: "Audit chargé", description: `Audit du ${format(new Date(audit.created_at), "dd MMM yyyy", { locale: fr })}` });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pass": return <CheckCircle className="h-5 w-5 text-emerald-500" />;
      case "warning": return <AlertTriangle className="h-5 w-5 text-amber-500" />;
      case "fail": return <XCircle className="h-5 w-5 text-red-500" />;
      default: return null;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-emerald-500";
    if (score >= 60) return "text-amber-500";
    return "text-red-500";
  };

  return (
    <DashboardLayout>
      <Helmet>
        <title>SEO Audit — AutoPilot Geo</title>
        <meta name="description" content="Audit your website for technical SEO and AEO issues, get prioritized fixes and a score for AI-search visibility." />
        <meta property="og:title" content="SEO Audit — AutoPilot Geo" />
        <meta property="og:description" content="Audit your website for technical SEO and AEO issues, get prioritized fixes and a score for AI-search visibility." />
        <link rel="canonical" href="https://autopilotgeo.com/seo-audit" />
        <meta property="og:url" content="https://autopilotgeo.com/seo-audit" />
      </Helmet>
      <div className="space-y-8">
        <PageHeader
          icon={Search}
          title="SEO Audit"
          description="Analysez votre site web pour les problèmes SEO et AEO"
          gradientFrom="from-rose-500/10"
          gradientVia="via-pink-500/10"
          gradientTo="to-red-500/10"
          iconFrom="from-rose-500"
          iconTo="to-pink-600"
        />

        {/* URL Input */}
        <GlassCard className="p-6">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="https://yourwebsite.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button onClick={runAudit} disabled={loading || !project}>
              {loading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Analyse...</>
              ) : (
                <><Search className="mr-2 h-4 w-4" />Lancer l'audit</>
              )}
            </Button>
          </div>
          {!project && (
            <p className="text-sm text-muted-foreground mt-2">
              Veuillez compléter l'onboarding pour lancer un audit.
            </p>
          )}
        </GlassCard>

        {/* History */}
        {history.length > 0 && (
          <GlassCard className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <History className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Historique des audits ({history.length})</h3>
            </div>
            <ScrollArea className="max-h-[200px]">
              <div className="space-y-2">
                {history.map((audit) => (
                  <div
                    key={audit.id}
                    className="flex items-center justify-between border rounded-lg p-3 hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => loadSavedAudit(audit)}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <FileText className="h-4 w-4 shrink-0 text-primary" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{audit.domain}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground">
                            {format(new Date(audit.created_at), "dd MMM yyyy HH:mm", { locale: fr })}
                          </span>
                          <Badge variant="secondary" className="text-[10px] h-4">
                            Score: {audit.scores?.overall ?? "—"}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="h-7 text-xs shrink-0">
                      Charger
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </GlassCard>
        )}

        {loadingHistory && !auditData && (
          <div className="flex items-center justify-center gap-2 py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm text-muted-foreground">Chargement de l'historique...</span>
          </div>
        )}

        {/* Results */}
        {auditData && (
          <>
            {/* Scores */}
            <div className="grid gap-6 md:grid-cols-3">
              <GlassCard className="p-6 text-center">
                <p className="text-sm text-muted-foreground mb-2">Score Global</p>
                <p className={`text-5xl font-bold ${getScoreColor(auditData.scores.overall)}`}>
                  {auditData.scores.overall}
                </p>
                <Progress value={auditData.scores.overall} className="mt-4" />
              </GlassCard>
              <GlassCard className="p-6 text-center">
                <p className="text-sm text-muted-foreground mb-2">Score SEO</p>
                <p className={`text-5xl font-bold ${getScoreColor(auditData.scores.seo)}`}>
                  {auditData.scores.seo}
                </p>
                <Progress value={auditData.scores.seo} className="mt-4" />
              </GlassCard>
              <GlassCard className="p-6 text-center">
                <p className="text-sm text-muted-foreground mb-2">Score AEO</p>
                <p className={`text-5xl font-bold ${getScoreColor(auditData.scores.aeo)}`}>
                  {auditData.scores.aeo}
                </p>
                <Progress value={auditData.scores.aeo} className="mt-4" />
              </GlassCard>
            </div>

            {/* Emotional Gap Banner */}
            {auditData.scores.overall < 70 && (
              <GlassCard className="p-6 border-red-200 bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-500/10 dark:to-orange-500/10">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-500/20 flex items-center justify-center shrink-0">
                    <AlertTriangle className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-red-800 dark:text-red-400">
                      Your AI visibility score is {auditData.scores.overall}/100 — your competitors average 65+
                    </h3>
                    <p className="text-sm text-red-700/70 dark:text-red-300/70 mt-1">
                      While you're reading this, businesses in your industry are publishing 30 AI-optimized articles/month and getting recommended by ChatGPT. Every day without action is traffic you're losing to them.
                    </p>
                    <Button 
                      size="sm" 
                      className="mt-3 bg-red-600 hover:bg-red-700 text-white gap-2"
                      onClick={() => window.location.href = "/checkout"}
                    >
                      <Zap className="h-4 w-4" />
                      Close the Gap — Start Free Trial
                    </Button>
                  </div>
                </div>
              </GlassCard>
            )}

            {/* Issues List */}
            <div>
              <h2 className="text-xl font-semibold mb-4">Résultats de l'audit</h2>
              <div className="space-y-4">
                {auditData.results.map((result, i) => (
                  <GlassCard key={i} className="p-4">
                    <div className="flex items-start gap-4">
                      {getStatusIcon(result.status)}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold">{result.title}</h3>
                          <Badge variant="secondary" className="text-xs">
                            {result.category}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{result.description}</p>
                        {result.recommendation && (
                          <div className="mt-2 p-3 bg-muted/50 rounded-lg">
                            <p className="text-sm"><strong>Recommandation :</strong> {result.recommendation}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </GlassCard>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Empty State */}
        {!auditData && !loading && !loadingHistory && history.length === 0 && (
          <GlassCard className="p-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mx-auto mb-4">
              <Zap className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">Lancez votre premier audit</h3>
            <p className="text-muted-foreground mt-1">
              Entrez l'URL de votre site ci-dessus pour analyser les performances SEO et AEO.
            </p>
          </GlassCard>
        )}
      </div>
    </DashboardLayout>
  );
}

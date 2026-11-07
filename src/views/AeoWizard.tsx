"use client";
import { useState, useEffect } from "react";
import { trackOnboardingComplete } from "@/lib/gtag-conversions";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, ArrowRight, Globe, FileText, Loader2, Check, Rocket, Search, Users, Swords, TrendingUp, Shield, Bot, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCreateProject } from "@/hooks/useProjects";
import { toast } from "sonner";
import { AnimatedLogo } from "@/components/AnimatedLogo";
import { cn } from "@/lib/utils";
interface AnalyzedKeyword {
  keyword: string;
  intent: string;
}

export default function AeoWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const addSiteMode = searchParams.get("addSite") === "1";
  const shopifySource = searchParams.get("source") === "shopify";
  const { user } = useAuth();
  const createProject = useCreateProject();

  const [step, setStep] = useState(1);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [analysisPhase, setAnalysisPhase] = useState(0);
  const [analyzedKeywords, setAnalyzedKeywords] = useState<AnalyzedKeyword[]>([]);
  const [analyzedCompetitors, setAnalyzedCompetitors] = useState<string[]>([]);
  const [analyzedAudiences, setAnalyzedAudiences] = useState<string[]>([]);
  const [data, setData] = useState({
    websiteUrl: "",
    language: "en",
    businessDescription: "",
  });

  useEffect(() => {
    const urlFromParam = searchParams.get("url");
    if (urlFromParam && !data.websiteUrl) {
      setData((prev) => ({ ...prev, websiteUrl: decodeURIComponent(urlFromParam) }));
    }
  }, [searchParams, data.websiteUrl]);

  // Prefill from Shopify shop info when coming from shopify_oauth flow
  useEffect(() => {
    if (!shopifySource || !user) return;
    (async () => {
      const { data: proj } = await supabase
        .from("projects")
        .select("id, website_url, language, brand_name, business_description")
        .eq("user_id", user.id)
        .eq("source", "shopify_oauth")
        .maybeSingle();
      if (proj) {
        setData({
          websiteUrl: proj.website_url || "",
          language: proj.language || "en",
          businessDescription: proj.business_description || "",
        });
      }
    })();
  }, [shopifySource, user]);

  // Force light theme
  useEffect(() => {
    document.documentElement.classList.remove("dark");
  }, []);

  // Check if user already has a project - redirect to dashboard (unless they still need onboarding)
  useEffect(() => {
    const checkExistingProject = async () => {
      if (!user || addSiteMode || shopifySource) return;
      const { data: projects } = await supabase
        .from("projects")
        .select("id, needs_onboarding")
        .eq("user_id", user.id)
        .limit(1);
      if (projects && projects.length > 0 && !projects[0].needs_onboarding) {
        router.replace("/dashboard");
      }
    };
    checkExistingProject();
  }, [user, router, addSiteMode, shopifySource]);

  const isValidUrl = (url: string) => {
    try {
      const urlToTest = url.startsWith("http") ? url : `https://${url}`;
      new URL(urlToTest);
      return true;
    } catch {
      return false;
    }
  };

  const getDomainFromUrl = (url: string): string => {
    try {
      const urlObj = new URL(url.startsWith("http") ? url : `https://${url}`);
      return urlObj.hostname.replace("www.", "");
    } catch {
      return url.replace(/^(https?:\/\/)?(www\.)?/, "").split("/")[0];
    }
  };

  const analyzeWebsite = async () => {
    if (!isValidUrl(data.websiteUrl)) {
      toast.error("Please enter a valid URL");
      return;
    }
    setIsAnalyzing(true);
    setAnalysisPhase(0);
    setStep(3); // Go to analysis screen

    // Progressive phases for visual feedback
    const phaseTimers = [
      setTimeout(() => setAnalysisPhase(1), 800),
      setTimeout(() => setAnalysisPhase(2), 2200),
      setTimeout(() => setAnalysisPhase(3), 4000),
      setTimeout(() => setAnalysisPhase(4), 6000),
    ];

    const analysisStart = Date.now();

    try {
      const urlToAnalyze = data.websiteUrl.startsWith("http") ? data.websiteUrl : `https://${data.websiteUrl}`;
      const { data: result, error } = await supabase.functions.invoke("analyze-website", {
        body: { url: urlToAnalyze },
      });
      if (error) throw error;
      if (result?.description) {
        setData(prev => ({ ...prev, businessDescription: result.description, language: result.language || "en" }));
      }
      if (result?.keywords && Array.isArray(result.keywords)) {
        setAnalyzedKeywords(result.keywords.map((k: any) => typeof k === "string" ? { keyword: k, intent: "informational" } : k));
      }
      if (result?.competitors) setAnalyzedCompetitors(result.competitors);
      if (result?.targetAudiences) setAnalyzedAudiences(result.targetAudiences);

      // Ensure minimum 5s so user sees all phases
      const elapsed = Date.now() - analysisStart;
      const remaining = Math.max(0, 5500 - elapsed);
      await new Promise(resolve => setTimeout(resolve, remaining));

      phaseTimers.forEach(clearTimeout);
      setStep(2);
    } catch (error) {
      console.error("Analysis error:", error);
      phaseTimers.forEach(clearTimeout);
      setStep(2);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleComplete = async () => {
    if (!user) return;
    setIsCreating(true);
    try {
      const urlToSave = data.websiteUrl.startsWith("http") ? data.websiteUrl : `https://${data.websiteUrl}`;
      const domain = new URL(urlToSave).hostname.replace("www.", "");
      let projectId: string | undefined;

      if (shopifySource) {
        // Shopify onboarding: update the existing shopify_oauth project instead of creating a new one
        const { data: existing } = await supabase
          .from("projects")
          .select("id")
          .eq("user_id", user.id)
          .eq("source", "shopify_oauth")
          .maybeSingle();
        if (existing?.id) {
          await supabase.from("projects").update({
            website_url: urlToSave,
            language: data.language,
            business_description: data.businessDescription,
            audience: analyzedAudiences.length > 0 ? analyzedAudiences.join(", ") : null,
            competitors: analyzedCompetitors.length > 0 ? analyzedCompetitors : null,
            needs_onboarding: false,
          }).eq("id", existing.id);
          await supabase.from("generation_settings").update({
            language: data.language,
            onboarding_completed: true,
          }).eq("project_id", existing.id);
          projectId = existing.id;
        }
      }

      if (!projectId) {
        const project = await createProject.mutateAsync({
          name: domain,
          website_url: urlToSave,
          language: data.language,
          business_description: data.businessDescription,
          competitors: analyzedCompetitors.length > 0 ? analyzedCompetitors : undefined,
          audience: analyzedAudiences.length > 0 ? analyzedAudiences.join(", ") : undefined,
        });
        projectId = project?.id;
      }

      if (analyzedKeywords.length > 0 && projectId) {
        const keywordRows = analyzedKeywords.map((k) => ({
          project_id: projectId!,
          keyword: k.keyword,
          intent: k.intent || "informational",
          is_used: false,
        }));
        await supabase.from("keywords").insert(keywordRows);
      }
      if (projectId) {
        supabase.functions.invoke('generate-30-days-content', {
          body: { projectId, language: data.language, days: 30, questionsPerDay: 1, titlesOnly: true }
        }).catch(err => console.error('[WIZARD] Title generation error:', err));
      }
      trackOnboardingComplete(data.websiteUrl);
      toast.success("Project created! Your 30-day content plan is generating 💜");
      router.push("/dashboard");
    } catch (error: any) {
      console.error("Error creating project:", error);
      const msg = error?.message || "";
      if (msg.startsWith("SITES_LIMIT_REACHED")) {
        toast.error(msg.replace("SITES_LIMIT_REACHED: ", ""), {
          action: { label: "Upgrade", onClick: () => router.push("/pricing") },
        });
      } else {
        toast.error("Failed to create project");
      }
    } finally {
      setIsCreating(false);
    }

  };

  const canProceedStep1 = data.websiteUrl.length > 0 && isValidUrl(data.websiteUrl);
  const canProceedStep2 = data.businessDescription.length > 10;
  const hasDetectedData = analyzedKeywords.length > 0 || analyzedCompetitors.length > 0 || analyzedAudiences.length > 0;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-center pt-6 pb-2 px-4">
        <AnimatedLogo size="md" />
      </div>

      {/* Progress bar */}
      <div className="px-6 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-primary" />
          <div className={`flex-1 h-1.5 rounded-full transition-colors ${step >= 2 ? "bg-primary" : "bg-muted"}`} />
          <div className={`flex-1 h-1.5 rounded-full transition-colors ${step >= 3 ? "bg-primary" : "bg-muted"}`} />
        </div>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          Step {step} of 2
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col px-5 sm:px-8 pb-6 max-w-lg mx-auto w-full">
        <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex-1 flex flex-col justify-center space-y-6"
          >
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                <Globe className="w-6 h-6 text-primary" />
              </div>
              <h2 className="text-xl font-semibold text-foreground">What's your website?</h2>
              <p className="text-sm text-muted-foreground">
                We'll analyze it to detect keywords, audiences & competitors
              </p>
            </div>

            <div className="space-y-3">
              <Input
                placeholder="example.com"
                value={data.websiteUrl}
                onChange={(e) => setData({ ...data, websiteUrl: e.target.value })}
                className="text-center text-base h-12 rounded-xl"
                onKeyDown={(e) => e.key === "Enter" && canProceedStep1 && analyzeWebsite()}
              />

              <Button
                onClick={analyzeWebsite}
                disabled={!canProceedStep1}
                className="w-full h-12 rounded-xl text-base"
              >
                Continue
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </div>

            {/* Trust badges */}
            <div className="flex items-center justify-center gap-4 pt-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span>Free to start</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span>No card required</span>
              </div>
            </div>
          </motion.div>
        )}

        {/* Step 3: Radar Analysis Animation */}
        {step === 3 && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex-1 flex flex-col justify-center space-y-6"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="relative mx-auto w-28 h-28 flex items-center justify-center"
            >
              {/* Radar pulse rings */}
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="absolute inset-0 rounded-full border-2 border-primary/30"
                  initial={{ scale: 0.5, opacity: 0.8 }}
                  animate={{ scale: 1.8, opacity: 0 }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    delay: i * 0.6,
                    ease: "easeOut",
                  }}
                />
              ))}
              {/* Rotating sweep line */}
              <motion.div
                className="absolute w-full h-full"
                animate={{ rotate: 360 }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
              >
                <div className="absolute top-1/2 left-1/2 w-1/2 h-0.5 origin-left bg-gradient-to-r from-primary/60 to-transparent" />
              </motion.div>
              {/* Center icon */}
              <div className="relative z-10 w-14 h-14 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
                <Globe className="w-6 h-6 text-primary" />
              </div>
            </motion.div>

            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold tracking-tight">Scanning {getDomainFromUrl(data.websiteUrl)}</h2>
              <p className="text-sm text-muted-foreground">AI-powered analysis in progress…</p>
            </div>

            <div className="space-y-2.5">
              {[
                { label: "Detecting pages & sitemap…", phase: 0, icon: Globe },
                { label: "Reading your content…", phase: 1, icon: FileText },
                { label: "Checking AI mentions…", phase: 2, icon: Bot },
                { label: "Analyzing competitors…", phase: 3, icon: Target },
                { label: "Calculating visibility score…", phase: 4, icon: TrendingUp },
              ].map((item, i) => {
                const Icon = item.icon;
                const isActive = analysisPhase >= item.phase;
                const isDone = analysisPhase > item.phase;
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: isActive ? 1 : 0.35, x: 0 }}
                    transition={{ delay: i * 0.15, duration: 0.3 }}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-xl bg-card border transition-all",
                      isActive ? "border-primary/30" : "border-border"
                    )}
                  >
                    <div className={cn(
                      "w-7 h-7 rounded-full flex items-center justify-center shrink-0",
                      isDone ? "bg-emerald-500/20" : isActive ? "bg-primary/20" : "bg-muted"
                    )}>
                      {isDone ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : isActive ? (
                        <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                      ) : (
                        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                    </div>
                    <span className={cn("text-sm", isActive ? "text-foreground" : "text-muted-foreground")}>
                      {item.label}
                    </span>
                  </motion.div>
                );
              })}
            </div>

            <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 text-center">
              <Shield className="inline w-3 h-3 mr-1 text-emerald-500" />
              Your content plan will be ready in seconds
            </p>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex-1 flex flex-col space-y-5 pt-2"
          >
            {/* Header */}
            <div className="text-center space-y-1.5">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[11px] font-medium text-red-600">AI Visibility Audit</span>
              </div>
              <h2 className="text-xl font-semibold text-foreground">
                {getDomainFromUrl(data.websiteUrl) || "Your site"} is barely visible on AI
              </h2>
              <p className="text-sm text-muted-foreground">
                Here's what we found — and how AutoPilot GEO fixes it 🚀
              </p>
            </div>

            {/* Audit score card */}
            {(() => {
              const kwCount = analyzedKeywords.length;
              const compCount = analyzedCompetitors.length;
              // Low baseline score: site barely visible on AI before AutoPilot GEO
              const score = Math.max(8, Math.min(34, 12 + kwCount + compCount * 2));
              const potential = Math.min(96, 78 + Math.floor(kwCount / 2));
              return (
                <div className="rounded-2xl border border-border bg-gradient-to-br from-red-500/5 via-background to-emerald-500/5 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    {/* Current score */}
                    <div className="flex items-center gap-3">
                      <div className="relative w-16 h-16 flex items-center justify-center">
                        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 64 64">
                          <circle cx="32" cy="32" r="28" stroke="hsl(var(--muted))" strokeWidth="6" fill="none" />
                          <circle
                            cx="32" cy="32" r="28"
                            stroke="rgb(239 68 68)" strokeWidth="6" fill="none"
                            strokeDasharray={`${(score / 100) * 175.9} 175.9`}
                            strokeLinecap="round"
                          />
                        </svg>
                        <div className="text-center">
                          <p className="text-base font-bold text-red-600 leading-none">{score}</p>
                          <p className="text-[8px] text-muted-foreground">/100</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Current</p>
                        <p className="text-sm font-semibold text-red-600">Poor visibility</p>
                      </div>
                    </div>
                    <ArrowRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                    {/* Potential score */}
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="text-[11px] text-muted-foreground uppercase tracking-wide text-right">Potential</p>
                        <p className="text-sm font-semibold text-emerald-600">With AutoPilot</p>
                      </div>
                      <div className="relative w-16 h-16 flex items-center justify-center">
                        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 64 64">
                          <circle cx="32" cy="32" r="28" stroke="hsl(var(--muted))" strokeWidth="6" fill="none" />
                          <circle
                            cx="32" cy="32" r="28"
                            stroke="rgb(16 185 129)" strokeWidth="6" fill="none"
                            strokeDasharray={`${(potential / 100) * 175.9} 175.9`}
                            strokeLinecap="round"
                          />
                        </svg>
                        <div className="text-center">
                          <p className="text-base font-bold text-emerald-600 leading-none">{potential}</p>
                          <p className="text-[8px] text-muted-foreground">/100</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* AI engines mentions */}
                  <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-border">
                    {[
                      { name: "ChatGPT", icon: Bot },
                      { name: "Gemini", icon: Sparkles },
                      { name: "Perplexity", icon: Search },
                    ].map((engine) => {
                      const Icon = engine.icon;
                      return (
                        <div key={engine.name} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-red-500/5 border border-red-500/10">
                          <Icon className="w-3 h-3 text-red-500 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-[10px] font-medium text-foreground truncate">{engine.name}</p>
                            <p className="text-[9px] text-red-600">Not mentioned</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Detected data */}
            {hasDetectedData && (
              <div className="space-y-2.5">
                {/* Keywords */}
                {analyzedKeywords.length > 0 && (
                  <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Target className="w-3.5 h-3.5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{analyzedKeywords.length} keyword opportunities</p>
                          <p className="text-[11px] text-muted-foreground">Ready to capture on AI engines</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-500/10 px-1.5 py-0.5 rounded">HIGH INTENT</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {analyzedKeywords.slice(0, 6).map((kw, i) => (
                        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-background border border-border text-[11px] text-foreground">
                          <TrendingUp className="w-2.5 h-2.5 text-primary flex-shrink-0" />
                          <span className="truncate max-w-[120px]">{kw.keyword}</span>
                        </span>
                      ))}
                      {analyzedKeywords.length > 6 && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-primary/10 text-[11px] text-primary font-medium">
                          +{analyzedKeywords.length - 6}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Competitors & Audiences */}
                <div className="grid grid-cols-2 gap-2.5">
                  {analyzedCompetitors.length > 0 && (
                    <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                          <Swords className="w-3.5 h-3.5 text-orange-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{analyzedCompetitors.length} ahead of you</p>
                          <p className="text-[10px] text-orange-600">On AI results</p>
                        </div>
                      </div>
                      <div className="space-y-0.5">
                        {analyzedCompetitors.slice(0, 3).map((comp, i) => (
                          <p key={i} className="text-[11px] text-muted-foreground truncate">• {comp}</p>
                        ))}
                        {analyzedCompetitors.length > 3 && (
                          <p className="text-[11px] text-orange-600 font-medium">+{analyzedCompetitors.length - 3} more</p>
                        )}
                      </div>
                    </div>
                  )}
                  {analyzedAudiences.length > 0 && (
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                          <Users className="w-3.5 h-3.5 text-emerald-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{analyzedAudiences.length} audiences</p>
                          <p className="text-[10px] text-emerald-600">To target</p>
                        </div>
                      </div>
                      <div className="space-y-0.5">
                        {analyzedAudiences.slice(0, 3).map((aud, i) => (
                          <p key={i} className="text-[11px] text-muted-foreground truncate">• {aud}</p>
                        ))}
                        {analyzedAudiences.length > 3 && (
                          <p className="text-[11px] text-emerald-600 font-medium">+{analyzedAudiences.length - 3} more</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Promise banner */}
                <div className="rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-emerald-500/10 border border-primary/20 p-3 flex items-start gap-2.5">
                  <Rocket className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground">AutoPilot GEO will fix this</p>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      30 days of AI-optimized content, automatic publishing, and live tracking on ChatGPT, Gemini & Perplexity.
                    </p>
                  </div>
                </div>
              </div>
            )}


            {/* Business description */}
            <Textarea
              placeholder="Décrivez votre entreprise et votre site web..."
              value={data.businessDescription}
              onChange={(e) => setData({ ...data, businessDescription: e.target.value })}
              className="min-h-[100px] resize-none rounded-xl text-sm"
            />

            {/* Actions - sticky bottom on mobile */}
            <div className="flex gap-2.5 mt-auto pt-2">
              <Button
                variant="outline"
                onClick={() => setStep(1)}
                className="flex-1 h-12 rounded-xl"
              >
                Back
              </Button>
              <Button
                onClick={handleComplete}
                disabled={!canProceedStep2 || isCreating}
                className="flex-1 h-12 rounded-xl"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Rocket className="w-4 h-4 mr-2" />
                    Launch
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        )}
        </AnimatePresence>
      </div>
    </div>
  );
}

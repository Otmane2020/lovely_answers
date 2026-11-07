"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar, CheckCircle2, ChevronLeft, ChevronRight, Clock, ExternalLink, FileText, Globe, LayoutGrid, Link2, List, Loader2, MapPin, Play, MessageSquare, Send, Settings, ShoppingCart } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { addDays, eachDayOfInterval, format, isToday } from "date-fns";
import { enUS } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveProject } from "@/hooks/useProjects";
import { useGeneration } from "@/contexts/GenerationContext";
import { useSubscriptionContext } from "@/contexts/SubscriptionContext";
import { usePublishAnswer } from "@/hooks/usePublishAnswer";
import { useIntegrations } from "@/hooks/useIntegrations";
import { AutoPublishSettings } from "@/components/planning/AutoPublishSettings";

interface ScheduledItem {
  id: string;
  title: string;
  type: "answer" | "article" | "local" | "geo" | "shopping";
  origin: "AEO" | "Auto SEO" | "Local AEO" | "GEO" | "Shopping";
  date: Date;
  status: "scheduled" | "published" | "draft" | "preview";
  publishedUrl?: string;
  publishedAt?: string | null;
  answer?: string;
  score?: number | null;
  highCitation?: boolean | null;
  aeoScore?: number | null;
  wordCount?: number | null;
  createdAt?: string | null;
  isPreview?: boolean;
}

function getPublishStatus(input: { published_url?: string | null; published_at?: string | null }) {
  return input.published_url || input.published_at ? "published" : "scheduled";
}

function getArticlePublishedUrl(article: any, projectWebsiteUrl?: string | null) {
  const linkedUrl = article.answers?.published_url;
  if (linkedUrl) return linkedUrl;
  if (article.status === "published" && article.slug) {
    const baseUrl = projectWebsiteUrl || window.location.origin;
    return `${baseUrl.replace(/\/+$/, "")}/blog/${article.slug}`;
  }
  return undefined;
}

// Mirrors backend `shouldPublishToday` in publish-scheduled-answers
function matchesFrequency(date: Date, frequency: string): boolean {
  const dow = date.getDay();
  const dom = date.getDate();
  switch (frequency) {
    case "weekly": return dow === 1;
    case "monthly": return dom === 1;
    case "2x_week": return dow === 2 || dow === 4;
    case "3x_week": return dow === 1 || dow === 3 || dow === 5;
    case "daily":
    default: return true;
  }
}

export default function AeoPlanning() {
  const { user } = useAuth();
  const { project } = useActiveProject();
  const publishAnswer = usePublishAnswer();
  const { startGeneration, stopGeneration, setGenerationProgress, setGenerationMessage, isGenerating } = useGeneration();
  const { isSubscribed } = useSubscriptionContext();
  const { data: integrations } = useIntegrations();
  const hasIntegration = integrations && integrations.some(i => i.is_connected);

  // Fix 3: Allow 1 free publish for non-subscribers
  const freePublishKey = project ? `free_publish_used_${project.id}` : null;
  const freePublishUsed = freePublishKey ? localStorage.getItem(freePublishKey) === "true" : false;
  const canPublishFree = !isSubscribed && !freePublishUsed;
  const canPublish = isSubscribed || canPublishFree;
  const [monthViewMode, setMonthViewMode] = useState<"calendar" | "list">("calendar");
  const [scheduledItems, setScheduledItems] = useState<ScheduledItem[]>([]);
  const [queueItems, setQueueItems] = useState<ScheduledItem[]>([]);
  const [liveFrequency, setLiveFrequency] = useState<string>("daily");
  const [autoPublishOn, setAutoPublishOn] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState(true);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedDayItems, setSelectedDayItems] = useState<ScheduledItem[]>([]);
  const [showDayPopup, setShowDayPopup] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const hasRunFill = useRef<string | null>(null);

  const rangeStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const rangeEnd = useMemo(() => addDays(rangeStart, 30), [rangeStart]);

  const visibleStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return addDays(d, weekOffset * 7);
  }, [weekOffset]);

  const visibleEnd = useMemo(() => addDays(visibleStart, 27), [visibleStart]);

  const visibleDays = useMemo(() => eachDayOfInterval({ start: visibleStart, end: visibleEnd }), [visibleStart, visibleEnd]);

  const rangeDays = useMemo(() => eachDayOfInterval({ start: rangeStart, end: rangeEnd }), [rangeStart, rangeEnd]);

  // Keep every scheduled item at its real scheduled_date. Published items stay published;
  // everything else is shown as "preview" so the user sees the full pipeline (AEO + GEO + Local + Shopping).
  // We intentionally do NOT redistribute by `liveFrequency` here — that previously caused GEO/Local items
  // to be dropped because AEO answers filled all the matching weekday slots first.
  const publishedScheduled = useMemo(
    () => scheduledItems.filter((i) => i.status === "published"),
    [scheduledItems]
  );
  const previewItems = useMemo<ScheduledItem[]>(() => {
    if (!autoPublishOn) return [];
    return scheduledItems
      .filter((i) => i.status !== "published")
      .map((i) => ({ ...i, status: "preview" as const, isPreview: true }));
  }, [scheduledItems, autoPublishOn]);

  const allItems = useMemo(() => [...publishedScheduled, ...previewItems], [publishedScheduled, previewItems]);




  const getItemsForDate = (date: Date) => {
    return allItems.filter((item) => format(item.date, "yyyy-MM-dd") === format(date, "yyyy-MM-dd"));
  };

  const getUpcomingItems = () => {
    return allItems.filter((item) => item.date >= new Date()).sort((a, b) => a.date.getTime() - b.date.getTime());
  };


  const fetchScheduledItems = async () => {
    if (!project?.id) return [];
    setIsLoading(true);
    try {
      const { data: answers } = await supabase.from("answers").select("id, question, scheduled_date, published_url, published_at, answer, score, high_citation, created_at").eq("project_id", project.id).not("scheduled_date", "is", null);
      const { data: articles } = await supabase.from("articles").select("id, title, scheduled_date, status, slug, aeo_score, word_count, created_at, answers:linked_answer_id(published_url, published_at)").eq("project_id", project.id).not("scheduled_date", "is", null);
      const { data: localAnswers } = await supabase.from("local_answers").select("id, question, scheduled_date, published_url, published_at, answer, score, created_at").eq("project_id", project.id).not("scheduled_date", "is", null);
      const { data: geoContents } = await supabase.from("geo_contents").select("id, title, topic, scheduled_date, published_url, published_at, content, score, created_at").eq("project_id", project.id).not("scheduled_date", "is", null);
      const items: ScheduledItem[] = [];
      const pickDate = (published_at: string | null | undefined, scheduled_date: string) =>
        new Date(published_at || scheduled_date);
      if (answers) {
        answers.forEach((a) => {
          if (a.scheduled_date) {
            items.push({ id: a.id, title: a.question, type: "answer", origin: "AEO", date: pickDate(a.published_at, a.scheduled_date), status: getPublishStatus(a), publishedUrl: a.published_url || undefined, publishedAt: a.published_at, answer: a.answer || undefined, score: a.score, highCitation: a.high_citation, createdAt: a.created_at });
          }
        });
      }
      if (articles) {
        articles.forEach((art: any) => {
          if (art.scheduled_date) {
            const publishedUrl = getArticlePublishedUrl(art, project.website_url);
            const publishedAt = art.answers?.published_at || null;
            items.push({ id: art.id, title: art.title, type: "article", origin: "Auto SEO", date: pickDate(publishedAt, art.scheduled_date), status: art.status === "published" ? "published" : "scheduled", publishedUrl, publishedAt, aeoScore: art.aeo_score, wordCount: art.word_count, createdAt: art.created_at });
          }
        });
      }
      if (localAnswers) {
        localAnswers.forEach((la) => {
          if (la.scheduled_date) {
            items.push({ id: la.id, title: la.question, type: "local", origin: "Local AEO", date: pickDate(la.published_at, la.scheduled_date), status: getPublishStatus(la), publishedUrl: la.published_url || undefined, publishedAt: la.published_at, answer: la.answer || undefined, score: la.score, createdAt: la.created_at });
          }
        });
      }
      if (geoContents) {
        geoContents.forEach((geo: any) => {
          if (geo.scheduled_date) {
            items.push({ id: geo.id, title: geo.title || geo.topic, type: "geo", origin: "GEO", date: pickDate(geo.published_at, geo.scheduled_date), status: getPublishStatus(geo), publishedUrl: geo.published_url || undefined, publishedAt: geo.published_at, answer: geo.content || undefined, score: geo.score, createdAt: geo.created_at });
          }
        });
      }
      // Fetch shopping planning
      const { data: shoppingPlanning } = await supabase.from("shopping_planning").select("id, scheduled_date, published, published_at, product_id, shopping_products(id, title, ai_title, price, currency, ai_score, image_url, product_url)").eq("project_id", project.id);
      if (shoppingPlanning) {
        shoppingPlanning.forEach((sp: any) => {
          if (sp.scheduled_date) {
            const product = sp.shopping_products;
            const title = product?.ai_title || product?.title || "Product";
            items.push({ id: sp.id, title, type: "shopping", origin: "Shopping", date: pickDate(sp.published_at, sp.scheduled_date), status: sp.published ? "published" : "scheduled", publishedAt: sp.published_at, score: product?.ai_score, createdAt: sp.scheduled_date });
          }
        });
      }

      setScheduledItems(items);
      return items;
    } catch (error) {
      console.error("Error fetching scheduled items:", error);
      toast.error("Failed to load scheduled items");
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  const fetchQueue = async () => {
    if (!project?.id) return;
    try {
      const items: ScheduledItem[] = [];
      const { data: ans } = await supabase.from("answers")
        .select("id, question, created_at")
        .eq("project_id", project.id)
        .is("scheduled_date", null)
        .is("published_at", null)
        .order("created_at", { ascending: true })
        .limit(60);
      ans?.forEach((a: any) => items.push({ id: `prev-a-${a.id}`, title: a.question, type: "answer", origin: "AEO", date: new Date(), status: "preview", createdAt: a.created_at, isPreview: true }));

      const { data: arts } = await supabase.from("articles")
        .select("id, title, created_at")
        .eq("project_id", project.id)
        .is("scheduled_date", null)
        .order("created_at", { ascending: true })
        .limit(60);
      arts?.forEach((a: any) => items.push({ id: `prev-art-${a.id}`, title: a.title, type: "article", origin: "Auto SEO", date: new Date(), status: "preview", createdAt: a.created_at, isPreview: true }));

      const { data: locals } = await supabase.from("local_answers")
        .select("id, question, created_at")
        .eq("project_id", project.id)
        .is("scheduled_date", null)
        .is("published_at", null)
        .order("created_at", { ascending: true })
        .limit(60);
      locals?.forEach((a: any) => items.push({ id: `prev-l-${a.id}`, title: a.question, type: "local", origin: "Local AEO", date: new Date(), status: "preview", createdAt: a.created_at, isPreview: true }));

      const { data: geos } = await supabase.from("geo_contents")
        .select("id, title, topic, created_at")
        .eq("project_id", project.id)
        .is("scheduled_date", null)
        .is("published_at", null)
        .order("created_at", { ascending: true })
        .limit(60);
      geos?.forEach((g: any) => items.push({ id: `prev-g-${g.id}`, title: g.title || g.topic, type: "geo", origin: "GEO", date: new Date(), status: "preview", createdAt: g.created_at, isPreview: true }));

      // Sort by created_at to mimic FIFO queue
      items.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
      setQueueItems(items);
    } catch (e) {
      console.error("Error fetching queue:", e);
    }
  };

  const markItemPublished = (itemId: string, publishedUrl?: string | null) => {
    const publishedAt = new Date().toISOString();
    const applyUpdate = (items: ScheduledItem[]) => items.map((entry) =>
      entry.id === itemId
        ? { ...entry, status: "published" as const, publishedUrl: publishedUrl || entry.publishedUrl, publishedAt, isPreview: false }
        : entry
    );
    setScheduledItems(applyUpdate);
    setSelectedDayItems(applyUpdate);
  };

  useEffect(() => {
    fetchScheduledItems();
    fetchQueue();
  }, [project?.id]);

  useEffect(() => {
    const ensurePlanningIsFilled = async () => {
      if (!project?.id || hasRunFill.current === project.id) return;

      const items = await fetchScheduledItems();
      if (items.length > 0) {
        hasRunFill.current = project.id;
        return;
      }

      hasRunFill.current = project.id;
      startGeneration("Auto-filling 30-day planning… (30–60s)");
      setGenerationProgress(10);

      // Slow visual progress so user knows the app is alive
      const interval = setInterval(() => {
        setGenerationProgress((p) => (p < 90 ? p + 2 : p));
      }, 1000);

      try {
        const { data, error } = await supabase.functions.invoke("daily-planning-fill", {
          body: { projectId: project.id, days: 31, maxDaysToFill: 30 },
        });

        if (error) throw error;
        if (data?.success === false) {
          throw new Error(data.error || "Planning fill failed");
        }

        await fetchScheduledItems();
        await fetchQueue();
        setGenerationMessage("Calendar updated");
        toast.success("Calendar updated");
      } catch (error) {
        console.error("Initial planning fill error:", error);
        toast.error("Content is being prepared. Please try again in a moment.");
      } finally {
        clearInterval(interval);
        stopGeneration();
      }
    };

    ensurePlanningIsFilled();
  }, [project?.id]);


  const handlePublishNow = async (item: ScheduledItem) => {
    if (!project) return;
    setPublishingId(item.id);
    try {
      if (item.type === "answer") {
        const publishResult = await publishAnswer.mutateAsync({ answerId: item.id, projectId: project.id });
        const url = publishResult?.publishedUrl || publishResult?.results?.find((r: any) => r.success && r.url)?.url;
        markItemPublished(item.id, url || null);
        if (url) {
          toast.success("Answer published!", {
            action: { label: "Check live →", onClick: () => window.open(url, "_blank") },
            duration: 10000,
          });
        } else {
          toast.success("Answer published!");
        }
      } else if (item.type === "geo") {
        const { data, error } = await supabase.functions.invoke("publish-geo-content", {
          body: { geoContentId: item.id, projectId: project.id },
        });
        if (error) throw error;
        if (data?.success === false) throw new Error(data?.error || "Publish failed");
        const url = data?.publishedUrl;
        markItemPublished(item.id, url);
        if (url) {
          toast.success("GEO content published!", {
            action: { label: "Check live →", onClick: () => window.open(url, "_blank") },
            duration: 10000,
          });
        } else {
          toast.success("GEO content published!");
        }
      } else if (item.type === "article" || item.type === "local" || item.type === "shopping") {
        const targetDate = format(item.date, "yyyy-MM-dd");
        const { data, error } = await supabase.functions.invoke("publish-scheduled-answers", {
          body: { forceToday: true, projectId: project.id, targetDate },
        });
        if (error) throw error;
        if (data?.success === false) throw new Error(data?.error || "Publish failed");
        const result = data?.results?.find((r: any) => r.id === item.id && r.success) || data?.results?.find((r: any) => r.success);
        markItemPublished(item.id, result?.url && result.url !== "internal" ? result.url : null);
        if (result?.url && result.url !== "internal") {
          toast.success("Published!", {
            action: { label: "Check live →", onClick: () => window.open(result.url, "_blank") },
            duration: 10000,
          });
        } else {
          toast.success("Published!");
        }
      } else {
        toast.info("Nothing to publish for this item");
      }
      await fetchScheduledItems();
    } catch (error) {
      console.error("Error publishing:", error);
      toast.error(error instanceof Error ? error.message : "Failed to publish");
    } finally {
      setPublishingId(null);
    }
  };

  const handleDayClick = (date: Date) => {
    const items = getItemsForDate(date);
    setSelectedDate(date);
    if (items.length > 0) {
      setSelectedDayItems(items);
      setShowDayPopup(true);
    }
  };

  const totalAnswers = scheduledItems.filter((i) => i.type === "answer").length;
  const totalArticles = scheduledItems.filter((i) => i.type === "article").length;
  const totalLocal = scheduledItems.filter((i) => i.type === "local").length;
  const totalGeo = scheduledItems.filter((i) => i.type === "geo").length;
  const totalShopping = scheduledItems.filter((i) => i.type === "shopping").length;
  const publishedItems = scheduledItems.filter((i) => i.status === "published").length;

  const getOriginColor = (origin: string) => {
    switch (origin) {
      case "AEO": return "bg-primary/10 text-primary border-primary/20";
      case "Auto SEO": return "bg-emerald-500/10 text-emerald-700 border-emerald-500/20";
      case "Local AEO": return "bg-orange-500/10 text-orange-700 border-orange-500/20";
      case "GEO": return "bg-violet-500/10 text-violet-700 border-violet-500/20";
      case "Shopping": return "bg-pink-500/10 text-pink-700 border-pink-500/20";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getItemIcon = (item: ScheduledItem) => {
    switch (item.type) {
      case "answer": return <MessageSquare className="h-4 w-4 text-primary shrink-0" />;
      case "article": return <FileText className="h-4 w-4 text-emerald-600 shrink-0" />;
      case "local": return <MapPin className="h-4 w-4 text-orange-600 shrink-0" />;
      case "geo": return <Globe className="h-4 w-4 text-violet-600 shrink-0" />;
      case "shopping": return <ShoppingCart className="h-4 w-4 text-pink-600 shrink-0" />;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          icon={Calendar}
          title="Content Planning"
          description="Today + 30 days"
          gradientFrom="from-teal-500/10"
          gradientVia="via-emerald-500/10"
          gradientTo="to-green-500/10"
          iconFrom="from-teal-500"
          iconTo="to-emerald-600"
        >
            {isGenerating && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Generating content...</span>
              </div>
            )}
            {project && (
              <AutoPublishSettings
                projectId={project.id}
                onSettingsChange={(s) => {
                  setLiveFrequency(s.frequency);
                  setAutoPublishOn(s.enabled);
                }}
                onFrequencyChanged={async () => {
                  await fetchScheduledItems();
                }}
              />
            )}
        </PageHeader>

        <Card className="p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-primary/10">
              <MessageSquare className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs sm:text-sm font-medium text-primary">{totalAnswers} AEO</span>
            </div>
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10">
              <FileText className="h-3.5 w-3.5 text-emerald-600" />
              <span className="text-xs sm:text-sm font-medium text-emerald-700">{totalArticles} Auto SEO</span>
            </div>
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-orange-500/10">
              <MapPin className="h-3.5 w-3.5 text-orange-600" />
              <span className="text-xs sm:text-sm font-medium text-orange-700">{totalLocal} Local AEO</span>
            </div>
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-violet-500/10">
              <Globe className="h-3.5 w-3.5 text-violet-600" />
              <span className="text-xs sm:text-sm font-medium text-violet-700">{totalGeo} GEO</span>
            </div>
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-pink-500/10">
              <ShoppingCart className="h-3.5 w-3.5 text-pink-600" />
              <span className="text-xs sm:text-sm font-medium text-pink-700">{totalShopping} Shopping</span>
            </div>
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-primary/10">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs sm:text-sm font-medium text-primary">{publishedItems} Published</span>
            </div>
          </div>
        </Card>

        <div className="flex flex-col lg:grid lg:grid-cols-3 gap-4 sm:gap-6">
          <Card className="lg:col-span-2 p-2 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-6">
              <div>
                <h2 className="text-base sm:text-xl font-semibold">Content Calendar</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  {format(visibleStart, "d MMM", { locale: enUS })} – {format(visibleEnd, "d MMM yyyy", { locale: enUS })}
                  {previewItems.length > 0 && (
                    <span className="ml-2 inline-flex items-center gap-1 text-[10px]">
                      · <span className="inline-block w-2 h-2 rounded border border-dashed border-muted-foreground" /> {previewItems.length} preview ({liveFrequency.replace("_", "/")})
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex border rounded-lg overflow-hidden">
                  <Button variant="ghost" size="sm" onClick={() => setWeekOffset(Math.max(0, weekOffset - 4))} disabled={weekOffset === 0} className="rounded-none h-8 w-8 p-0">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setWeekOffset(0)} disabled={weekOffset === 0} className="rounded-none text-xs px-2 h-8">
                    Today
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setWeekOffset(weekOffset + 4)} className="rounded-none h-8 w-8 p-0">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex border rounded-lg overflow-hidden">
                  <Button variant={monthViewMode === "calendar" ? "default" : "ghost"} size="sm" onClick={() => setMonthViewMode("calendar")} className="rounded-none h-8 w-8 p-0">
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                  <Button variant={monthViewMode === "list" ? "default" : "ghost"} size="sm" onClick={() => setMonthViewMode("list")} className="rounded-none h-8 w-8 p-0">
                    <List className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {monthViewMode === "calendar" ? (
              <>
                <div className="grid grid-cols-7 gap-0.5 sm:gap-1 mb-1 sm:mb-2">
                  {["M", "T", "W", "T", "F", "S", "S"].map((day, i) => (
                    <div key={i} className="text-center text-[10px] sm:text-sm font-medium text-muted-foreground py-1 sm:py-2">
                      <span className="hidden sm:inline">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i]}</span>
                      <span className="sm:hidden">{day}</span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
                  {Array.from({ length: (visibleStart.getDay() + 6) % 7 }).map((_, i) => (
                    <div key={`empty-${i}`} className="h-16 sm:h-24 p-0.5" />
                  ))}
                  {visibleDays.map((day) => {
                    const items = getItemsForDate(day);
                    const hasItems = items.length > 0;
                    const isSelected = selectedDate && format(day, "yyyy-MM-dd") === format(selectedDate, "yyyy-MM-dd");
                    return (
                      <button
                        key={day.toISOString()}
                        onClick={() => handleDayClick(day)}
                        className={cn(
                          "h-16 sm:h-28 p-1 sm:p-2 rounded-md sm:rounded-lg border transition-all text-left hover:bg-muted/50 flex flex-col",
                          isToday(day) && "border-primary ring-1 ring-primary/20",
                          isSelected && "bg-primary/10 border-primary",
                          hasItems && "hover:shadow-md cursor-pointer"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className={cn("text-[10px] sm:text-sm font-semibold w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full", isToday(day) && "bg-primary text-primary-foreground")}>
                            {format(day, "d")}
                          </span>
                          {hasItems && (
                            <Badge variant="secondary" className="text-[8px] sm:text-[9px] h-3.5 sm:h-4 px-1">
                              {items.length}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-0.5 sm:mt-1 flex-1 overflow-hidden space-y-0.5">
                          {items.slice(0, window.innerWidth < 640 ? 1 : 2).map((item) => (
                            <div
                              key={item.id}
                              className={cn(
                                "text-[8px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 rounded truncate font-medium flex items-center gap-0.5 sm:gap-1",
                                item.type === "answer" ? "bg-primary/10 text-primary" : item.type === "local" ? "bg-orange-500/20 text-orange-700" : item.type === "geo" ? "bg-violet-500/20 text-violet-700" : "bg-emerald-500/20 text-emerald-700",
                                item.isPreview && "opacity-60 border border-dashed border-current bg-transparent"
                              )}
                            >
                              {item.type === "answer" ? <MessageSquare className="h-2 w-2 sm:h-2.5 sm:w-2.5 shrink-0" /> : item.type === "local" ? <MapPin className="h-2 w-2 sm:h-2.5 sm:w-2.5 shrink-0" /> : item.type === "geo" ? <Globe className="h-2 w-2 sm:h-2.5 sm:w-2.5 shrink-0" /> : <FileText className="h-2 w-2 sm:h-2.5 sm:w-2.5 shrink-0" />}
                              <span className="truncate hidden sm:inline">{item.title.slice(0, 20)}...</span>
                            </div>
                          ))}
                          {items.length > 2 && <span className="text-[8px] sm:text-[10px] text-muted-foreground font-medium hidden sm:block">+{items.length - 2}</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {rangeDays.map((day) => {
                  const items = getItemsForDate(day);
                  if (items.length === 0) return null;
                  return (
                    <div key={day.toISOString()} className="border rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="font-semibold text-sm">{format(day, "EEEE, MMMM d, yyyy", { locale: enUS })}</span>
                        <Badge variant="secondary" className="text-xs">
                          {items.length}
                        </Badge>
                      </div>
                      <div className="space-y-2">
                        {items.map((item) => (
                          <div key={item.id} className="flex items-center justify-between p-2 rounded bg-muted/50 hover:bg-muted transition-colors">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              {getItemIcon(item)}
                              <Badge variant="outline" className={cn("text-[10px] shrink-0", getOriginColor(item.origin))}>{item.origin}</Badge>
                              <span className="text-sm truncate">{item.title}</span>
                              {item.status === "published" && (
                                <Badge className="bg-primary/10 text-primary border-primary/20 text-xs shrink-0">
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  Published
                                </Badge>
                              )}
                              {item.publishedUrl && (
                                <a href={item.publishedUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-primary truncate max-w-[200px] shrink-0 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                  <ExternalLink className="h-3 w-3 shrink-0" />
                                  <span className="truncate">{item.publishedUrl.replace(/^https?:\/\//, '')}</span>
                                </a>
                              )}
                            </div>
                            {item.status !== "published" && (
                              hasIntegration ? (
                                <Button variant="ghost" size="sm" onClick={() => handlePublishNow(item)} disabled={publishingId === item.id}>
                                  {publishingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                                </Button>
                              ) : (
                                <Button variant="ghost" size="sm" onClick={() => window.location.href = "/integrations"} title="Connect a CMS first">
                                  <Link2 className="h-4 w-4" />
                                </Button>
                              )
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className="p-3 sm:p-6 hidden lg:block">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Next 30 Days ({getUpcomingItems().length})
            </h3>
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {getUpcomingItems().slice(0, 20).map((item) => (
                <div key={item.id} className="p-3 rounded-lg border hover:border-primary/50 transition-colors">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {getItemIcon(item)}
                      <span className="text-sm font-medium truncate">{item.title}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className={cn("text-[10px]", getOriginColor(item.origin))}>{item.origin}</Badge>
                    {item.publishedUrl && (
                      <a href={item.publishedUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-muted-foreground hover:text-primary truncate flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                        <span className="truncate">{item.publishedUrl.replace(/^https?:\/\//, '')}</span>
                      </a>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{format(item.date, "MMM d, yyyy")}</span>
                    {item.status === "published" ? (
                      <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Published
                      </Badge>
                    ) : (
                      hasIntegration ? (
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handlePublishNow(item)} disabled={publishingId === item.id}>
                          {publishingId === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3 mr-1" />}
                          Publish
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => window.location.href = "/integrations"}>
                          <Link2 className="h-3 w-3 mr-1" />
                          Connect CMS
                        </Button>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Dialog open={showDayPopup} onOpenChange={setShowDayPopup}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[80vh] overflow-y-auto rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              {selectedDate && format(selectedDate, "EEEE, MMMM d, yyyy", { locale: enUS })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-4">
            {selectedDayItems.map((item) => (
              <Card key={item.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      {getItemIcon(item)}
                      <Badge variant="outline" className={cn("text-[10px]", getOriginColor(item.origin))}>{item.origin}</Badge>
                      <h4 className="font-semibold text-sm">{item.title}</h4>
                    </div>
                    {item.answer && (
                      <div className="mb-2">
                        <p className="text-sm text-muted-foreground line-clamp-2">{item.answer.split(/\*\*(?:Références|References|Sources)\s*:?\s*\*\*/i)[0]}</p>
                        {/\*\*(?:Références|References|Sources)\s*:?\s*\*\*/i.test(item.answer) && (
                          <div className="mt-2">
                            <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-600">
                              <FileText className="h-2.5 w-2.5 mr-1" />
                              Sources
                            </Badge>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {item.score !== null && item.score !== undefined && (
                        <Badge variant="outline" className={item.score >= 80 ? "border-primary text-primary" : item.score >= 60 ? "border-amber-500 text-amber-600" : ""}>
                          {item.score}%
                        </Badge>
                      )}
                      {item.highCitation && <Badge className="bg-emerald-500/20 text-emerald-500 border-0">High Citation</Badge>}
                      {item.status === "published" && (
                        <Badge className="bg-primary/10 text-primary border-primary/20">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Published
                        </Badge>
                      )}
                      {item.publishedUrl && (
                        <a href={item.publishedUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
                          <ExternalLink className="h-3 w-3" />
                          {item.publishedUrl.replace(/^https?:\/\//, '')}
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    {item.status !== "published" && (
                      hasIntegration ? (
                        <Button size="sm" onClick={() => {
                          if (canPublish) {
                            if (canPublishFree && freePublishKey) {
                              localStorage.setItem(freePublishKey, "true");
                            }
                            handlePublishNow(item);
                          } else {
                            toast.error("You've used your free publish. Upgrade to publish the remaining 29 articles.", { action: { label: "Upgrade", onClick: () => window.location.href = "/checkout" } });
                          }
                        }} disabled={publishingId === item.id || !canPublish} className={cn("text-white", canPublishFree && !isSubscribed ? "bg-emerald-600 hover:bg-emerald-700" : "bg-[hsl(222,47%,11%)] hover:bg-[hsl(222,47%,15%)]")}>
                          {publishingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}
                          {canPublishFree && !isSubscribed ? "Publish Free ✨" : "Publish"}
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => window.location.href = "/integrations"} className="text-xs">
                          <Link2 className="h-4 w-4 mr-1" />
                          Connect CMS
                        </Button>
                      )
                    )}
                    {item.publishedUrl && (
                      <Button variant="outline" size="sm" onClick={() => window.open(item.publishedUrl, "_blank")} className="text-xs">
                        <ExternalLink className="h-3.5 w-3.5 mr-1" />
                        {(() => { try { return new URL(item.publishedUrl).hostname; } catch { return "View"; } })()}
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

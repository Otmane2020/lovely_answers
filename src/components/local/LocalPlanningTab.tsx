"use client";
import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  CheckCircle2,
  Clock,
  Send,
  Loader2,
  LayoutGrid,
  List,
} from "lucide-react";
import { addDays, eachDayOfInterval, format, isToday } from "date-fns";
import { enUS, fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useLocalAnswers, LocalAnswer } from "@/hooks/useLocalAnswers";
import { useActiveProject } from "@/hooks/useProjects";
import { ScoreRing } from "@/components/ui/score-ring";

interface LocalPlanningTabProps {
  businessName: string;
  businessId: string;
}

export function LocalPlanningTab({ businessName, businessId }: LocalPlanningTabProps) {
  const { project } = useActiveProject();
  const { data: answers = [], refetch } = useLocalAnswers(businessId);
  
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showDayPopup, setShowDayPopup] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);

  const language = project?.language || "en";
  const locale = language === "fr" ? fr : enUS;

  // Calculate visible range (28 days = 4 weeks)
  const visibleStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return addDays(d, weekOffset * 7);
  }, [weekOffset]);

  const visibleEnd = useMemo(() => addDays(visibleStart, 27), [visibleStart]);

  const visibleDays = useMemo(
    () => eachDayOfInterval({ start: visibleStart, end: visibleEnd }),
    [visibleStart, visibleEnd]
  );

  // Get answers scheduled for a specific date
  const getItemsForDate = (date: Date): LocalAnswer[] => {
    const key = format(date, "yyyy-MM-dd");
    return answers.filter(
      (a) => a.scheduled_date && format(new Date(a.scheduled_date), "yyyy-MM-dd") === key
    );
  };

  const isPublished = (a: LocalAnswer) => Boolean(a.published_url) || Boolean(a.published_at);

  const handleDayClick = (date: Date) => {
    const items = getItemsForDate(date);
    if (items.length > 0) {
      setSelectedDate(date);
      setShowDayPopup(true);
    }
  };

  const handlePublish = async (answer: LocalAnswer) => {
    if (!project) return;
    
    setPublishingId(answer.id);
    try {
      // Get integration — prefer Google My Business if connected
      const { data: integrations } = await supabase
        .from("integrations")
        .select("*")
        .eq("project_id", project.id)
        .eq("is_connected", true);

      if (!integrations || integrations.length === 0) {
        // Just mark as public without CMS
        await supabase
          .from("local_answers")
          .update({
            is_public: true,
            published_at: new Date().toISOString(),
          })
          .eq("id", answer.id);
        
        toast.success("Marked as published!");
        refetch();
        return;
      }

      const gmb = integrations.find((i: any) => i.platform === "google_business");
      const integration = gmb || integrations[0];

      let publishedUrl: string | null = null;

      if (integration.platform === "google_business") {
        const { data, error } = await supabase.functions.invoke("gmb-publish-post", {
          body: {
            projectId: project.id,
            content: `${answer.question}\n\n${answer.answer}`,
            type: "UPDATE",
          },
        });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || "Failed to publish to Google Business");
        publishedUrl = data?.results?.[0]?.post?.searchUrl || null;
      } else {
        const { data, error } = await supabase.functions.invoke("cms-publish", {
          body: {
            integrationId: integration.id,
            content: {
              title: answer.question,
              body: `<article><h1>${answer.question}</h1><p>${answer.answer}</p></article>`,
              type: "local-answer",
              sourceId: answer.id,
            },
          },
        });
        if (error) throw error;
        publishedUrl = data?.url || null;
      }

      // Update local answer
      await supabase
        .from("local_answers")
        .update({
          is_public: true,
          published_at: new Date().toISOString(),
          published_url: publishedUrl,
        })
        .eq("id", answer.id);

      toast.success(integration.platform === "google_business" ? "Published to Google Business!" : "Published to CMS!");
      refetch();

    } catch (error) {
      console.error("Error publishing:", error);
      toast.error("Failed to publish");
    } finally {
      setPublishingId(null);
    }
  };

  const scheduledCount = answers.filter((a) => a.scheduled_date && !isPublished(a)).length;
  const publishedCount = answers.filter((a) => isPublished(a)).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Local Content Planning</h2>
          <p className="text-muted-foreground">
            {language === "fr" ? "Calendrier de publication pour" : "Publishing calendar for"} {businessName}
          </p>
        </div>
      </div>

      {/* Stats */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <span className="text-sm font-medium text-muted-foreground">Legend:</span>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-orange-500" />
              <span className="flex items-center gap-1 text-sm">
                <MessageSquare className="h-3.5 w-3.5 text-orange-600" /> Local Q&A
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-500/10">
              <Clock className="h-4 w-4 text-orange-600" />
              <span className="font-medium text-orange-700 dark:text-orange-400">
                {scheduledCount} Scheduled
              </span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span className="font-medium text-emerald-700 dark:text-emerald-400">
                {publishedCount} Published
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Calendar */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-xl font-semibold">Local Content Calendar</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {format(visibleStart, "d MMM yyyy", { locale })} –{" "}
              {format(visibleEnd, "d MMM yyyy", { locale })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setWeekOffset((p) => p - 1)}
              disabled={weekOffset <= 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setWeekOffset(0)}
              disabled={weekOffset === 0}
            >
              {language === "fr" ? "Aujourd'hui" : "Today"}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setWeekOffset((p) => p + 1)}
              disabled={weekOffset >= 12}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <div className="flex border rounded-lg ml-2">
              <Button
                variant={viewMode === "calendar" ? "secondary" : "ghost"}
                size="icon"
                onClick={() => setViewMode("calendar")}
                className="rounded-r-none"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="icon"
                onClick={() => setViewMode("list")}
                className="rounded-l-none"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {viewMode === "calendar" ? (
          <>
            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {(language === "fr" 
                ? ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]
                : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
              ).map((day) => (
                <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {visibleDays.map((day, idx) => {
                const dayItems = getItemsForDate(day);
                const hasContent = dayItems.length > 0;
                const allPublished = hasContent && dayItems.every((i) => isPublished(i));

                return (
                  <button
                    key={idx}
                    onClick={() => handleDayClick(day)}
                    disabled={!hasContent}
                    className={cn(
                      "min-h-[80px] p-2 rounded-lg border transition-all text-left",
                      "disabled:cursor-default disabled:opacity-60",
                      isToday(day) && "ring-2 ring-orange-500",
                      hasContent && "hover:border-orange-500 cursor-pointer",
                      allPublished
                        ? "bg-emerald-500/5"
                        : hasContent
                        ? "bg-orange-50 dark:bg-orange-950/20"
                        : ""
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={cn(
                          "text-sm font-medium",
                          isToday(day) && "text-orange-500 font-bold"
                        )}
                      >
                        {format(day, "d")}
                      </span>
                      {hasContent && (
                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-[10px] px-1.5 py-0",
                            allPublished
                              ? "bg-emerald-500/20 text-emerald-600"
                              : "bg-orange-500/20 text-orange-600"
                          )}
                        >
                          {dayItems.length}
                        </Badge>
                      )}
                    </div>
                    {hasContent && (
                      <div className="space-y-1">
                        {dayItems.slice(0, 2).map((item, i) => (
                          <div
                            key={i}
                            className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded truncate",
                              isPublished(item)
                                ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                                : "bg-orange-500/20 text-orange-700 dark:text-orange-400"
                            )}
                          >
                            {item.question.slice(0, 25)}...
                          </div>
                        ))}
                        {dayItems.length > 2 && (
                          <div className="text-[10px] text-muted-foreground">
                            +{dayItems.length - 2} more
                          </div>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          /* List View */
          <div className="space-y-2">
            {answers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                {language === "fr" ? "Aucun contenu local planifié" : "No scheduled local content yet"}
              </div>
            ) : (
              answers
                .filter((a) => a.scheduled_date)
                .sort((a, b) => 
                  new Date(a.scheduled_date!).getTime() - new Date(b.scheduled_date!).getTime()
                )
                .map((answer) => (
                  <div
                    key={answer.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <ScoreRing score={answer.score} size="sm" />
                      <div>
                        <p className="font-medium text-sm line-clamp-1">{answer.question}</p>
                        <p className="text-xs text-muted-foreground">
                          {answer.scheduled_date &&
                            format(new Date(answer.scheduled_date), "d MMM yyyy", { locale })}
                        </p>
                      </div>
                    </div>
                    <Badge variant={isPublished(answer) ? "default" : "secondary"}>
                      {isPublished(answer) ? "Published" : "Scheduled"}
                    </Badge>
                  </div>
                ))
            )}
          </div>
        )}
      </Card>

      {/* Day Detail Popup */}
      <Dialog open={showDayPopup} onOpenChange={setShowDayPopup}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-orange-500" />
              {selectedDate && format(selectedDate, "EEEE, d MMMM yyyy", { locale })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-4 max-h-[400px] overflow-y-auto">
            {selectedDate &&
              getItemsForDate(selectedDate).map((item) => (
                <div key={item.id} className="p-4 border rounded-lg space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2">
                      <ScoreRing score={item.score} size="sm" />
                      <div>
                        <p className="font-medium text-sm">{item.question}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                          {item.answer}
                        </p>
                      </div>
                    </div>
                    <Badge variant={isPublished(item) ? "default" : "secondary"}>
                      {isPublished(item) ? "Published" : "Scheduled"}
                    </Badge>
                  </div>
                  {!isPublished(item) && (
                    <Button
                      size="sm"
                      onClick={() => handlePublish(item)}
                      disabled={publishingId === item.id}
                      className="w-full gap-2 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600"
                    >
                      {publishingId === item.id ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Publishing...
                        </>
                      ) : (
                        <>
                          <Send className="h-3 w-3" />
                          Publish Now
                        </>
                      )}
                    </Button>
                  )}
                </div>
              ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

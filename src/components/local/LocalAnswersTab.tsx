"use client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { GlassCard } from "@/components/ui/glass-card";
import { ScoreRing } from "@/components/ui/score-ring";
import { Progress } from "@/components/ui/progress";
import {
  MessageSquare,
  Sparkles,
  Copy,
  Check,
  Plus,
  Eye,
  Send,
  Search,
  Loader2,
  Zap,
  Lightbulb,
  Calendar,
  Globe,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useActiveProject } from "@/hooks/useProjects";
import { useLocalAnswers, useCreateLocalAnswer, useGenerate30LocalAnswers, LocalAnswer } from "@/hooks/useLocalAnswers";
import { toast } from "sonner";
import { format } from "date-fns";
import { useSubscriptionContext } from "@/contexts/SubscriptionContext";
import { ContentUpgradeDialog } from "@/components/aeo/ContentUpgradeDialog";
import chatGptLogo from "@/assets/chatgpt-logo.png";
import chatGptIcon from "@/assets/chatgpt-icon.png";

interface Business {
  id: string;
  name: string;
  address: string;
  phone: string;
  website: string;
  rating: number;
  reviewCount: number;
  types: string[];
  openingHours?: string[];
  reviews?: { text: string; rating: number }[];
}

interface LocalAnswersTabProps {
  business: Business;
}

const SUGGESTED_QUESTIONS_EN = [
  "What are your opening hours?",
  "What services do you offer?",
  "How can I contact you?",
  "Where are you located?",
];

const SUGGESTED_QUESTIONS_FR = [
  "Quels sont vos horaires d'ouverture ?",
  "Quels services proposez-vous ?",
  "Comment vous contacter ?",
  "Où êtes-vous situés ?",
];

export function LocalAnswersTab({ business }: LocalAnswersTabProps) {
  const { project } = useActiveProject();
  const { data: answers = [], isLoading, refetch } = useLocalAnswers(business.id);
  const createAnswer = useCreateLocalAnswer();
  const generate30 = useGenerate30LocalAnswers();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewModal, setShowNewModal] = useState(false);
  const [newQuestion, setNewQuestion] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [viewingAnswer, setViewingAnswer] = useState<LocalAnswer | null>(null);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const { isSubscribed } = useSubscriptionContext();

  const language = project?.language || "en";
  const suggestedQuestions = language === "fr" ? SUGGESTED_QUESTIONS_FR : SUGGESTED_QUESTIONS_EN;

  // Generate a single answer
  const generateAnswer = async (question: string) => {
    if (!question.trim() || !project) {
      toast.error("Please enter a question");
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-local-answer", {
        body: {
          projectId: project.id,
          question,
          businessName: business.name,
          location: business.address,
          businessContext: {
            rating: business.rating,
            reviewCount: business.reviewCount,
            types: business.types,
            phone: business.phone,
            website: business.website,
            openingHours: business.openingHours,
            reviews: business.reviews,
          },
        },
      });

      if (error) throw error;

      if (data?.answer) {
        await createAnswer.mutateAsync({
          question,
          answer: data.answer,
          businessId: business.id,
          businessName: business.name,
          score: 85,
        });
        setNewQuestion("");
        setShowNewModal(false);
      }
    } catch (error) {
      console.error("Error generating answer:", error);
      toast.error("Failed to generate answer");
    } finally {
      setIsGenerating(false);
    }
  };

  // Generate 30 local Q&A
  const generate30LocalAnswers = async () => {
    if (!project) return;

    setGenerationProgress(0);
    const progressInterval = setInterval(() => {
      setGenerationProgress((prev) => Math.min(prev + 3, 90));
    }, 1000);

    try {
      await generate30.mutateAsync({
        businessId: business.id,
        businessName: business.name,
        businessAddress: business.address,
        businessContext: {
          rating: business.rating,
          reviewCount: business.reviewCount,
          types: business.types,
          phone: business.phone,
          website: business.website,
          openingHours: business.openingHours,
          reviews: business.reviews,
        },
      });
      setGenerationProgress(100);
      refetch();
    } finally {
      clearInterval(progressInterval);
      setTimeout(() => setGenerationProgress(0), 1500);
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
        toast.error("No CMS connected. Go to Integrations to connect.");
        return;
      }

      const gmb = integrations.find((i: any) => i.platform === "google_business");
      const integration = gmb || integrations[0];

      let publishedUrl: string | null = null;

      if (integration.platform === "google_business") {
        // Publish to GMB via dedicated edge function
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

  const handleCopy = async (answer: LocalAnswer) => {
    await navigator.clipboard.writeText(`Q: ${answer.question}\n\nA: ${answer.answer}`);
    setCopiedId(answer.id);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredAnswers = answers.filter(
    (a) =>
      a.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isPublished = (a: LocalAnswer) => Boolean(a.published_url) || Boolean(a.published_at);

  const scheduledCount = answers.filter((a) => a.scheduled_date && !isPublished(a)).length;
  const publishedCount = answers.filter((a) => isPublished(a)).length;

  return (
    <div className="space-y-6">
      {/* ChatGPT Logo + Badge - Same as Answers.tsx */}
      <div className="flex items-center gap-3">
        <img src={chatGptLogo as unknown as string} alt="ChatGPT" className="h-16 w-auto" />
        <Badge className="bg-gradient-to-r from-orange-500 to-red-500 text-white border-0 font-bold text-sm px-3 py-1">
          Local Rank First!
        </Badge>
      </div>

      {/* Hero Header - Same style as Answers.tsx */}
      <div className="rounded-xl bg-gradient-to-r from-orange-500/10 via-red-500/10 to-amber-500/10 p-6 border border-border/50">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <img src={chatGptIcon as unknown as string} alt="ChatGPT" className="h-10 w-10 rounded-lg" />
              <h1 className="text-3xl font-bold tracking-tight">Local Q&A</h1>
            </div>
            <p className="text-muted-foreground">
              AI-optimized answers for {business.name}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => setShowNewModal(true)}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              New Answer
            </Button>
            <Button
              onClick={generate30LocalAnswers}
              disabled={generate30.isPending}
              className="gap-2 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600"
            >
              {generate30.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4" />
                  30 Q/A (30 days)
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      {generationProgress > 0 && (
        <div className="rounded-lg bg-background/80 backdrop-blur-sm border px-4 py-3">
          <div className="flex items-center gap-4">
            <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
            <div className="flex-1">
              <Progress value={generationProgress} className="h-2" />
            </div>
            <span className="text-sm font-medium">{generationProgress}%</span>
          </div>
        </div>
      )}

      {/* Stats Bar */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search local answers..."
              className="pl-10"
            />
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-500/10">
              <Calendar className="h-4 w-4 text-orange-600" />
              <span className="font-medium text-orange-700 dark:text-orange-400">
                {scheduledCount} Scheduled
              </span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10">
              <Globe className="h-4 w-4 text-emerald-600" />
              <span className="font-medium text-emerald-700 dark:text-emerald-400">
                {publishedCount} Published
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Answers Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredAnswers.length === 0 ? (
        <Card className="p-12 text-center">
          <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="text-lg font-medium mb-2">No local answers yet</h3>
          <p className="text-muted-foreground mb-4">
            Generate your first local Q&A to optimize for AI search
          </p>
          <Button onClick={() => setShowNewModal(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Create First Answer
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredAnswers.map((answer) => (
            <GlassCard key={answer.id} hover className="p-4 cursor-pointer" onClick={() => {
                if (!isSubscribed) { setShowUpgradeDialog(true); return; }
                setViewingAnswer(answer);
              }}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <h4 className="font-medium line-clamp-2 flex-1">{answer.question}</h4>
                <ScoreRing score={answer.score} size="sm" />
              </div>
              {isSubscribed ? (
                <p className="text-sm text-muted-foreground line-clamp-3 mb-4">
                  {answer.answer}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground line-clamp-1 mb-4">
                  {answer.answer.substring(0, 80)}…
                </p>
              )}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge 
                    variant="secondary" 
                    className={isPublished(answer) ? "bg-emerald-500/20 text-emerald-600" : "bg-orange-500/20 text-orange-600"}
                  >
                    {isPublished(answer)
                      ? "Published"
                      : answer.scheduled_date
                        ? `${format(new Date(answer.scheduled_date), "MMM d")}`
                        : "Draft"}
                  </Badge>
                </div>
                <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setViewingAnswer(answer)}
                    className="h-8 w-8"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleCopy(answer)}
                    className="h-8 w-8"
                  >
                    {copiedId === answer.id ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {/* New Answer Modal */}
      <Dialog open={showNewModal} onOpenChange={setShowNewModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-orange-500" />
              Generate Local Answer
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Textarea
              value={newQuestion}
              onChange={(e) => setNewQuestion(e.target.value)}
              placeholder={language === "fr" ? "Entrez une question sur votre entreprise..." : "Enter a question about your business..."}
              rows={3}
            />
            <div>
              <p className="text-sm text-muted-foreground mb-2 flex items-center gap-2">
                <Lightbulb className="h-4 w-4" />
                Quick suggestions:
              </p>
              <div className="flex flex-wrap gap-2">
                {suggestedQuestions.map((q, i) => (
                  <Badge
                    key={i}
                    variant="secondary"
                    className="cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => setNewQuestion(q)}
                  >
                    {q}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => generateAnswer(newQuestion)}
              disabled={isGenerating || !newQuestion.trim()}
              className="gap-2 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Generate
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Answer Modal */}
      <Dialog open={!!viewingAnswer} onOpenChange={() => setViewingAnswer(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {viewingAnswer && (
            <>
              <DialogHeader>
                <DialogTitle>{viewingAnswer.question}</DialogTitle>
              </DialogHeader>
              <div className="py-4">
                <div className="flex items-center gap-4 mb-4">
                  <ScoreRing score={viewingAnswer.score} size="md" />
                  <div>
                    <p className="text-sm font-medium">AEO Score</p>
                    <p className="text-xs text-muted-foreground">Local optimization</p>
                  </div>
                  {viewingAnswer.scheduled_date && (
                    <Badge variant="outline" className="ml-auto">
                      <Calendar className="h-3 w-3 mr-1" />
                      {format(new Date(viewingAnswer.scheduled_date), "MMM d, yyyy")}
                    </Badge>
                  )}
                </div>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <p>{viewingAnswer.answer}</p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => handleCopy(viewingAnswer)}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy
                </Button>
                {!isPublished(viewingAnswer) && (
                  <Button
                    onClick={() => handlePublish(viewingAnswer)}
                    disabled={publishingId === viewingAnswer.id}
                    className="gap-2 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600"
                  >
                    {publishingId === viewingAnswer.id ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Publishing...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Publish to CMS
                      </>
                    )}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      <ContentUpgradeDialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog} />
    </div>
  );
}

"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { GlassCard } from "@/components/ui/glass-card";
import { ScoreRing } from "@/components/ui/score-ring";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Filter, Plus, Eye, Pencil, Newspaper, ExternalLink, Copy, Globe, Loader2, RefreshCw, Zap, Send, FileText, Clock, MessageSquare, Lock } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useAnswers, useToggleAnswerPublic } from "@/hooks/useAnswers";
import { usePublishAnswer } from "@/hooks/usePublishAnswer";
import { useActiveProject } from "@/hooks/useProjects";
import { sanitizeHtml } from "@/lib/sanitize";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { CmsConnectPopup } from "@/components/CmsConnectPopup";
import { PageHeader } from "@/components/PageHeader";
import { useSubscriptionContext } from "@/contexts/SubscriptionContext";
import { useUsage } from "@/hooks/useUsage";

import { ContentUpgradeDialog } from "@/components/aeo/ContentUpgradeDialog";
import chatGptLogo from "@/assets/chatgpt-logo.png";
import chatGptIcon from "@/assets/chatgpt-icon.png";

const platforms = ["ChatGPT", "Gemini", "Claude", "Perplexity", "Copilot"];
const LOCKED_ANSWER_TEXT = "Content locked — subscribe to unlock.";

interface Article {
  id: string;
  title: string;
  status: string | null;
  word_count: number | null;
  aeo_score: number | null;
  created_at: string | null;
  linked_answer_id: string | null;
  content?: string | null;
  html_content?: string | null;
  scheduled_date?: string | null;
}

export default function Answers() {
  const router = useRouter();
  const { user } = useAuth();
  const { project } = useActiveProject();
  const { data: answers = [], isLoading, refetch } = useAnswers();
  const togglePublic = useToggleAnswerPublic();
  const publishAnswer = usePublishAnswer();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [showHighCitation, setShowHighCitation] = useState(false);
  const [showPublishedOnly, setShowPublishedOnly] = useState(false);
  const [viewingAnswer, setViewingAnswer] = useState<typeof answers[0] | null>(null);
  const [activeTab, setActiveTab] = useState("answers");

  // Articles state
  const [articles, setArticles] = useState<Article[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(false);

  // Progress bar state
  const [generationProgress, setGenerationProgress] = useState(0);
  const [isGeneratingWithProgress, setIsGeneratingWithProgress] = useState(false);

  // New Answer Modal State
  const [showNewAnswerModal, setShowNewAnswerModal] = useState(false);
  const [newQuestion, setNewQuestion] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [regeneratingAll, setRegeneratingAll] = useState(false);
  const [generating30, setGenerating30] = useState(false);
  const [unusedKeywordsCount, setUnusedKeywordsCount] = useState(0);
  const [showCmsPopup, setShowCmsPopup] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [generatedArticle, setGeneratedArticle] = useState<{id: string;title: string;html: string;answerId: string;} | null>(null);
  const [viewingArticle, setViewingArticle] = useState<Article | null>(null);
  const [loadingArticleContent, setLoadingArticleContent] = useState(false);
  const [generatingArticleId, setGeneratingArticleId] = useState<string | null>(null);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const { isSubscribed } = useSubscriptionContext();
  const { canGenerateArticle, articlesLimit, articlesThisMonth, refetch: refetchUsage } = useUsage();


  const isAnswerLocked = (answer: typeof answers[0]) => !answer.answer || answer.answer === LOCKED_ANSWER_TEXT;

  useEffect(() => {
    const unlockLockedContent = async () => {
      if (!isSubscribed || answers.length === 0 || !answers.some(isAnswerLocked)) return;

      try {
        const { data: { session } } = await supabase.auth.getSession();
        await supabase.functions.invoke("unlock-articles", {
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        });
        window.setTimeout(() => refetch(), 6000);
      } catch (error) {
        console.error("Error unlocking paid content:", error);
      }
    };

    unlockLockedContent();
  }, [isSubscribed, answers, refetch]);

  // Fetch articles
  useEffect(() => {
    const fetchArticles = async () => {
      if (!project) return;
      setLoadingArticles(true);
      try {
        const { data, error } = await supabase.
        from("articles").
        select("id, title, status, word_count, aeo_score, created_at, linked_answer_id, content, html_content, scheduled_date").
        eq("project_id", project.id).
        order("created_at", { ascending: false });

        if (error) throw error;
        setArticles(data || []);
      } catch (error) {
        console.error("Error fetching articles:", error);
      } finally {
        setLoadingArticles(false);
      }
    };
    fetchArticles();
  }, [project]);

  const handlePublishToCms = async (answerId: string) => {
    if (!project) {
      toast.error("No active project");
      return;
    }
    setPublishingId(answerId);
    try {
      await publishAnswer.mutateAsync({ answerId, projectId: project.id });
    } finally {
      setPublishingId(null);
    }
  };

  // Fetch unused keywords count
  useEffect(() => {
    const fetchKeywordsCount = async () => {
      if (!user) return;
      const { data: projects } = await supabase.
      from("projects").
      select("id").
      eq("user_id", user.id).
      eq("is_active", true).
      limit(1);

      if (projects && projects.length > 0) {
        const { count } = await supabase.
        from("keywords").
        select("id", { count: 'exact', head: true }).
        eq("project_id", projects[0].id).
        eq("is_used", false);

        setUnusedKeywordsCount(count || 0);
      }
    };
    fetchKeywordsCount();
  }, [user]);

  const filteredAnswers = answers.filter((answer) => {
    const matchesSearch = answer.question.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPlatform = selectedPlatforms.length === 0 || selectedPlatforms.some((p) => answer.platforms?.includes(p));
    const matchesHighCitation = !showHighCitation || answer.high_citation;
    const matchesPublished = !showPublishedOnly || answer.is_public;
    return matchesSearch && matchesPlatform && matchesHighCitation && matchesPublished;
  });

  const filteredArticles = articles.filter((article) => {
    return article.title.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const handleTogglePublish = (id: string, currentState: boolean) => {
    togglePublic.mutate({ id, isPublic: !currentState });
  };

  const handleViewAnswer = (answer: typeof answers[0]) => {
    if (!isSubscribed) {setShowUpgradeDialog(true);return;}
    if (isAnswerLocked(answer)) {toast.info("Content is being prepared. Please refresh in a moment.");return;}
    setViewingAnswer(answer);
  };

  const handleEditAnswer = (answerId: string) => {
    router.push(`/answers/${answerId}/edit`);
  };

  const handleGenerateArticle = async (answerId: string) => {
    if (!project) {
      toast.error("No active project");
      return;
    }
    if (!canGenerateArticle) {
      toast.error(
        `Monthly article limit reached (${articlesThisMonth}/${articlesLimit ?? "∞"}). Upgrade to keep generating.`,
        { action: { label: "Upgrade", onClick: () => router.push("/pricing") } }
      );
      return;
    }


    setGeneratingArticleId(answerId);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      const { data, error } = await supabase.functions.invoke("generate-aeo-article", {
        body: {
          answerId,
          language: project.language || "fr"
        },
        headers: {
          Authorization: `Bearer ${session?.access_token}`
        }
      });

      if (error) throw error;

      if (data?.article && data?.html) {
        setGeneratedArticle({
          id: data.article.id,
          title: data.article.title,
          html: data.html,
          answerId
        });
      }

      toast.success("Article generated!");
      refetch();
    } catch (error) {
      console.error("Error generating article:", error);
      toast.error("Failed to generate article");
    } finally {
      setGeneratingArticleId(null);
    }
  };

  const handlePublishGeneratedArticle = async () => {
    if (!generatedArticle || !project) return;

    setPublishingId(generatedArticle.answerId);
    try {
      await publishAnswer.mutateAsync({
        answerId: generatedArticle.answerId,
        projectId: project.id
      });
      setGeneratedArticle(null);
    } finally {
      setPublishingId(null);
    }
  };

  const handleViewPublic = (answer: typeof answers[0]) => {
    const url = answer.published_url || `/answers/${answer.slug}`;
    window.open(url, "_blank");
  };

  const handleCopyLink = (answer: typeof answers[0]) => {
    const publicUrl = answer.published_url || `${window.location.origin}/answers/${answer.slug}`;
    navigator.clipboard.writeText(publicUrl);
    toast.success("Link copied to clipboard!");
  };

  const handleGenerateNewAnswer = async () => {
    if (!newQuestion.trim() || !user) return;

    setIsGenerating(true);
    try {
      const { data: projects } = await supabase.
      from("projects").
      select("*").
      eq("user_id", user.id).
      eq("is_active", true).
      limit(1);

      if (!projects || projects.length === 0) {
        toast.error("No active project found");
        return;
      }

      const proj = projects[0];

      const { data, error } = await supabase.functions.invoke("generate-aeo-answers", {
        body: {
          projectId: proj.id,
          questions: [newQuestion],
          businessContext: {
            name: proj.brand_name || proj.name,
            description: proj.business_description,
            audience: proj.audience,
            language: proj.language
          }
        }
      });

      if (error) throw error;

      toast.success("Answer generated successfully!");
      setShowNewAnswerModal(false);
      setNewQuestion("");
      refetch();
    } catch (error) {
      console.error("Error generating answer:", error);
      toast.error("Failed to generate answer");
    } finally {
      setIsGenerating(false);
    }
  };

  const regenerateAllAnswers = async () => {
    if (!user) return;
    if (!canGenerateArticle) {
      toast.error(
        `Monthly article limit reached (${articlesThisMonth}/${articlesLimit ?? "∞"}). Upgrade to keep generating.`,
        { action: { label: "Upgrade", onClick: () => router.push("/pricing") } }
      );
      return;
    }

    setRegeneratingAll(true);
    setIsGeneratingWithProgress(true);
    setGenerationProgress(0);


    try {
      const { data: { session } } = await supabase.auth.getSession();

      const { data: projects } = await supabase.
      from("projects").
      select("*").
      eq("user_id", user.id).
      eq("is_active", true).
      limit(1);

      if (!projects || projects.length === 0) {
        toast.error("No active project found");
        setRegeneratingAll(false);
        setIsGeneratingWithProgress(false);
        return;
      }

      const proj = projects[0];

      const progressInterval = setInterval(() => {
        setGenerationProgress((prev) => Math.min(prev + 10, 90));
      }, 500);

      const { data: unusedKeywords } = await supabase.
      from("keywords").
      select("id, keyword").
      eq("project_id", proj.id).
      eq("is_used", false).
      limit(10);

      const hasUnusedKeywords = unusedKeywords && unusedKeywords.length > 0;

      toast.info(hasUnusedKeywords ?
      `Generating ${unusedKeywords.length} new answers from keywords...` :
      "Generating new answers from project context...");

      const { data, error } = await supabase.functions.invoke('auto-generate-aeo', {
        body: {
          projectId: proj.id,
          useKeywords: true,
          language: proj.language || 'fr'
        },
        headers: {
          Authorization: `Bearer ${session?.access_token}`
        }
      });

      clearInterval(progressInterval);
      setGenerationProgress(100);

      if (error) {
        console.error('Error generating answers:', error);
        toast.error("Error during generation");
      } else {
        const count = data?.count || data?.answers?.length || 0;
        toast.success(`${count} new answers generated!`);
      }

      refetch();
    } catch (error) {
      console.error('Error regenerating all answers:', error);
      toast.error("Error during regeneration");
    } finally {
      setRegeneratingAll(false);
      setTimeout(() => {
        setIsGeneratingWithProgress(false);
        setGenerationProgress(0);
      }, 1000);
    }
  };

  const generate30Answers = async () => {
    if (!user) return;
    if (!canGenerateArticle) {
      toast.error(
        `Monthly article limit reached (${articlesThisMonth}/${articlesLimit ?? "∞"}). Upgrade to keep generating.`,
        { action: { label: "Upgrade", onClick: () => router.push("/pricing") } }
      );
      return;
    }

    setGenerating30(true);
    setIsGeneratingWithProgress(true);
    setGenerationProgress(0);


    try {
      const { data: { session } } = await supabase.auth.getSession();

      const { data: projects } = await supabase.
      from("projects").
      select("*").
      eq("user_id", user.id).
      eq("is_active", true).
      order("created_at", { ascending: false });

      if (!projects || projects.length === 0) {
        toast.error("No active project found");
        setGenerating30(false);
        setIsGeneratingWithProgress(false);
        return;
      }

      let projectWithKeywords = null;
      for (const p of projects) {
        const { count } = await supabase.
        from("keywords").
        select("*", { count: "exact", head: true }).
        eq("project_id", p.id);

        if (count && count > 0) {
          projectWithKeywords = p;
          break;
        }
      }

      const activeProject = projectWithKeywords || projects[0];

      toast.info("Generating 30 Q/A + 30 Articles over 30 days...");

      const progressInterval = setInterval(() => {
        setGenerationProgress((prev) => Math.min(prev + 3, 90));
      }, 1000);

      const { data, error } = await supabase.functions.invoke('generate-30-days-content', {
        body: {
          projectId: activeProject.id,
          days: 30,
          language: activeProject.language || 'fr'
        },
        headers: {
          Authorization: `Bearer ${session?.access_token}`
        }
      });

      clearInterval(progressInterval);
      setGenerationProgress(100);

      if (error) {
        console.error('Error generating content:', error);
        toast.error("Error during generation");
      } else {
        toast.success(`${data?.answers_created || 0} answers + ${data?.articles_created || 0} articles scheduled!`);
        setShowCmsPopup(true);
      }

      refetch();
      if (project) {
        const { data: newArticles } = await supabase.
        from("articles").
        select("id, title, status, word_count, aeo_score, created_at, linked_answer_id").
        eq("project_id", project.id).
        order("created_at", { ascending: false });
        setArticles(newArticles || []);
      }
    } catch (error) {
      console.error('Error generating content:', error);
      toast.error("Error during generation");
    } finally {
      setGenerating30(false);
      setTimeout(() => {
        setIsGeneratingWithProgress(false);
        setGenerationProgress(0);
      }, 1000);
    }
  };

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case 'published':return 'bg-emerald-500/20 text-emerald-500';
      case 'draft':return 'bg-amber-500/20 text-amber-500';
      default:return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Hero Header */}
        <PageHeader
          icon={MessageSquare}
          title="AEO Answers"
          description="Optimized, citable answers for AI assistants"
          gradientFrom="from-orange-500/10"
          gradientVia="via-red-500/10"
          gradientTo="to-amber-500/10"
          iconFrom="from-orange-500"
          iconTo="to-red-500"
          customIcon={<img src={chatGptIcon as unknown as string} alt="ChatGPT" className="h-10 w-10 rounded-lg" />} />
        


        {/* Progress Bar */}
        {isGeneratingWithProgress &&
        <div className="rounded-lg bg-background/80 backdrop-blur-sm border px-4 py-3">
            <div className="flex items-center gap-4">
              <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
              <div className="flex-1">
                <Progress value={generationProgress} className="h-2" />
              </div>
              <span className="text-sm font-medium">{generationProgress}%</span>
            </div>
          </div>
        }

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="answers" className="gap-2">
              <Globe className="h-4 w-4" />
              AEO Answers ({answers.length})
            </TabsTrigger>
            <TabsTrigger value="articles" className="gap-2">
              <FileText className="h-4 w-4" />
              Articles ({articles.length})
            </TabsTrigger>
          </TabsList>

          {/* Search and Filters */}
          <div className="flex flex-wrap items-center gap-3 mt-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
            </div>
            {activeTab === "answers" &&
            <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="gap-2">
                      <Filter className="h-4 w-4" />
                      Platform
                      {selectedPlatforms.length > 0 && <Badge variant="secondary">{selectedPlatforms.length}</Badge>}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {platforms.map((platform) =>
                  <DropdownMenuCheckboxItem key={platform} checked={selectedPlatforms.includes(platform)} onCheckedChange={(checked) => {
                    if (checked) setSelectedPlatforms([...selectedPlatforms, platform]);else
                    setSelectedPlatforms(selectedPlatforms.filter((p) => p !== platform));
                  }}>{platform}</DropdownMenuCheckboxItem>
                  )}
                    {selectedPlatforms.length > 0 && <><DropdownMenuSeparator /><DropdownMenuItem onClick={() => setSelectedPlatforms([])}>Clear all</DropdownMenuItem></>}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="outline" onClick={() => setShowHighCitation(!showHighCitation)} className={showHighCitation ? "bg-primary text-primary-foreground" : ""}>High Citation</Button>
                <Button variant="outline" onClick={() => setShowPublishedOnly(!showPublishedOnly)} className={showPublishedOnly ? "bg-primary text-primary-foreground" : ""}>Published Only</Button>
              </>
            }
          </div>

          {/* Answers Tab Content */}
          <TabsContent value="answers" className="space-y-4 mt-4">
            {filteredAnswers.map((answer, index) =>
             <GlassCard key={answer.id} hover className="p-4 sm:p-6 cursor-pointer" onClick={() => handleViewAnswer(answer)}>
                <div className="flex items-start gap-4">
                  {(!isSubscribed && index !== 0) || isAnswerLocked(answer) ? (
                    isSubscribed ? (
                      <div className="w-12 h-12 rounded-full border-2 border-primary/30 bg-primary/5 flex items-center justify-center text-primary shrink-0" title="Preparing content…">
                        <Loader2 className="w-4 h-4 animate-spin" />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-full border-2 border-muted flex items-center justify-center text-muted-foreground shrink-0" title="Locked — subscribe to unlock">
                        <Lock className="w-4 h-4" />
                      </div>
                    )
                  ) : (
                    <ScoreRing score={answer.score ?? 0} size="sm" />
                  )}
                  <div className="flex-1 min-w-0 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-semibold text-sm sm:text-base leading-snug">{answer.question}</h3>
                      <div className="flex items-center gap-2 shrink-0">
                        <Switch checked={answer.is_public ?? false} onCheckedChange={() => handleTogglePublish(answer.id, answer.is_public ?? false)} />
                        <span className="text-xs text-muted-foreground">{answer.is_public ? "Public" : "Draft"}</span>
                      </div>
                    </div>
                    {!isSubscribed && index === 0 ?
                  <p className="text-sm text-muted-foreground line-clamp-1">{answer.answer}</p> :
                   isSubscribed && !isAnswerLocked(answer) ?
                  <p className="text-sm text-muted-foreground line-clamp-3">{answer.answer}</p> :
                  null}
                    <div className="flex flex-wrap gap-2">
                      {answer.platforms?.map((p) => <Badge key={p} variant="outline" className="text-xs">{p}</Badge>)}
                      {answer.high_citation && <Badge className="bg-amber-500/20 text-amber-500 border-0 text-xs">High Citation</Badge>}
                      {answer.is_public && <Badge className="bg-emerald-500/20 text-emerald-500 border-0 text-xs">Public</Badge>}
                      {!answer.is_public && answer.scheduled_date &&
                    <Badge variant="secondary" className="text-xs gap-1">
                          <Clock className="h-3 w-3" />
                          Planned: {new Date(answer.scheduled_date).toLocaleDateString()}
                        </Badge>
                    }
                      {answer.has_article && <Badge variant="secondary" className="text-xs">Has Article</Badge>}
                    </div>
                    <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" onClick={() => handleViewAnswer(answer)} className="gap-1"><Eye className="h-3 w-3" />View</Button>
                      {answer.has_article

                    }
                      <Button variant="ghost" size="sm" onClick={() => handleEditAnswer(answer.id)} className="gap-1"><Pencil className="h-3 w-3" />Edit</Button>
                      {!isAnswerLocked(answer) && <Button variant="ghost" size="sm" onClick={() => {
                      const content = `Question: ${answer.question}\n\nAnswer: ${answer.answer}`;
                      navigator.clipboard.writeText(content);
                      toast.success("Answer copied to clipboard!");
                    }} className="gap-1">
                        <Copy className="h-3 w-3" />Copy Answer
                      </Button>}
                      {answer.has_article &&
                    <Button variant="ghost" size="sm" onClick={async () => {
                      const { data: article } = await supabase.
                      from("articles").
                      select("title, content, html_content").
                      eq("id", answer.article_id).
                      single();
                      if (article) {
                        navigator.clipboard.writeText(article.html_content || article.content || "");
                        toast.success("Article HTML copied to clipboard!");
                      }
                    }} className="gap-1">
                          <Copy className="h-3 w-3" />Copy Article
                        </Button>
                    }
                      {answer.is_public &&
                    <>
                          <Button variant="ghost" size="sm" onClick={() => handleViewPublic(answer)} className="gap-1"><ExternalLink className="h-3 w-3" />View Public</Button>
                          <Button variant="ghost" size="sm" onClick={() => handleCopyLink(answer)} className="gap-1"><Copy className="h-3 w-3" />Copy Link</Button>
                        </>
                    }
                    </div>
                  </div>
                </div>
              </GlassCard>
            )}

            {filteredAnswers.length === 0 &&
            <GlassCard className="p-12">
                <div className="text-center space-y-4">
                  <Globe className="h-12 w-12 text-muted-foreground mx-auto opacity-50" />
                  <h3 className="text-lg font-medium">No answers found</h3>
                  <p className="text-muted-foreground">{answers.length === 0 ? "Generate your first AI-ready answer" : "Try adjusting your filters"}</p>
                  <Button onClick={() => setShowNewAnswerModal(true)} className="gap-2 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600">
                    <Plus className="h-4 w-4" />Create Answer
                  </Button>
                </div>
              </GlassCard>
            }
          </TabsContent>

          {/* Articles Tab Content */}
          <TabsContent value="articles" className="space-y-4 mt-4">
            {loadingArticles ?
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div> :
            filteredArticles.length === 0 ?
            <GlassCard className="p-12">
                <div className="text-center space-y-4">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto opacity-50" />
                  <h3 className="text-lg font-medium">No articles found</h3>
                  <p className="text-muted-foreground">Generate articles from your AEO answers</p>
                </div>
              </GlassCard> :

            filteredArticles.map((article, index) =>
            <GlassCard key={article.id} hover className="p-4 sm:p-6 cursor-pointer" onClick={() => {
              if (!isSubscribed) {setShowUpgradeDialog(true);return;}
              setViewingArticle(article);
            }}>
                  <div className="flex items-start gap-4">
                    <div className="shrink-0">
                      <ScoreRing score={article.aeo_score || 0} size="sm" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-semibold text-sm sm:text-base leading-snug">{article.title}</h3>
                        <Badge className={getStatusColor(article.status)}>
                          {article.status || 'draft'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{article.word_count || 0} words</span>
                        <span>•</span>
                        <span>AEO Score: {article.aeo_score || 0}</span>
                        <span>•</span>
                        <span>{new Date(article.created_at || '').toLocaleDateString()}</span>
                      </div>
                      <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" onClick={() => setViewingArticle(article)} className="gap-1">
                          <Eye className="h-3 w-3" />View Article
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => router.push(`/articles/${article.id}/edit`)} className="gap-1">
                          <Pencil className="h-3 w-3" />Edit
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => {
                      const content = article.html_content || article.content || "";
                      navigator.clipboard.writeText(content);
                      toast.success("Article copied to clipboard!");
                    }} className="gap-1">
                          <Copy className="h-3 w-3" />Copy Article
                        </Button>
                      </div>
                    </div>
                  </div>
                </GlassCard>
            )
            }
          </TabsContent>
        </Tabs>
      </div>

      {/* View Answer Dialog */}
      <Dialog open={!!viewingAnswer} onOpenChange={() => setViewingAnswer(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewingAnswer?.question}</DialogTitle>
            <DialogDescription>
              <div className="flex items-center gap-3 mt-2">
                <ScoreRing score={viewingAnswer?.score ?? 0} size="sm" />
                <span>Citation Score: {viewingAnswer?.score ?? 0}</span>
                {viewingAnswer?.is_public && <Badge className="bg-emerald-500/20 text-emerald-500 border-0">Public</Badge>}
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <h4 className="text-sm font-medium mb-2">Answer</h4>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{viewingAnswer?.answer}</p>
            </div>
            {viewingAnswer?.platforms && viewingAnswer.platforms.length > 0 &&
            <div>
                <h4 className="text-sm font-medium mb-2">Target Platforms</h4>
                <div className="flex flex-wrap gap-2">
                  {viewingAnswer.platforms.map((p) => <Badge key={p} variant="outline">{p}</Badge>)}
                </div>
              </div>
            }
          </div>
        </DialogContent>
      </Dialog>

      {/* New Answer Modal */}
      <Dialog open={showNewAnswerModal} onOpenChange={setShowNewAnswerModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate New Answer</DialogTitle>
            <DialogDescription>
              Enter a question and we'll generate an AI-optimized, citable answer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Question</Label>
              <Textarea
                placeholder="Enter a question..."
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                rows={3} />
              
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewAnswerModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleGenerateNewAnswer}
              disabled={!newQuestion.trim() || isGenerating}
              className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600">
              
              {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Generate Answer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generated Article Preview Dialog */}
      <Dialog open={!!generatedArticle} onOpenChange={() => setGeneratedArticle(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Newspaper className="h-5 w-5 text-primary" />
              Article Generated
            </DialogTitle>
            <DialogDescription>
              Preview your AEO-optimized article before publishing to your CMS.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto border rounded-lg bg-background">
            {generatedArticle?.html &&
            <iframe
              srcDoc={generatedArticle.html}
              className="w-full h-[400px] border-0"
              title="Article Preview" />

            }
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setGeneratedArticle(null)}>
              Close
            </Button>
            <Button
              onClick={handlePublishGeneratedArticle}
              disabled={publishingId === generatedArticle?.answerId}
              className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 gap-2">
              
              {publishingId === generatedArticle?.answerId ?
              <Loader2 className="h-4 w-4 animate-spin" /> :

              <Send className="h-4 w-4" />
              }
              Publish to CMS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CMS Connect Popup */}
      <CmsConnectPopup open={showCmsPopup} onOpenChange={setShowCmsPopup} />
      <ContentUpgradeDialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog} />

      {/* View Article Popup */}
      <Dialog open={!!viewingArticle} onOpenChange={() => setViewingArticle(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              {viewingArticle?.title}
            </DialogTitle>
            <DialogDescription>
              <div className="flex items-center gap-4 mt-2">
                <div className="flex items-center gap-2">
                  <ScoreRing score={viewingArticle?.aeo_score || 0} size="sm" />
                  <span>AEO Score: {viewingArticle?.aeo_score || 0}</span>
                </div>
                <span>•</span>
                <span>{viewingArticle?.word_count || 0} words</span>
                {viewingArticle?.scheduled_date &&
                <>
                    <span>•</span>
                    <Badge variant="secondary">
                      Scheduled: {new Date(viewingArticle.scheduled_date).toLocaleDateString()}
                    </Badge>
                  </>
                }
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto border rounded-lg bg-background p-4">
            {viewingArticle?.html_content ?
            <div
              className="prose prose-sm max-w-none dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(viewingArticle.html_content) }} /> :

            viewingArticle?.content ?
            <div className="whitespace-pre-wrap text-sm">{viewingArticle.content}</div> :

            <p className="text-muted-foreground text-center py-8">No content available</p>
            }
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => {
                const content = viewingArticle?.html_content || viewingArticle?.content || "";
                navigator.clipboard.writeText(content);
                toast.success("Article copied to clipboard!");
              }}>
              
              <Copy className="h-4 w-4" />
              Copy Article
            </Button>
            <Button variant="outline" onClick={() => setViewingArticle(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>);

}
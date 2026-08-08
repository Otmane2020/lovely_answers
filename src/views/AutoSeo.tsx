"use client";
import { useState, useEffect } from "react";
import { FileText, Search, Calendar, Loader2, Eye, Pencil, Copy, Clock, ExternalLink, Trash2 } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/glass-card";
import { ScoreRing } from "@/components/ui/score-ring";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useActiveProject } from "@/hooks/useProjects";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeHtml } from "@/lib/sanitize";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useSubscriptionContext } from "@/contexts/SubscriptionContext";
import { ContentUpgradeDialog } from "@/components/aeo/ContentUpgradeDialog";

interface Article {
  id: string;
  title: string;
  status: string;
  word_count: number;
  aeo_score: number | null;
  created_at: string;
  scheduled_date: string | null;
  content?: string | null;
  html_content?: string | null;
}

export default function AutoSeo() {
  const router = useRouter();
  const { project } = useActiveProject();
  const [articles, setArticles] = useState<Article[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [viewingArticle, setViewingArticle] = useState<Article | null>(null);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const { isSubscribed } = useSubscriptionContext();

  useEffect(() => {
    if (!project?.id) return;

    const fetchArticles = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from("articles")
          .select("id, title, status, word_count, aeo_score, created_at, scheduled_date, content, html_content")
          .eq("project_id", project.id)
          .order("scheduled_date", { ascending: true });

        if (error) throw error;

        const today = new Date().toISOString().split("T")[0];
        const sortedData = (data || []).sort((a, b) => {
          const dateA = a.scheduled_date?.split("T")[0] || "";
          const dateB = b.scheduled_date?.split("T")[0] || "";
          if (dateA === today && dateB !== today) return -1;
          if (dateB === today && dateA !== today) return 1;
          return dateA.localeCompare(dateB);
        });
        setArticles(sortedData);
      } catch (error) {
        console.error("Error fetching articles:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchArticles();
  }, [project?.id]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "published":
        return "bg-emerald-500/20 text-emerald-600";
      case "scheduled":
        return "bg-teal-500/20 text-teal-600";
      case "generating":
        return "bg-amber-500/20 text-amber-600";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      draft: "Draft",
      scheduled: "Scheduled",
      published: "Published",
      generating: "Generating",
    };
    return labels[status] || status;
  };

  const filteredArticles = articles.filter((article) => {
    const matchesSearch = article.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTab = activeTab === "all" || article.status === activeTab;
    return matchesSearch && matchesTab;
  });

  const stats = {
    total: articles.length,
    published: articles.filter((a) => a.status === "published").length,
    scheduled: articles.filter((a) => a.status === "scheduled").length,
    avgScore:
      articles.filter((a) => a.aeo_score).length > 0
        ? Math.round(
            articles
              .filter((a) => a.aeo_score)
              .reduce((sum, a) => sum + (a.aeo_score || 0), 0) /
              articles.filter((a) => a.aeo_score).length
          )
        : 0,
  };

  const handleCopyArticle = (article: Article) => {
    const content = article.html_content || article.content || "";
    navigator.clipboard.writeText(content);
    toast.success("Article copied to clipboard!");
  };

  const handleDeleteArticle = async (articleId: string) => {
    try {
      const { error } = await supabase.from("articles").delete().eq("id", articleId);
      if (error) throw error;
      setArticles((prev) => prev.filter((a) => a.id !== articleId));
      toast.success("Article deleted");
    } catch (error) {
      console.error("Error deleting article:", error);
      toast.error("Failed to delete article");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Hero Header */}
        <PageHeader
          icon={FileText}
          title="Auto SEO"
          description="SEO articles auto-generated from your AEO answers"
          gradientFrom="from-emerald-500/10"
          gradientVia="via-teal-500/10"
          gradientTo="to-cyan-500/10"
          iconFrom="from-emerald-500"
          iconTo="to-teal-600"
        >
              <Button variant="outline" onClick={() => router.push("/planning")} className="gap-2">
                <Calendar className="h-4 w-4" />
                Planning
              </Button>
              <Button variant="outline" onClick={() => router.push("/answers")} className="gap-2">
                <ExternalLink className="h-4 w-4" />
                AEO Answers
              </Button>
        </PageHeader>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <GlassCard className="p-4 text-center">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-muted-foreground mt-1">Total Articles</div>
          </GlassCard>
          <GlassCard className="p-4 text-center">
            <div className="text-2xl font-bold text-emerald-600">{stats.published}</div>
            <div className="text-xs text-muted-foreground mt-1">Published</div>
          </GlassCard>
          <GlassCard className="p-4 text-center">
            <div className="text-2xl font-bold text-teal-600">{stats.scheduled}</div>
            <div className="text-xs text-muted-foreground mt-1">Scheduled</div>
          </GlassCard>
          <GlassCard className="p-4 text-center">
            <div className="text-2xl font-bold text-emerald-600">{stats.avgScore}%</div>
            <div className="text-xs text-muted-foreground mt-1">Avg Score</div>
          </GlassCard>
        </div>

        {/* Search & Tabs */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search articles..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="all">All ({articles.length})</TabsTrigger>
              <TabsTrigger value="draft">Drafts</TabsTrigger>
              <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
              <TabsTrigger value="published">Published</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Articles List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
          </div>
        ) : filteredArticles.length === 0 ? (
          <GlassCard className="p-12">
            <div className="text-center space-y-4">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto opacity-50" />
              <h3 className="text-lg font-medium">No articles found</h3>
              <p className="text-muted-foreground">
                {searchQuery
                  ? "No articles match your search"
                  : "Generate AEO answers first, then transform them into SEO articles"}
              </p>
              <Button
                onClick={() => router.push("/answers")}
                className="gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700"
              >
                <ExternalLink className="h-4 w-4" />
                View AEO Answers
              </Button>
            </div>
          </GlassCard>
        ) : (
          <div className="space-y-4">
            {filteredArticles.map((article) => (
              <GlassCard key={article.id} hover className="p-4 sm:p-6 cursor-pointer" onClick={() => {
                if (!isSubscribed) { setShowUpgradeDialog(true); return; }
                setViewingArticle(article);
              }}>
                <div className="flex items-start gap-4">
                  <div className="shrink-0">
                    <ScoreRing score={article.aeo_score || 0} size="sm" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-semibold text-sm sm:text-base leading-snug">
                        {article.title}
                      </h3>
                      <Badge className={getStatusColor(article.status)}>
                        {getStatusLabel(article.status)}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span>{article.word_count || 0} words</span>
                      <span>•</span>
                      <span>AEO Score: {article.aeo_score || 0}%</span>
                      <span>•</span>
                      <span>{format(new Date(article.created_at), "MMM d, yyyy")}</span>
                      {article.scheduled_date && (
                        <>
                          <span>•</span>
                          <Badge variant="secondary" className="text-xs gap-1">
                            <Clock className="h-3 w-3" />
                            {format(new Date(article.scheduled_date), "MMM d")}
                          </Badge>
                        </>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (!isSubscribed) { setShowUpgradeDialog(true); return; }
                          setViewingArticle(article);
                        }}
                        className="gap-1"
                      >
                        <Eye className="h-3 w-3" />
                        View
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/articles/${article.id}/edit`)}
                        className="gap-1"
                      >
                        <Pencil className="h-3 w-3" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopyArticle(article)}
                        className="gap-1"
                      >
                        <Copy className="h-3 w-3" />
                        Copy
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteArticle(article.id)}
                        className="gap-1 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </div>

      {/* View Article Dialog */}
      <Dialog open={!!viewingArticle} onOpenChange={() => setViewingArticle(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-emerald-600" />
              {viewingArticle?.title}
            </DialogTitle>
            <DialogDescription>
              <div className="flex items-center gap-4 mt-2">
                <div className="flex items-center gap-2">
                  <ScoreRing score={viewingArticle?.aeo_score || 0} size="sm" />
                  <span>AEO Score: {viewingArticle?.aeo_score || 0}%</span>
                </div>
                <span>•</span>
                <span>{viewingArticle?.word_count || 0} words</span>
                {viewingArticle?.scheduled_date && (
                  <>
                    <span>•</span>
                    <Badge variant="secondary">
                      Scheduled: {format(new Date(viewingArticle.scheduled_date), "MMM d, yyyy")}
                    </Badge>
                  </>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto border rounded-lg bg-background p-6 sm:p-8">
            {viewingArticle?.html_content || viewingArticle?.content ? (
              <article
                className="editorial-prose max-w-none"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml((viewingArticle.html_content || viewingArticle.content || "")
                  .replace(/^[\s\S]*?<body[^>]*>/i, "")
                  .replace(/<\/body>[\s\S]*$/i, "")
                  .replace(/<!DOCTYPE[^>]*>/i, "")
                  .replace(/<\/?html[^>]*>/gi, "")
                  .replace(/<head>[\s\S]*?<\/head>/i, "")
                  .replace(/<\/?body[^>]*>/gi, "")
                  .replace(/```html\s*/gi, "")
                  .replace(/```\s*$/gi, "")
                  .trim())
                }}
              />
            ) : (
              <p className="text-muted-foreground text-center py-8">No content available</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ContentUpgradeDialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog} />
    </DashboardLayout>
  );
}

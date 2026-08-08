"use client";
import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { History, MessageSquare, FileText, CheckCircle, Clock, AlertCircle, ExternalLink, Eye, Pencil, Globe, Loader2, Copy, MapPin, Sparkles, Search, ShoppingCart } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { useAnswers } from "@/hooks/useAnswers";
import { useArticles } from "@/hooks/useArticles";
import { useLocalAnswers } from "@/hooks/useLocalAnswers";
import { useGeoContents } from "@/hooks/useGeoContents";
import { useShoppingPlanning } from "@/hooks/useShoppingPlanning";
import { useActiveProject } from "@/hooks/useProjects";
import { usePublishAnswer } from "@/hooks/usePublishAnswer";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import wordpressLogo from "@/assets/wordpress-logo.png";
import shopifyLogo from "@/assets/shopify-logo.png";
import wixLogo from "@/assets/wix-logo.png";

const platformLogos: Record<string, any> = { wordpress: wordpressLogo, shopify: shopifyLogo, wix: wixLogo };
type SourceType = "aeo" | "local" | "seo" | "geo" | "shopping";
interface UnifiedHistoryItem { id: string; title: string; source: SourceType; score: number | null; is_public: boolean; published_at: string | null; published_url: string | null; created_at: string; slug?: string; word_count?: number; status?: string; }

const getSourceBadge = (source: SourceType) => {
  switch (source) {
    case "aeo": return <Badge className="bg-primary/10 text-primary border-primary/20 gap-1"><Sparkles className="h-3 w-3" />AEO</Badge>;
    case "local": return <Badge className="bg-[hsl(222,47%,11%)]/10 text-[hsl(222,47%,30%)] border-[hsl(222,47%,11%)]/20 gap-1"><MapPin className="h-3 w-3" />Local AEO</Badge>;
    case "seo": return <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20 gap-1"><Search className="h-3 w-3" />SEO</Badge>;
    case "geo": return <Badge className="bg-violet-500/10 text-violet-700 border-violet-500/20 gap-1"><Globe className="h-3 w-3" />GEO</Badge>;
    case "shopping": return <Badge className="bg-pink-500/10 text-pink-700 border-pink-500/20 gap-1"><ShoppingCart className="h-3 w-3" />Shopping</Badge>;
  }
};

export default function AeoHistory() {
  const router = useRouter();
  const { project } = useActiveProject();
  const { data: rawAnswers = [], isLoading: answersLoading } = useAnswers();
  const { data: rawArticles = [], isLoading: articlesLoading } = useArticles();
  const { data: rawLocalAnswers = [], isLoading: localLoading } = useLocalAnswers();
  const { data: rawGeoContents = [], isLoading: geoLoading } = useGeoContents();
  const { data: rawShopping = [], isLoading: shoppingLoading } = useShoppingPlanning();
  const publishAnswer = usePublishAnswer();
  const [publishingId, setPublishingId] = useState<string | null>(null);

  const answers = [...rawAnswers].filter((a) => a.is_public).sort((a, b) => { const dateA = a.published_at ? new Date(a.published_at).getTime() : new Date(a.created_at).getTime(); const dateB = b.published_at ? new Date(b.published_at).getTime() : new Date(b.created_at).getTime(); return dateB - dateA; });
  const localAnswers = [...rawLocalAnswers].filter((a) => a.is_public).sort((a, b) => { const dateA = a.published_at ? new Date(a.published_at).getTime() : new Date(a.created_at).getTime(); const dateB = b.published_at ? new Date(b.published_at).getTime() : new Date(b.created_at).getTime(); return dateB - dateA; });
  const articles = [...rawArticles].filter((a) => a.status === "published").sort((a, b) => { return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(); });
  const geoContents = [...rawGeoContents].filter((g) => g.is_public || g.published_at).sort((a, b) => { const dateA = a.published_at ? new Date(a.published_at).getTime() : new Date(a.created_at).getTime(); const dateB = b.published_at ? new Date(b.published_at).getTime() : new Date(b.created_at).getTime(); return dateB - dateA; });
  const shoppingItems = [...rawShopping].filter((s: any) => s.published).sort((a: any, b: any) => { const dateA = a.published_at ? new Date(a.published_at).getTime() : new Date(a.scheduled_date).getTime(); const dateB = b.published_at ? new Date(b.published_at).getTime() : new Date(b.scheduled_date).getTime(); return dateB - dateA; });

  const unifiedHistory: UnifiedHistoryItem[] = [
    ...answers.map((a) => ({ id: a.id, title: a.question, source: "aeo" as SourceType, score: a.score, is_public: a.is_public, published_at: a.published_at, published_url: a.published_url, created_at: a.created_at, slug: a.slug })),
    ...localAnswers.map((a) => ({ id: a.id, title: a.question, source: "local" as SourceType, score: a.score, is_public: a.is_public, published_at: a.published_at, published_url: a.published_url, created_at: a.created_at, slug: a.slug })),
    ...articles.map((a) => ({ id: a.id, title: a.title, source: "seo" as SourceType, score: a.aeo_score, is_public: true, published_at: a.created_at, published_url: a.published_url || null, created_at: a.created_at || new Date().toISOString(), word_count: a.word_count, status: a.status })),
    ...geoContents.map((g) => ({ id: g.id, title: g.title || g.topic, source: "geo" as SourceType, score: g.score, is_public: g.is_public, published_at: g.published_at, published_url: g.published_url, created_at: g.created_at, slug: g.slug || undefined })),
    ...shoppingItems.map((s: any) => ({ id: s.id, title: s.product?.ai_title || s.product?.title || "Product", source: "shopping" as SourceType, score: s.product?.ai_score ?? null, is_public: true, published_at: s.published_at, published_url: null, created_at: s.scheduled_date || s.created_at })),
  ].sort((a, b) => { const dateA = a.published_at ? new Date(a.published_at).getTime() : new Date(a.created_at).getTime(); const dateB = b.published_at ? new Date(b.published_at).getTime() : new Date(b.created_at).getTime(); return dateB - dateA; });

  const handlePublish = async (answerId: string) => { if (!project) return; setPublishingId(answerId); try { await publishAnswer.mutateAsync({ answerId, projectId: project.id }); } finally { setPublishingId(null); } };
  const handleCopyLink = (slug: string) => { const url = `${window.location.origin}/answers/${slug}`; navigator.clipboard.writeText(url); toast.success("Link copied!"); };

  const getStatusBadge = (item: { is_public?: boolean; published_at?: string | null; published_url?: string | null }) => {
    if (item.published_url) return <Badge className="bg-primary/10 text-primary border-primary/20 gap-1"><CheckCircle className="h-3 w-3" />Published</Badge>;
    if (item.is_public) return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 gap-1"><Globe className="h-3 w-3" />Public</Badge>;
    return <Badge className="bg-muted text-muted-foreground border-muted-foreground/30 gap-1"><Clock className="h-3 w-3" />Draft</Badge>;
  };

  const getProjectDomain = (): string => { if (!project?.website_url) return ""; try { const urlObj = new URL(project.website_url); return urlObj.hostname.replace("www.", ""); } catch { return project.website_url; } };

  const getPlatformInfo = (url: string | null): { icon: React.ReactNode; label: string } | null => {
    const projectDomain = getProjectDomain();
    if (!url) { if (projectDomain) return { icon: <Globe className="h-4 w-4 text-muted-foreground" />, label: projectDomain }; return null; }
    const urlLower = url.toLowerCase(); let domain = ""; try { const urlObj = new URL(url); domain = urlObj.hostname.replace("www.", ""); } catch { domain = url; }
    if (urlLower.includes("wordpress") || urlLower.includes("wp-")) return { icon: <img src={platformLogos.wordpress} alt="WordPress" className="h-5 w-5" />, label: domain };
    if (urlLower.includes("shopify") || urlLower.includes("myshopify")) return { icon: <img src={platformLogos.shopify} alt="Shopify" className="h-5 w-5" />, label: domain };
    if (urlLower.includes("wix")) return { icon: <img src={platformLogos.wix} alt="Wix" className="h-5 w-5" />, label: domain };
    return { icon: <Globe className="h-4 w-4 text-muted-foreground" />, label: domain };
  };

  const isLoading = answersLoading || articlesLoading || localLoading || geoLoading || shoppingLoading;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          icon={History}
          title="History"
          description="Track all your published content: AEO, Local AEO & SEO"
          gradientFrom="from-slate-500/10"
          gradientVia="via-zinc-500/10"
          gradientTo="to-gray-500/10"
          iconFrom="from-slate-600"
          iconTo="to-zinc-700"
        />

        <Tabs defaultValue="all" className="w-full">
          <TabsList className="grid w-full max-w-4xl grid-cols-6">
            <TabsTrigger value="all" className="gap-2"><History className="h-4 w-4" />All<Badge variant="secondary" className="ml-1">{unifiedHistory.length}</Badge></TabsTrigger>
            <TabsTrigger value="aeo" className="gap-2"><Sparkles className="h-4 w-4" />AEO<Badge variant="secondary" className="ml-1">{answers.length}</Badge></TabsTrigger>
            <TabsTrigger value="local" className="gap-2"><MapPin className="h-4 w-4" />Local<Badge variant="secondary" className="ml-1">{localAnswers.length}</Badge></TabsTrigger>
            <TabsTrigger value="seo" className="gap-2"><FileText className="h-4 w-4" />SEO<Badge variant="secondary" className="ml-1">{articles.length}</Badge></TabsTrigger>
            <TabsTrigger value="geo" className="gap-2"><Globe className="h-4 w-4" />GEO<Badge variant="secondary" className="ml-1">{geoContents.length}</Badge></TabsTrigger>
            <TabsTrigger value="shopping" className="gap-2"><ShoppingCart className="h-4 w-4" />Shopping<Badge variant="secondary" className="ml-1">{shoppingItems.length}</Badge></TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-6">
            <Card>
              {isLoading ? (<div className="flex items-center justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>) : unifiedHistory.length === 0 ? (<div className="flex flex-col items-center justify-center p-12 text-center"><History className="h-12 w-12 text-muted-foreground mb-4" /><h3 className="font-semibold text-lg">No published content yet</h3><p className="text-muted-foreground mb-4">Generate and publish content to see it here</p><Button onClick={() => router.push("/answers")}>Go to Answers</Button></div>) : (
                <Table>
                  <TableHeader><TableRow><TableHead className="w-[30%]">Title</TableHead><TableHead>Source</TableHead><TableHead>Score</TableHead><TableHead>Status</TableHead><TableHead>Integration</TableHead><TableHead>Published</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {unifiedHistory.map((item) => (
                      <TableRow key={`${item.source}-${item.id}`}>
                        <TableCell className="font-medium"><div className="line-clamp-2">{item.title}</div></TableCell>
                        <TableCell>{getSourceBadge(item.source)}</TableCell>
                        <TableCell>{item.score !== null ? (<Badge variant="outline" className={item.score >= 80 ? "border-[hsl(222,47%,30%)] text-[hsl(222,47%,30%)]" : item.score >= 60 ? "border-amber-500 text-amber-600" : ""}>{item.score}%</Badge>) : (<span className="text-muted-foreground">—</span>)}</TableCell>
                        <TableCell>{getStatusBadge(item)}</TableCell>
                        <TableCell>
                          {(() => {
                            const platformInfo = getPlatformInfo(item.published_url);
                            if (!platformInfo) return <span className="text-muted-foreground">—</span>;
                            return item.published_url ? (<a href={item.published_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-primary text-sm">{platformInfo.icon}<span className="truncate max-w-[100px]">{platformInfo.label}</span><ExternalLink className="h-3 w-3 flex-shrink-0" /></a>) : (<div className="flex items-center gap-2 text-sm text-muted-foreground">{platformInfo.icon}<span className="truncate max-w-[100px]">{platformInfo.label}</span></div>);
                          })()}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{item.published_at ? format(new Date(item.published_at), "MMM d, yyyy") : format(new Date(item.created_at), "MMM d, yyyy")}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {item.published_url && (<Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => window.open(item.published_url!, "_blank")} title="View on Site"><ExternalLink className="h-4 w-4 text-[hsl(222,47%,30%)]" /></Button>)}
                            {item.slug && (<Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleCopyLink(item.slug!)} title="Copy Link"><Copy className="h-4 w-4" /></Button>)}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="aeo" className="mt-6">
            <Card>
              {answersLoading ? (
                <div className="flex items-center justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
              ) : answers.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-center"><MessageSquare className="h-12 w-12 text-muted-foreground mb-4" /><h3 className="font-semibold text-lg">No AEO answers yet</h3><p className="text-muted-foreground mb-4">Generate AEO answers to see them here</p><Button onClick={() => router.push("/answers")}>Go to Answers</Button></div>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead className="w-[40%]">Question</TableHead><TableHead>Score</TableHead><TableHead>Status</TableHead><TableHead>Integration</TableHead><TableHead>Published</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {answers.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium"><div className="line-clamp-2">{a.question}</div></TableCell>
                        <TableCell>{a.score !== null ? (<Badge variant="outline" className={a.score >= 80 ? "border-[hsl(222,47%,30%)] text-[hsl(222,47%,30%)]" : a.score >= 60 ? "border-amber-500 text-amber-600" : ""}>{a.score}%</Badge>) : (<span className="text-muted-foreground">—</span>)}</TableCell>
                        <TableCell>{getStatusBadge(a)}</TableCell>
                        <TableCell>
                          {(() => {
                            const platformInfo = getPlatformInfo(a.published_url);
                            if (!platformInfo) return <span className="text-muted-foreground">—</span>;
                            return a.published_url ? (<a href={a.published_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-primary text-sm">{platformInfo.icon}<span className="truncate max-w-[100px]">{platformInfo.label}</span><ExternalLink className="h-3 w-3 flex-shrink-0" /></a>) : (<div className="flex items-center gap-2 text-sm text-muted-foreground">{platformInfo.icon}<span className="truncate max-w-[100px]">{platformInfo.label}</span></div>);
                          })()}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{a.published_at ? format(new Date(a.published_at), "MMM d, yyyy") : format(new Date(a.created_at), "MMM d, yyyy")}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {a.published_url && (<Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => window.open(a.published_url!, "_blank")} title="View on Site"><ExternalLink className="h-4 w-4 text-[hsl(222,47%,30%)]" /></Button>)}
                            {a.slug && (<Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleCopyLink(a.slug)} title="Copy Link"><Copy className="h-4 w-4" /></Button>)}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="local" className="mt-6">
            <Card>
              {localLoading ? (
                <div className="flex items-center justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
              ) : localAnswers.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-center"><MapPin className="h-12 w-12 text-muted-foreground mb-4" /><h3 className="font-semibold text-lg">No local AEO answers yet</h3><p className="text-muted-foreground mb-4">Generate local AEO answers to see them here</p><Button onClick={() => router.push("/local")}>Go to Local AEO</Button></div>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead className="w-[40%]">Question</TableHead><TableHead>Score</TableHead><TableHead>Status</TableHead><TableHead>Integration</TableHead><TableHead>Published</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {localAnswers.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium"><div className="line-clamp-2">{a.question}</div></TableCell>
                        <TableCell>{a.score !== null ? (<Badge variant="outline" className={a.score >= 80 ? "border-[hsl(222,47%,30%)] text-[hsl(222,47%,30%)]" : a.score >= 60 ? "border-amber-500 text-amber-600" : ""}>{a.score}%</Badge>) : (<span className="text-muted-foreground">—</span>)}</TableCell>
                        <TableCell>{getStatusBadge(a)}</TableCell>
                        <TableCell>
                          {(() => {
                            const platformInfo = getPlatformInfo(a.published_url);
                            if (!platformInfo) return <span className="text-muted-foreground">—</span>;
                            return a.published_url ? (<a href={a.published_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-primary text-sm">{platformInfo.icon}<span className="truncate max-w-[100px]">{platformInfo.label}</span><ExternalLink className="h-3 w-3 flex-shrink-0" /></a>) : (<div className="flex items-center gap-2 text-sm text-muted-foreground">{platformInfo.icon}<span className="truncate max-w-[100px]">{platformInfo.label}</span></div>);
                          })()}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{a.published_at ? format(new Date(a.published_at), "MMM d, yyyy") : format(new Date(a.created_at), "MMM d, yyyy")}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {a.published_url && (<Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => window.open(a.published_url!, "_blank")} title="View on Site"><ExternalLink className="h-4 w-4 text-[hsl(222,47%,30%)]" /></Button>)}
                            {a.slug && (<Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleCopyLink(a.slug)} title="Copy Link"><Copy className="h-4 w-4" /></Button>)}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="seo" className="mt-6">
            <Card>
              {articlesLoading ? (
                <div className="flex items-center justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
              ) : articles.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-center"><FileText className="h-12 w-12 text-muted-foreground mb-4" /><h3 className="font-semibold text-lg">No SEO articles yet</h3><p className="text-muted-foreground mb-4">Generate SEO articles to see them here</p><Button onClick={() => router.push("/autoseo")}>Go to Auto SEO</Button></div>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead className="w-[40%]">Title</TableHead><TableHead>Score</TableHead><TableHead>Words</TableHead><TableHead>Integration</TableHead><TableHead>Published</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {articles.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium"><div className="line-clamp-2">{a.title}</div></TableCell>
                        <TableCell>{a.aeo_score !== null ? (<Badge variant="outline" className={a.aeo_score >= 80 ? "border-[hsl(222,47%,30%)] text-[hsl(222,47%,30%)]" : a.aeo_score >= 60 ? "border-amber-500 text-amber-600" : ""}>{a.aeo_score}%</Badge>) : (<span className="text-muted-foreground">—</span>)}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{a.word_count ? `${a.word_count.toLocaleString()} words` : "—"}</TableCell>
                        <TableCell>
                          {(() => {
                            const platformInfo = getPlatformInfo(a.published_url);
                            if (!platformInfo) return <span className="text-muted-foreground">—</span>;
                            return a.published_url ? (<a href={a.published_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-primary text-sm">{platformInfo.icon}<span className="truncate max-w-[100px]">{platformInfo.label}</span><ExternalLink className="h-3 w-3 flex-shrink-0" /></a>) : (<div className="flex items-center gap-2 text-sm text-muted-foreground">{platformInfo.icon}<span className="truncate max-w-[100px]">{platformInfo.label}</span></div>);
                          })()}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{a.created_at ? format(new Date(a.created_at), "MMM d, yyyy") : "—"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {a.published_url && (<Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => window.open(a.published_url!, "_blank")} title="View on Site"><ExternalLink className="h-4 w-4 text-[hsl(222,47%,30%)]" /></Button>)}
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push(`/articles/${a.id}`)} title="View Article"><Eye className="h-4 w-4" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="geo" className="mt-6">
            <Card>
              {geoLoading ? (
                <div className="flex items-center justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
              ) : geoContents.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-center"><Globe className="h-12 w-12 text-muted-foreground mb-4" /><h3 className="font-semibold text-lg">No GEO content yet</h3><p className="text-muted-foreground mb-4">Generate GEO content to see it here</p><Button onClick={() => router.push("/geo")}>Go to GEO Engine</Button></div>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead className="w-[40%]">Title</TableHead><TableHead>Score</TableHead><TableHead>Status</TableHead><TableHead>Integration</TableHead><TableHead>Published</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {geoContents.map((g) => (
                      <TableRow key={g.id}>
                        <TableCell className="font-medium"><div className="line-clamp-2">{g.title || g.topic}</div></TableCell>
                        <TableCell>{g.score !== null ? (<Badge variant="outline" className={g.score >= 80 ? "border-[hsl(222,47%,30%)] text-[hsl(222,47%,30%)]" : g.score >= 60 ? "border-amber-500 text-amber-600" : ""}>{g.score}%</Badge>) : (<span className="text-muted-foreground">—</span>)}</TableCell>
                        <TableCell>{getStatusBadge(g)}</TableCell>
                        <TableCell>
                          {(() => {
                            const platformInfo = getPlatformInfo(g.published_url);
                            if (!platformInfo) return <span className="text-muted-foreground">—</span>;
                            return g.published_url ? (<a href={g.published_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-primary text-sm">{platformInfo.icon}<span className="truncate max-w-[100px]">{platformInfo.label}</span><ExternalLink className="h-3 w-3 flex-shrink-0" /></a>) : (<div className="flex items-center gap-2 text-sm text-muted-foreground">{platformInfo.icon}<span className="truncate max-w-[100px]">{platformInfo.label}</span></div>);
                          })()}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{g.published_at ? format(new Date(g.published_at), "MMM d, yyyy") : format(new Date(g.created_at), "MMM d, yyyy")}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {g.published_url && (<Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => window.open(g.published_url!, "_blank")} title="View on Site"><ExternalLink className="h-4 w-4 text-[hsl(222,47%,30%)]" /></Button>)}
                            {g.slug && (<Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleCopyLink(g.slug!)} title="Copy Link"><Copy className="h-4 w-4" /></Button>)}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="shopping" className="mt-6">
            <Card>
              {shoppingLoading ? (
                <div className="flex items-center justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
              ) : shoppingItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-center"><ShoppingCart className="h-12 w-12 text-muted-foreground mb-4" /><h3 className="font-semibold text-lg">No Shopping items yet</h3><p className="text-muted-foreground mb-4">Publish products to see them here</p><Button onClick={() => router.push("/shopping")}>Go to Shopping</Button></div>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead className="w-[40%]">Product</TableHead><TableHead>AI Score</TableHead><TableHead>Price</TableHead><TableHead>Status</TableHead><TableHead>Published</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {shoppingItems.map((s: any) => {
                      const title = s.product?.ai_title || s.product?.title || "Product";
                      const score = s.product?.ai_score;
                      const price = s.product?.price;
                      const currency = s.product?.currency || "EUR";
                      return (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {s.product?.image_url && <img src={s.product.image_url} alt="" className="h-8 w-8 rounded object-cover" />}
                              <div className="line-clamp-2">{title}</div>
                            </div>
                          </TableCell>
                          <TableCell>{score != null ? (<Badge variant="outline" className={score >= 80 ? "border-[hsl(222,47%,30%)] text-[hsl(222,47%,30%)]" : score >= 60 ? "border-amber-500 text-amber-600" : ""}>{score}%</Badge>) : (<span className="text-muted-foreground">—</span>)}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{price != null ? `${price} ${currency}` : "—"}</TableCell>
                          <TableCell><Badge className="bg-primary/10 text-primary border-primary/20 gap-1"><CheckCircle className="h-3 w-3" />Published</Badge></TableCell>
                          <TableCell className="text-muted-foreground text-sm">{s.published_at ? format(new Date(s.published_at), "MMM d, yyyy") : format(new Date(s.scheduled_date), "MMM d, yyyy")}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push("/shopping")} title="View"><Eye className="h-4 w-4" /></Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

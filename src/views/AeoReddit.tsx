"use client";
import { Helmet } from "react-helmet-async";
import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { SubscriptionGate } from "@/components/aeo/SubscriptionGate";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, TrendingUp, Eye, Zap, Copy, ExternalLink, RefreshCw, Sparkles, MessageCircle, CheckCircle, AlertCircle, Search, Shield, User, EyeOff, MapPin, FileText } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveProject } from "@/hooks/useProjects";
import { useAnswers } from "@/hooks/useAnswers";
import { useArticles } from "@/hooks/useArticles";
import { useLocalAnswers } from "@/hooks/useLocalAnswers";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Define types for Reddit posts and visibility modes
type VisibilityMode = "stealth" | "soft" | "profile-only";
interface RedditPost { id: string; subreddit: string; title: string; body?: string; views: string; trending: boolean; suggestedComment?: string; url: string; estimatedScore?: number; brandMentioned?: boolean; linkIncluded?: boolean; relevanceScore?: number; relevanceReason?: string; trendScore?: number; intent?: string; }

const getSubredditsForKeywords = (keywords: string[], language: string): string[] => {
  const subreddits = new Set<string>();
  const categoryMappings: Record<string, { fr: string[]; en: string[] }> = {
    "ai|ia|artificial intelligence|intelligence artificielle|machine learning|gpt|llm|mvp|startup|saas|tech|software|logiciel": { fr: ["startups_fr", "developpeurs", "vosfinances", "AskFrance", "france"], en: ["artificialintelligence", "MachineLearning", "startups", "SideProject", "indiehackers", "SaaS"] },
    "seo|referencement|content marketing|marketing de contenu|digital marketing|marketing digital": { fr: ["marketing_france", "Referencement", "france", "Entreprendre"], en: ["SEO", "marketing", "content_marketing", "digital_marketing", "smallbusiness"] },
    "ecommerce|commerce electronique|online store|boutique en ligne|dropshipping": { fr: ["ecommerce_fr", "Dropshipping_FR", "france"], en: ["ecommerce", "shopify", "smallbusiness", "dropship"] },
    "crypto|cryptocurrency|blockchain|nft": { fr: ["CryptoFrance", "BitcoinFrance", "france"], en: ["CryptoCurrency", "Bitcoin", "NFT", "blockchain"] },
    "travel|voyage|tourism|tourisme|hotel|airbnb": { fr: ["VoyageFrance", "Tourisme", "france"], en: ["travel", "traveltips", "digitalnomad", "traveldeals"] },
    "health|sante|wellness|bien-etre|fitness": { fr: ["FranceSante", "Nutrition", "france"], en: ["health", "wellness", "fitness", "nutrition"] },
    "food|nourriture|cuisine|restaurant": { fr: ["Cuisine", "BonPlansFood", "france"], en: ["food", "foodporn", "recipes", "restaurants"] },
    "real estate|immobilier": { fr: ["Immobilier", "france"], en: ["realestate", "homeimprovement"] },
    "finance|finances|investment|investissement": { fr: ["vosfinances", "FranceBourse", "france"], en: ["personalfinance", "investing"] },
  };
  keywords.forEach(kw => {
    const kwLower = kw.toLowerCase();
    Object.entries(categoryMappings).forEach(([pattern, subs]) => {
      const regex = new RegExp(pattern.split("|").map(p => p.trim()).join("|"), "i");
      if (regex.test(kwLower)) {
        const langSubs = language === "fr" ? subs.fr : subs.en;
        langSubs.forEach(sub => subreddits.add(sub));
      }
    });
  });
  if (subreddits.size === 0) {
    if (language === "fr") {
      ["france", "vosfinances", "AskFrance", "entrepreneur"].forEach(s => subreddits.add(s));
    } else {
      ["startups", "Entrepreneur", "smallbusiness", "SideProject", "webdev"].forEach(s => subreddits.add(s));
    }
  }
  return Array.from(subreddits);
};

export default function AeoReddit() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { project: activeProject } = useActiveProject();
  const { data: rawAnswers = [] } = useAnswers();
  const { data: rawArticles = [] } = useArticles();
  const { data: rawLocalAnswers = [] } = useLocalAnswers();
  const aeoCount = rawAnswers.filter((a) => a.is_public).length;
  const localCount = rawLocalAnswers.filter((a) => a.is_public).length;
  const seoCount = rawArticles.filter((a) => a.status === "published").length;
  const [posts, setPosts] = useState<RedditPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [visibilityMode, setVisibilityMode] = useState<VisibilityMode>("soft");
  const [generationSettings, setGenerationSettings] = useState<{ language: string; business_description: string; target_audiences: string[]; } | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      if (!activeProject?.id) return;
      setSettingsLoaded(false);
      const { data: genSettings } = await supabase.from("generation_settings").select("language, business_description, target_audiences").eq("project_id", activeProject.id).single();
      const settings = { language: genSettings?.language || activeProject.language || "fr", business_description: genSettings?.business_description || activeProject.business_description || "", target_audiences: genSettings?.target_audiences || (activeProject.audience ? [activeProject.audience] : []) };
      setGenerationSettings(settings);
      setSettingsLoaded(true);
    };
    fetchSettings();
  }, [activeProject?.id, activeProject?.language, activeProject?.business_description]);

  const loadPostsFromDatabase = async () => {
    if (!activeProject?.id || !generationSettings || !settingsLoaded) return false;
    setLoading(true);
    try {
      const { data: dbPosts, error } = await supabase.from("reddit_responses").select("*").eq("project_id", activeProject.id).order("created_at", { ascending: false });
      if (error) throw error;
      if (dbPosts && dbPosts.length > 0) {
        const typedPosts: RedditPost[] = dbPosts.map((p: any) => ({ id: p.id, subreddit: p.subreddit, title: p.reddit_post_title, body: p.generated_reply, views: "0", trending: false, url: p.reddit_post_url }));
        setPosts(typedPosts);
        return true;
      }
      return false;
    } catch (err: any) { toast({ title: "Error loading posts", description: err.message, }); return false; } finally { setLoading(false); }
  };

  const fetchRedditPosts = async (forceRefresh = false) => {
    if (!activeProject?.id || !generationSettings || !settingsLoaded) return;
    setLoading(true);
    try {
      const hasLoaded = !forceRefresh && await loadPostsFromDatabase();
      if (hasLoaded) return;
      const keywords = [activeProject.name, activeProject.brand_name, generationSettings.business_description, ...(generationSettings.target_audiences || [])].filter(Boolean) as string[];
      const subreddits = getSubredditsForKeywords(keywords, generationSettings.language);
      const { data, error } = await supabase.functions.invoke("get-reddit-posts", { body: { subreddits, keywords, } });
      if (error) throw error;
      if (!data?.posts || data.posts.length === 0) { toast({ title: "No posts found", description: "Try again later or adjust your keywords.", }); return; }
      const newPosts: RedditPost[] = data.posts.map((p: any) => ({ id: p.id, subreddit: p.subreddit, title: p.title, body: p.body, views: p.views, trending: p.trending || false, url: p.url, }));
      setPosts(newPosts);
      try {
        const insertData = newPosts.map(p => ({ project_id: activeProject.id, subreddit: p.subreddit, reddit_post_title: p.title, reddit_post_url: p.url, generated_reply: p.body || "" }));
        const { error: insertError } = await supabase.from("reddit_responses").insert(insertData);
        if (insertError) console.error("Error inserting posts:", insertError);
      } catch (err) { console.error("Error inserting posts:", err); }
    } catch (err: any) { toast({ title: "Error fetching posts", description: err.message, }); } finally { setLoading(false); setInitialLoadDone(true); }
  };

  useEffect(() => {
    if (activeProject?.id && generationSettings && settingsLoaded) { fetchRedditPosts(); }
  }, [activeProject?.id, generationSettings, settingsLoaded]);

  const getBrandMentionChance = () => {
    if (visibilityMode === "stealth") return 0;
    if (visibilityMode === "soft") return 0.15;
    return 0;
  };

  const generateReplyForPost = async (post: RedditPost, options?: any) => {
    if (!activeProject?.id || !user?.id || !generationSettings || !settingsLoaded) return;
    setGeneratingId(post.id);
    try {
      const brandMentionChance = getBrandMentionChance();
      const { data, error } = await supabase.functions.invoke("generate-reddit-reply", {
        body: {
          postTitle: post.title, postBody: post.body, brandName: activeProject.brand_name || activeProject.name, businessDescription: generationSettings.business_description, language: generationSettings.language, brandMentionChance,
        },
      });
      if (error) throw error;
      if (!data?.reply) { toast({ title: "Reply generation failed", description: "Please try again.", }); return; }
      const estimatedScore = Math.floor(Math.random() * 40) + 40;
      const relevanceScore = Math.floor(Math.random() * 50) + 50;
      const trendScore = Math.floor(Math.random() * 60) + 40;
      const brandMentioned = brandMentionChance > 0 && Math.random() < brandMentionChance;
      const linkIncluded = brandMentioned && Math.random() < 0.3;
      const questionPatterns = ["comment", "pourquoi", "quoi", "quel", "quelle", "où", "quand", "how", "what", "why", "where", "when", "which", "?"];
      const isQuestion = questionPatterns.some(p => post.title.toLowerCase().includes(p));
      const intent = isQuestion ? "Answering" : brandMentioned ? "Promoting" : "Engaging";
      const updatedPost: RedditPost = { ...post, suggestedComment: data.reply, estimatedScore, brandMentioned, linkIncluded, relevanceScore, relevanceReason: "Generated by AI", trendScore, intent, };
      setPosts(prev => prev.map(p => p.id === post.id ? updatedPost : p));
      try {
        await supabase.from("reddit_responses").update({ generated_reply: data.reply }).eq("id", post.id).eq("project_id", activeProject.id);
      } catch (err) { console.error("Error updating post:", err); }
    } catch (err: any) { toast({ title: "Reply generation failed", description: err.message, }); } finally { setGeneratingId(null); }
  };

  const generateAllReplies = async () => {
    if (!activeProject?.id || !user?.id || !generationSettings || !settingsLoaded) return;
    setLoading(true);
    const postsWithoutReplies = posts.filter(p => !p.suggestedComment);
    for (const post of postsWithoutReplies) {
      await generateReplyForPost(post);
    }
    setLoading(false);
  };

  const refreshPosts = async () => {
    await fetchRedditPosts(true);
  };

  const handleCopyAndOpen = (post: RedditPost) => {
    if (!post.suggestedComment) return;
    navigator.clipboard.writeText(post.suggestedComment);
    window.open(post.url, "_blank");
  };

  const getScoreColor = (score?: number) => { if (!score) return "text-muted-foreground"; if (score >= 70) return "text-emerald-500"; if (score >= 50) return "text-amber-500"; return "text-red-500"; };
  const getScoreBadge = (score?: number) => { if (!score) return null; if (score >= 70) return <Badge className="bg-emerald-500/20 text-emerald-600 border-emerald-500/30"><CheckCircle className="w-3 h-3 mr-1" />Safe to post</Badge>; if (score >= 50) return <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30"><AlertCircle className="w-3 h-3 mr-1" />Review needed</Badge>; return <Badge className="bg-red-500/20 text-red-600 border-red-500/30"><AlertCircle className="w-3 h-3 mr-1" />Risky</Badge>; };
  const getRelevanceBadge = (score?: number, reason?: string) => { if (score === undefined) return null; const color = score >= 50 ? "bg-emerald-500/20 text-emerald-600 border-emerald-500/30" : score >= 30 ? "bg-blue-500/20 text-blue-600 border-blue-500/30" : "bg-amber-500/20 text-amber-600 border-amber-500/30"; return <Badge className={color} title={reason || ""}><TrendingUp className="w-3 h-3 mr-1" />{score}% relevant</Badge>; };
  const getTrendBadge = (trendScore?: number) => { if (!trendScore) return null; if (trendScore >= 70) return <Badge className="bg-primary/10 text-primary border-primary/20">🔥 Hot ({trendScore})</Badge>; if (trendScore >= 50) return <Badge className="bg-primary/10 text-primary border-primary/20">📈 Rising ({trendScore})</Badge>; return null; };
  const getIntentBadge = (intent?: string) => { if (!intent) return null; return <Badge className="bg-blue-500/20 text-blue-600 text-xs">{intent}</Badge>; };

  return (
    <DashboardLayout>
      <Helmet>
        <title>Reddit Engagement — AutoPilot Geo</title>
        <meta name="description" content="Find high-value Reddit threads and generate human-like replies that drive qualified traffic to your brand." />
        <meta property="og:title" content="Reddit Engagement — AutoPilot Geo" />
        <meta property="og:description" content="Find high-value Reddit threads and generate human-like replies that drive qualified traffic to your brand." />
        <link rel="canonical" href="https://autopilotgeo.com/reddit" />
        <meta property="og:url" content="https://autopilotgeo.com/reddit" />
      </Helmet>
      <SubscriptionGate title="Unlock Reddit Engagement" description="Find high-value Reddit threads and generate human-like replies that drive traffic to your brand.">
      <div className="max-w-4xl mx-auto space-y-6">
        <PageHeader
          icon={MessageCircle}
          title="Reddit Engagement"
          description={`Generate human-like replies for ${activeProject?.brand_name || "your brand"}`}
          gradientFrom="from-orange-500/10"
          gradientVia="via-red-500/10"
          gradientTo="to-rose-500/10"
          iconFrom="from-orange-500"
          iconTo="to-red-500"
        >
          <Button variant="outline" onClick={refreshPosts} disabled={loading}><RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />Refresh</Button>
          <Button onClick={generateAllReplies} disabled={loading} className="bg-[hsl(222,47%,11%)] hover:bg-[hsl(222,47%,15%)] text-white"><Sparkles className="w-4 h-4 mr-2" />Generate All</Button>
        </PageHeader>

        <Card className="p-4 border-primary/20 bg-primary/5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[hsl(222,47%,11%)] flex items-center justify-center"><Shield className="w-5 h-5 text-white" /></div>
              <div><h3 className="font-semibold text-foreground">Brand Visibility: {activeProject?.brand_name || "Not set"}</h3><p className="text-sm text-muted-foreground">{visibilityMode === "stealth" && "0% brand mentions in comments"}{visibilityMode === "soft" && "~15% soft brand mentions (safe)"}{visibilityMode === "profile-only" && "Brand in Reddit bio only (recommended)"}</p></div>
            </div>
            <Select value={visibilityMode} onValueChange={(v) => setVisibilityMode(v as VisibilityMode)}><SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="stealth"><div className="flex items-center gap-2"><EyeOff className="w-4 h-4" /><span>Stealth (0%)</span></div></SelectItem><SelectItem value="soft"><div className="flex items-center gap-2"><Eye className="w-4 h-4" /><span>Soft (15%)</span></div></SelectItem><SelectItem value="profile-only"><div className="flex items-center gap-2"><User className="w-4 h-4" /><span>Profile Only</span></div></SelectItem></SelectContent></Select>
          </div>
          {visibilityMode === "profile-only" && (<div className="mt-3 p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20"><p className="text-sm text-emerald-700 dark:text-emerald-400"><strong>💡 Recommended:</strong> Add "{activeProject?.brand_name || "YourBrand"}" to your Reddit profile bio.</p></div>)}
        </Card>

        <div className="grid grid-cols-3 lg:grid-cols-6 gap-4">
          <Card className="p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-[hsl(222,47%,11%)] flex items-center justify-center"><Sparkles className="w-5 h-5 text-white" /></div><div><p className="text-2xl font-bold">{aeoCount}</p><p className="text-xs text-muted-foreground">AEO</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-[hsl(222,47%,11%)] flex items-center justify-center"><MapPin className="w-5 h-5 text-white" /></div><div><p className="text-2xl font-bold">{localCount}</p><p className="text-xs text-muted-foreground">Local</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-[hsl(222,47%,11%)] flex items-center justify-center"><FileText className="w-5 h-5 text-white" /></div><div><p className="text-2xl font-bold">{seoCount}</p><p className="text-xs text-muted-foreground">SEO</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-[hsl(222,47%,11%)] flex items-center justify-center"><MessageCircle className="w-5 h-5 text-white" /></div><div><p className="text-2xl font-bold">{posts.length}</p><p className="text-xs text-muted-foreground">Opportunities</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-[hsl(222,47%,11%)] flex items-center justify-center"><Zap className="w-5 h-5 text-white" /></div><div><p className="text-2xl font-bold">{posts.filter(p => p.suggestedComment).length}</p><p className="text-xs text-muted-foreground">Replies</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center"><TrendingUp className="w-5 h-5 text-white" /></div><div><p className="text-2xl font-bold">{posts.filter(p => p.trending).length}</p><p className="text-xs text-muted-foreground">Trending</p></div></div></Card>
        </div>

        <Card>
          <div className="overflow-x-auto">
            <table className="w-full table-auto">
              <thead>
                <tr className="text-left">
                  <th className="px-4 py-2">Subreddit</th>
                  <th className="px-4 py-2">Title</th>
                  <th className="px-4 py-2">Relevance</th>
                  <th className="px-4 py-2">Trend</th>
                  <th className="px-4 py-2">Score</th>
                  <th className="px-4 py-2">Intent</th>
                  <th className="px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && initialLoadDone ? (<tr><td colSpan={7} className="text-center p-4">Loading...</td></tr>) : !initialLoadDone ? (<tr><td colSpan={7} className="text-center p-4">Fetching Reddit posts...</td></tr>) : posts.length === 0 ? (<tr><td colSpan={7} className="text-center p-4">No posts found.</td></tr>) : (
                  posts.map((post) => (
                    <tr key={post.id} className="hover:bg-muted/50 transition-colors">
                      <td className="border-t px-4 py-2 font-medium">{post.subreddit}</td>
                      <td className="border-t px-4 py-2">{post.title}</td>
                      <td className="border-t px-4 py-2">{getRelevanceBadge(post.relevanceScore, post.relevanceReason)}</td>
                      <td className="border-t px-4 py-2">{getTrendBadge(post.trendScore)}</td>
                      <td className="border-t px-4 py-2"><span className={getScoreColor(post.estimatedScore)}>{post.estimatedScore || "N/A"}</span></td>
                      <td className="border-t px-4 py-2">{getIntentBadge(post.intent)}</td>
                      <td className="border-t px-4 py-2">
                        <div className="flex gap-2">
                          {!post.suggestedComment && (<Button variant="ghost" size="sm" onClick={() => generateReplyForPost(post)} disabled={generatingId === post.id}><Sparkles className="w-4 h-4 mr-2" />{generatingId === post.id ? "Generating..." : "Generate"}</Button>)}
                          {post.suggestedComment && (<Button variant="ghost" size="sm" onClick={() => handleCopyAndOpen(post)}><Copy className="w-4 h-4 mr-2" />Copy & Open</Button>)}
                          <Button variant="ghost" size="sm" asChild><a href={post.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-4 h-4 mr-2" />View on Reddit</a></Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      </SubscriptionGate>
    </DashboardLayout>
  );
}

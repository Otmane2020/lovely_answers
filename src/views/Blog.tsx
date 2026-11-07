"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatedLogo } from "@/components/AnimatedLogo";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { FileText, Search, Calendar, ArrowRight, Sparkles } from "lucide-react";
import { format } from "date-fns";

interface PublicAnswer {
  id: string;
  question: string;
  answer: string;
  slug: string;
  published_at: string;
  score: number | null;
}

export default function Blog() {
  const [answers, setAnswers] = useState<PublicAnswer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    document.documentElement.classList.remove("dark");
  }, []);

  useEffect(() => {
    const fetchPublicAnswers = async () => {
      try {
        const { data: aeoData, error: aeoError } = await supabase
          .from("answers")
          .select(`id, question, answer, slug, published_at, score, projects!inner(website_url, domain)`)
          .eq("is_public", true)
          .not("published_at", "is", null)
          .order("published_at", { ascending: false });
        if (aeoError) throw aeoError;

        const { data: localData, error: localError } = await supabase
          .from("local_answers")
          .select(`id, question, answer, slug, published_at, score, projects!inner(website_url, domain)`)
          .eq("is_public", true)
          .not("published_at", "is", null)
          .order("published_at", { ascending: false });
        if (localError) throw localError;

        const { data: publishedData, error: publishedError } = await supabase
          .from("published_articles")
          .select("id, title, body, slug, published_at")
          .order("published_at", { ascending: false });
        if (publishedError) console.warn("Error fetching published articles:", publishedError);

        const publishedAnswers = (publishedData || []).map((article: any) => ({
          id: article.id, question: article.title, answer: article.body,
          slug: article.slug, published_at: article.published_at, score: null
        }));

        const internalAnswers = [...(aeoData || []), ...(localData || [])];
        const siteAnswers = internalAnswers.filter((answer: any) => {
          const projectDomain = (answer.projects?.domain || '').toLowerCase();
          const projectUrl = (answer.projects?.website_url || '').toLowerCase();
          return projectDomain === 'autopilotgeo.com' || projectDomain.includes('autopilotgeo') || projectUrl.includes('autopilotgeo.com');
        });

        const now = new Date();
        const allAnswers = [...siteAnswers, ...publishedAnswers]
          .filter((a: any) => new Date(a.published_at) <= now);
        allAnswers.sort((a: any, b: any) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());
        setAnswers(allAnswers);
      } catch (error) {
        console.error("Error fetching public answers:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchPublicAnswers();
  }, []);

  const filteredAnswers = answers.filter((answer) =>
    answer.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
    answer.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength).trim() + "...";
  };

  const blogStructuredData = {
    "@context": "https://schema.org", "@type": "Blog",
    "name": "AutoPilot Geo Blog", "url": "https://autopilotgeo.com/blog",
    "publisher": { "@type": "Organization", "name": "AutoPilot Geo" }
  };

  return (
    <>
      <Helmet>
        <title>Blog - AI-Optimized Answers | AutoPilot Geo</title>
        <meta name="description" content="Discover AI-optimized answers and insights. Expert content designed for maximum visibility across AI platforms." />
        <link rel="canonical" href="https://autopilotgeo.com/blog" />
        <meta property="og:title" content="Blog - AI-Optimized Answers | AutoPilot Geo" />
        <meta property="og:description" content="Expert content designed for maximum visibility across AI platforms." />
        <meta property="og:url" content="https://autopilotgeo.com/blog" />
        <meta property="og:type" content="website" />
        <script type="application/ld+json">{JSON.stringify(blogStructuredData)}</script>
      </Helmet>

      <div className="min-h-screen">
        {/* Header - Dark */}
        <header className="border-b border-border bg-white sticky top-0 z-50">
          <div className="container flex h-16 items-center justify-between">
            <Link href="/" className="flex items-center">
              <AnimatedLogo size="sm" />
            </Link>
            <nav className="flex items-center gap-4">
              <Link href="/pricing"><Button variant="ghost" size="sm">Pricing</Button></Link>
              <Link href="/auth"><Button size="sm">Get Started</Button></Link>
            </nav>
          </div>
        </header>

        {/* Hero Section - Dark */}
        <section className="py-16 md:py-24 bg-[hsl(222,47%,11%)]">
          <div className="container">
            <div className="max-w-3xl mx-auto text-center">
              <Badge className="mb-4 bg-white/10 text-white/70 border-white/20">
                <Sparkles className="h-3 w-3 mr-1" />
                AI-Optimized Content
              </Badge>
              <h1 className="text-4xl md:text-5xl font-bold mb-4 text-white">
                Expert Answers & Insights
              </h1>
              <p className="text-xl text-white/80 mb-8">
                Discover content optimized for AI visibility. Each article is crafted to rank first in AI-powered search engines.
              </p>
              <div className="relative max-w-md mx-auto">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/75" />
                <Input
                  aria-label="Search articles"
                  placeholder="Search articles..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/75"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Featured Guides */}
        <section className="bg-white pt-12">
          <div className="container space-y-6">
            <div className="max-w-4xl mx-auto rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 to-white p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <Badge className="mb-3 bg-violet-100 text-violet-700 border-violet-200">Featured Guide</Badge>
                <h2 className="text-xl md:text-2xl font-bold text-[hsl(222,47%,11%)] mb-2">
                  <Link href="/blog/aeo-vs-geo" className="hover:text-violet-700 transition-colors">
                    AEO vs GEO: What Is the Difference Between Answer Engine and Generative Engine Optimization?
                  </Link>
                </h2>
                <p className="text-gray-700 text-sm max-w-xl">
                  A side-by-side comparison of answer engine optimization and generative engine optimization, with tactics for ranking in voice assistants and AI search summaries.
                </p>
              </div>
              <Link
                href="/blog/aeo-vs-geo"
                className="inline-flex items-center gap-2 text-violet-700 font-semibold text-sm shrink-0 hover:gap-3 transition-all"
                aria-label="Read the AEO vs GEO comparison guide"
              >
                Read the AEO vs GEO guide <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="max-w-4xl mx-auto rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <Badge className="mb-3 bg-emerald-100 text-emerald-700 border-emerald-200">Featured Guide</Badge>
                <h2 className="text-xl md:text-2xl font-bold text-[hsl(222,47%,11%)] mb-2">
                  <Link href="/blog/measuring-geo-success" className="hover:text-emerald-700 transition-colors">
                    How to Measure the Success of Generative Engine Optimization Campaigns
                  </Link>
                </h2>
                <p className="text-gray-700 text-sm max-w-xl">
                  A complete framework for tracking AI citation share, brand sentiment in LLM responses, and conversion attribution from generative search.
                </p>
              </div>
              <Link
                href="/blog/measuring-geo-success"
                className="inline-flex items-center gap-2 text-emerald-700 font-semibold text-sm shrink-0 hover:gap-3 transition-all"
                aria-label="Read the GEO success metrics guide"
              >
                Read the GEO metrics guide <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* Articles Grid - White */}
        <section className="py-16 bg-white">
          <div className="container">

            {isLoading ? (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {[...Array(6)].map((_, i) => (
                  <Card key={i}><CardHeader><Skeleton className="h-6 w-3/4" /></CardHeader><CardContent><Skeleton className="h-20 w-full mb-4" /><Skeleton className="h-4 w-1/2" /></CardContent></Card>
                ))}
              </div>
            ) : filteredAnswers.length === 0 ? (
              <div className="text-center py-16">
                <FileText className="h-16 w-16 text-gray-500 mx-auto mb-4" />
                <h2 className="text-2xl font-semibold mb-2 text-[hsl(222,47%,11%)]">{searchQuery ? "No articles found" : "No articles yet"}</h2>
                <p className="text-gray-700 mb-6">{searchQuery ? "Try adjusting your search terms" : "Check back soon for AI-optimized content"}</p>
                {searchQuery && <Button variant="outline" onClick={() => setSearchQuery("")}>Clear Search</Button>}
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-8">
                  <p className="text-gray-700">{filteredAnswers.length} article{filteredAnswers.length !== 1 ? "s" : ""}</p>
                </div>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {filteredAnswers.map((answer) => (
                    <Link key={answer.id} href={`/blog/${answer.slug}`} aria-label={`Read article: ${answer.question}`}>
                      <Card className="h-full hover:shadow-lg transition-shadow group cursor-pointer border-gray-200">
                        <CardHeader>
                          <div className="flex items-start justify-between gap-2">
                            <CardTitle className="text-lg leading-tight group-hover:text-violet-600 transition-colors text-[hsl(222,47%,11%)]">
                              {answer.question}
                            </CardTitle>
                            {answer.score && answer.score >= 80 && (
                              <Badge variant="secondary" className="shrink-0 bg-emerald-100 text-emerald-700">{answer.score}%</Badge>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent>
                          <p className="text-gray-700 text-sm mb-4 line-clamp-3">
                            {truncateText(answer.answer.replace(/<[^>]*>/g, ""), 150)}
                          </p>
                          <div className="flex items-center justify-between text-xs text-gray-600">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(answer.published_at), "MMM d, yyyy")}
                            </div>
                            <div className="flex items-center gap-1 text-violet-600 group-hover:translate-x-1 transition-transform">
                              <span>Read {truncateText(answer.question, 32)}</span> <ArrowRight className="h-3 w-3" aria-hidden="true" />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>

        {/* CTA - Dark */}
        <section className="py-16 bg-[hsl(222,47%,11%)]">
          <div className="container">
            <div className="max-w-2xl mx-auto text-center">
              <h2 className="text-3xl font-bold mb-4 text-white">Want AI-Optimized Content for Your Business?</h2>
              <p className="text-white/80 mb-8">AutoPilot Geo helps you create content that ranks first in AI search engines.</p>
              <Link href="/auth">
                <Button size="lg" className="gap-2 bg-white text-[hsl(222,47%,11%)] hover:bg-white/90">
                  Get Started Free <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <PublicFooter />
      </div>
    </>
  );
}

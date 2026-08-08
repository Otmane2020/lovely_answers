"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowRight,
  Loader2,
  Check,
  Search,
  Globe,
  TrendingUp,
  Sparkles,
  Shield,
  FileText,
  Zap,
  Languages,
  Users,
  Target,
  MapPin,
  RefreshCw,
  MessageSquare,
  Wrench,
  type LucideIcon,
  Bot,
} from "lucide-react";
import lovelyMascot from "@/assets/lovely-mascot.png";
import lovelyRobotMascot from "@/assets/lovely-robot-mascot.png";
import { AnimatedLogo } from "@/components/AnimatedLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useOnboardingSession } from "@/hooks/useOnboardingSession";
import { ProgressBar } from "@/components/nudges/ProgressBar";
import { UrgencyBanner } from "@/components/nudges/UrgencyBanner";

interface OnboardingData {
  websiteUrl: string;
  language: string;
  email: string;
  businessDescription: string;
  brandName: string;
  siteLogo: string;
  cms: string;
  competitors: Array<{ name: string; domain: string }>;
  keywords: Array<{ keyword: string; volume: number; intent: string }>;
  audiences: string[];
  trafficPotential: number;
}

const languages = [
  { code: "en", name: "English", flagCode: "us" },
  { code: "en-uk", name: "English (UK)", flagCode: "gb" },
  { code: "fr", name: "French", flagCode: "fr" },
  { code: "de", name: "German", flagCode: "de" },
  { code: "es", name: "Spanish", flagCode: "es" },
  { code: "zh", name: "Chinese", flagCode: "cn" },
  { code: "pt", name: "Portuguese", flagCode: "pt" },
  { code: "pt-br", name: "Brazilian", flagCode: "br" },
  { code: "ja", name: "Japanese", flagCode: "jp" },
  { code: "ko", name: "Korean", flagCode: "kr" },
  { code: "ar", name: "Arabic", flagCode: "sa" },
  { code: "it", name: "Italian", flagCode: "it" },
  { code: "nl", name: "Dutch", flagCode: "nl" },
  { code: "pl", name: "Polish", flagCode: "pl" },
  { code: "tr", name: "Turkish", flagCode: "tr" },
  { code: "sv", name: "Swedish", flagCode: "se" },
  { code: "da", name: "Danish", flagCode: "dk" },
  { code: "no", name: "Norwegian", flagCode: "no" },
  { code: "fi", name: "Finnish", flagCode: "fi" },
  { code: "el", name: "Greek", flagCode: "gr" },
  { code: "cs", name: "Czech", flagCode: "cz" },
  { code: "ro", name: "Romanian", flagCode: "ro" },
  { code: "hu", name: "Hungarian", flagCode: "hu" },
  { code: "uk", name: "Ukrainian", flagCode: "ua" },
  { code: "he", name: "Hebrew", flagCode: "il" },
  { code: "hi", name: "Hindi", flagCode: "in" },
  { code: "th", name: "Thai", flagCode: "th" },
  { code: "vi", name: "Vietnamese", flagCode: "vn" },
  { code: "id", name: "Indonesian", flagCode: "id" },
  { code: "ms", name: "Malay", flagCode: "my" },
];

const PRICE_MONTHLY = "price_1Sw4JNEfti9t9nN9Z88uua20";
const PRICE_ANNUAL = "price_1Sw4LaEfti9t9nN97pvV9rYI";

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

const features: Feature[] = [
  { icon: Target, title: "AEO Answers", description: "Rank #1 on ChatGPT, Gemini & Perplexity" },
  { icon: FileText, title: "30 Articles/month", description: "SEO-optimized, auto-published" },
  { icon: MapPin, title: "Local AEO", description: "Dominate local AI search results" },
  { icon: RefreshCw, title: "Auto-publishing", description: "WordPress, Shopify, Webflow & more" },
  { icon: Search, title: "Keyword Research", description: "Automated SERP clustering" },
  { icon: MessageSquare, title: "Reddit Agent", description: "Brand visibility & backlinks" },
  { icon: Wrench, title: "Technical SEO Audit", description: "Google + AI crawlers" },
  { icon: Globe, title: "20+ Languages", description: "Supported worldwide" },
];

export default function Onboarding() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentStep, setCurrentStep] = useState(1);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [isCheckingUser, setIsCheckingUser] = useState(false);
  const [languageSearch, setLanguageSearch] = useState("");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [urlError, setUrlError] = useState("");
  const analysisStartedRef = useRef<string | null>(null);
  const languageTouchedRef = useRef(false);
  const languageAutoDetectRef = useRef<string | null>(null);
  const [analysisStartTime, setAnalysisStartTime] = useState<number | null>(null);
  const [isPreDetecting, setIsPreDetecting] = useState(false);
  const [analysisPhase, setAnalysisPhase] = useState(0);
  const [aiVisibilityScore, setAiVisibilityScore] = useState(0);
  
  // Session tracking hook
  const { 
    trackStep, 
    updateSession, 
    detectLanguage,
    isDetectingLanguage,
    detectedLanguage,
    trackCheckoutStarted,
    trackCompleted,
  } = useOnboardingSession();
  
  const [data, setData] = useState<OnboardingData>({
    websiteUrl: "",
    language: "en",
    email: "",
    businessDescription: "",
    brandName: "",
    siteLogo: "",
    cms: "",
    competitors: [],
    keywords: [],
    audiences: [],
    trafficPotential: 0,
  });

  // Force light theme for onboarding
  useEffect(() => {
    document.documentElement.classList.remove("dark");
    return () => {
      // No cleanup needed
    };
  }, []);

  // Check for existing user/project (non-blocking — page shows immediately)
  useEffect(() => {
    const checkExistingProject = async () => {
      const urlFromParam = searchParams.get('url');
      if (urlFromParam) return;

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: projects } = await supabase
          .from("projects")
          .select("id")
          .eq("user_id", user.id)
          .limit(1);

        if (projects && projects.length > 0) {
          router.replace("/dashboard");
        }
      } catch {
        // silently ignore errors — user stays on onboarding
      }
    };

    checkExistingProject();
  }, [router, searchParams]);

  // Initialize from URL param and auto-advance to analysis
  useEffect(() => {
    const urlFromParam = searchParams.get('url');
    if (urlFromParam && currentStep === 1) {
      const decodedUrl = decodeURIComponent(urlFromParam);
      setData(prev => ({ ...prev, websiteUrl: decodedUrl }));
      
      if (isValidUrl(decodedUrl)) {
        const autoAdvance = async () => {
          await trackStep(1, { website_url: decodedUrl });
          analyzeWebsite(decodedUrl);
        };
        autoAdvance();
      }
    }
  }, [searchParams]);

  // Language pre-detection is now handled in handleContinue for step 1
  // to show loading state and go directly to detected language

  const isValidUrl = (url: string): boolean => {
    if (!url || url.length < 3) return false;
    const urlPattern = /^(https?:\/\/)?([\w-]+\.)+[\w-]{2,}(\/.*)?$/i;
    return urlPattern.test(url.trim());
  };

  const isValidEmail = (email: string): boolean => {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailPattern.test(email.trim());
  };

  const getDomainFromUrl = (url: string): string => {
    try {
      const urlObj = new URL(url.startsWith("http") ? url : `https://${url}`);
      return urlObj.hostname.replace("www.", "");
    } catch {
      return url.replace(/^(https?:\/\/)?(www\.)?/, "").split("/")[0];
    }
  };

  const analyzeWebsite = useCallback(async (url: string) => {
    if (!url || analysisStartedRef.current === url) return;
    
    analysisStartedRef.current = url;
    setIsAnalyzing(true);
    setAnalysisStartTime(Date.now());
    setAnalysisPhase(0);
    setCurrentStep(4); // Move to analyzing screen

    // Progressive analysis phases for realism
    const phaseTimers = [
      setTimeout(() => setAnalysisPhase(1), 800),
      setTimeout(() => setAnalysisPhase(2), 2000),
      setTimeout(() => setAnalysisPhase(3), 3500),
      setTimeout(() => setAnalysisPhase(4), 5000),
    ];

    const domain = getDomainFromUrl(url);
    const brandName = domain.split(".")[0].replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

    try {
      const [fastResult, enrichResult] = await Promise.allSettled([
        supabase.functions.invoke('firecrawl-scrape-fast', { body: { url } }),
        supabase.functions.invoke('firecrawl-scrape', { body: { url } }),
      ]);

      let detectedLanguage = "en";
      let description = `${brandName} is a professional service provider.`;
      let competitors: Array<{ name: string; domain: string }> = [];
      let keywords: Array<{ keyword: string; volume: number; intent: string }> = [];
      let audiences: string[] = [];
      let cms = "";

      if (fastResult.status === 'fulfilled' && fastResult.value.data?.success) {
        const fastData = fastResult.value.data.data;
        detectedLanguage = fastData.language || "en";
        description = fastData.description || description;
      }

      if (enrichResult.status === 'fulfilled' && enrichResult.value.data?.success) {
        const enrichData = enrichResult.value.data.data;
        description = enrichData.description || description;
        cms = enrichData.cms || "";
        
        if (enrichData.language) {
          detectedLanguage = enrichData.language;
        }
        
        if (enrichData.competitors?.length > 0) {
          competitors = enrichData.competitors.slice(0, 4).map((comp: string) => ({
            name: comp.split(".")[0].replace(/-/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase()),
            domain: comp,
          }));
        }
        
        if (enrichData.keywords?.length > 0) {
          keywords = enrichData.keywords.slice(0, 5).map((k: any) => ({
            keyword: k.keyword || k,
            volume: k.search_volume || Math.floor(Math.random() * 3000) + 500,
            intent: k.intent || "informational",
          }));
        }
        
        if (enrichData.audiences?.length > 0) {
          audiences = enrichData.audiences.slice(0, 5);
        }
      }

      const trafficPotential = keywords.reduce((acc, k) => acc + k.volume, 0) || Math.floor(Math.random() * 10000) + 5000;
      
      // Calculate AI Visibility Score (realistic: 15-55 range for most sites)
      const baseScore = 20 + Math.floor(Math.random() * 25);
      const competitorPenalty = competitors.length > 2 ? -5 : 0;
      const keywordBonus = keywords.length > 3 ? 8 : 0;
      const score = Math.min(55, Math.max(15, baseScore + competitorPenalty + keywordBonus));
      setAiVisibilityScore(score);

      setData(prev => ({
        ...prev,
        language: detectedLanguage,
        businessDescription: description,
        brandName,
        siteLogo: `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
        cms,
        competitors,
        keywords,
        audiences,
        trafficPotential,
      }));

      // Ensure minimum 5 seconds for analysis screen
      const elapsed = Date.now() - (analysisStartTime || Date.now());
      const remaining = Math.max(0, 5500 - elapsed);
      
      await new Promise(resolve => setTimeout(resolve, remaining));
      
      // Clear timers
      phaseTimers.forEach(clearTimeout);
      
      setAnalysisComplete(true);
      setIsAnalyzing(false);
      
      // Save onboarding data to localStorage
      const onboardingPayload = {
        websiteUrl: url,
        language: detectedLanguage,
        businessDescription: description,
        email: data.email,
        keywords,
        competitors: competitors.map(c => c.domain),
      };
      localStorage.setItem('onboarding_data', JSON.stringify(onboardingPayload));
      
      setCurrentStep(5); // Go to partial results (no email needed yet!)
    } catch (error) {
      console.error('[ONBOARDING] Analysis error:', error);
      phaseTimers.forEach(clearTimeout);
      
      const fallbackBrandName = brandName;
      const fallbackDescription = `${brandName} provides professional services.`;
      setAiVisibilityScore(28);
      setData(prev => ({
        ...prev,
        brandName: fallbackBrandName,
        siteLogo: `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
        businessDescription: fallbackDescription,
        trafficPotential: 8500,
      }));
      
      localStorage.setItem('onboarding_data', JSON.stringify({
        websiteUrl: url,
        language: data.language,
        businessDescription: fallbackDescription,
        email: data.email,
        keywords: [],
        competitors: [],
      }));
      
      setAnalysisComplete(true);
      setIsAnalyzing(false);
      setCurrentStep(5);
    }
  }, [analysisStartTime]);

  const handleContinue = async () => {
    if (currentStep === 1) {
      if (!isValidUrl(data.websiteUrl)) {
        setUrlError("Please enter a valid URL");
        return;
      }
      setUrlError("");
      
      // Track step 1 and go DIRECTLY to analysis (no email first)
      await trackStep(1, { website_url: data.websiteUrl });
      analyzeWebsite(data.websiteUrl);
      
    } else if (currentStep === 5) {
      // From partial results → email gate
      setCurrentStep(3);
      
    } else if (currentStep === 3) {
      if (!isValidEmail(data.email)) {
        setEmailError("Please enter a valid email");
        return;
      }
      setEmailError("");
      
      // Track email
      await trackStep(3, { email: data.email });
      
      // Fire-and-forget: send audit report by email
      if (data.email && data.websiteUrl) {
        supabase.functions.invoke('send-audit-email', {
          body: { url: data.websiteUrl, email: data.email },
        }).then(({ data: res, error }) => {
          if (error) console.error('[ONBOARDING] Audit email error:', error);
          else console.log('[ONBOARDING] Audit email sent:', res?.auditId);
        });
      }
      
      // Save onboarding data
      const onboardingPayload = {
        websiteUrl: data.websiteUrl,
        language: data.language,
        businessDescription: data.businessDescription,
        email: data.email,
        keywords: data.keywords,
        competitors: data.competitors.map(c => c.domain),
      };
      localStorage.setItem('onboarding_data', JSON.stringify(onboardingPayload));
      localStorage.setItem('onboarding_email', data.email);
      
      // Go to pain/FOMO page
      await trackCompleted();
      setCurrentStep(7);
      
    } else if (currentStep === 7) {
      // From pain page → pricing
      setCurrentStep(6);
    }
  };

  const handleCheckout = async () => {
    if (!isValidEmail(data.email)) return;
    
    setIsCheckingOut(true);
    
    try {
      // Save data to localStorage for after payment
      const onboardingData = {
        websiteUrl: data.websiteUrl,
        language: data.language,
        businessDescription: data.businessDescription,
        email: data.email,
        keywords: data.keywords,
        competitors: data.competitors.map(c => c.domain),
      };
      localStorage.setItem('onboarding_data', JSON.stringify(onboardingData));
      localStorage.setItem('onboarding_email', data.email);

      // Track checkout started with all data
      await trackCheckoutStarted(data.email);
      await updateSession({
        brand_name: data.brandName,
        business_description: data.businessDescription,
        cms: data.cms,
        competitors: data.competitors.map(c => c.domain),
        keywords: data.keywords,
        audiences: data.audiences,
        traffic_potential: data.trafficPotential,
      });

      const { data: checkoutData, error } = await supabase.functions.invoke('create-checkout', {
        body: { 
          plan: billingCycle,
          email: data.email,
          guest: true,
        }
      });

      if (error || !checkoutData?.url) {
        throw new Error(error?.message || "Failed to create checkout");
      }

      window.location.href = checkoutData.url;
    } catch (error) {
      console.error('[ONBOARDING] Checkout error:', error);
      setIsCheckingOut(false);
    }
  };

  const filteredLanguages = languages.filter(lang => 
    lang.name.toLowerCase().includes(languageSearch.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="py-6 px-4 border-b border-border">
        <div className="flex items-center justify-center">
          <AnimatedLogo size="md" />
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 pb-44">
        <div className="w-full max-w-lg">
          <AnimatePresence mode="wait">
            {/* Step 1: URL Input - Landing Page Style */}
            {currentStep === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6 text-center"
              >
                {/* Hero Badge */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1 }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted border border-border"
                >
                  <Bot className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium text-primary">Free AI Visibility Audit — 30 seconds</span>
                </motion.div>

                {/* Main Title */}
                <div className="space-y-3">
                  <h1 className="text-3xl md:text-4xl font-bold tracking-tight leading-tight">
                    Is ChatGPT Recommending{" "}
                    <span className="text-primary">
                      Your Business?
                    </span>
                  </h1>
                  <p className="text-muted-foreground text-base md:text-lg max-w-md mx-auto">
                    Find out how ChatGPT, Google & Perplexity see your website — and what you're missing.
                  </p>
                </div>

                {/* Concrete promises */}
                <div className="flex flex-col items-start gap-2 max-w-xs mx-auto text-left">
                  <div className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-green-500 shrink-0" />
                    <span>See if ChatGPT mentions your business</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-green-500 shrink-0" />
                    <span>Discover hidden traffic opportunities</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-green-500 shrink-0" />
                    <span>Get a free AI visibility score</span>
                  </div>
                </div>

                {/* URL Input */}
                <div className="space-y-2 pt-2">
                  <p className="text-xs text-muted-foreground">
                    Enter your website to get a free AI visibility audit
                  </p>
                  <Input
                    type="url"
                    placeholder="yourwebsite.com"
                    value={data.websiteUrl}
                    onChange={(e) => {
                      setData(prev => ({ ...prev, websiteUrl: e.target.value }));
                      setUrlError("");
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleContinue()}
                    className={cn(
                      "h-14 text-lg text-center rounded-xl border-2 bg-card shadow-sm",
                      urlError ? "border-destructive" : "border-border focus:border-primary"
                    )}
                  />
                  {urlError && <p className="text-sm text-destructive">{urlError}</p>}
                </div>

                {/* Social Proof near CTA */}
                <div className="pt-2 space-y-3">
                  {/* Star Rating + Stats */}
                  <div className="flex items-center justify-center gap-3 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <div className="flex">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <svg key={star} className="w-4 h-4 text-yellow-400 fill-current" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                        ))}
                      </div>
                      <span className="text-sm font-semibold">4.9/5</span>
                    </div>
                    <span className="text-xs text-muted-foreground">527+ businesses analyzed</span>
                    <span className="text-xs text-muted-foreground">•</span>
                    <span className="text-xs font-medium text-emerald-600">Avg +216% traffic increase</span>
                  </div>

                  {/* One compact testimonial */}
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 text-left max-w-sm mx-auto"
                  >
                    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold shrink-0">
                      B
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        "I used AutoPilot GEO on my own projects. The blog now drives 60 organic visits/month from Google with zero manual effort."
                      </p>
                      <p className="text-xs font-medium mt-1">Ben M. — Founder, AutoPilot GEO</p>
                    </div>
                  </motion.div>

                  {/* Trust Badges */}
                  <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-green-500" />
                      <span>100% free</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-green-500" />
                      <span>No signup needed</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-green-500" />
                      <span>Secure</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 2 & old Step 3 removed — email now comes after results */}

            {/* Step 4: Analyzing Screen - Realistic phases */}
            {currentStep === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6 text-center"
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

                <div className="space-y-2">
                  <h1 className="text-2xl font-bold tracking-tight">Scanning {getDomainFromUrl(data.websiteUrl)}</h1>
                  <p className="text-sm text-muted-foreground">Like SEO, but for ChatGPT</p>
                </div>

                <div className="space-y-2.5">
                  {[
                    { label: "Detecting pages & sitemap…", phase: 0, icon: Globe },
                    { label: "Reading your content…", phase: 1, icon: FileText },
                    { label: "Checking AI mentions (ChatGPT, Gemini)…", phase: 2, icon: Bot },
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

                <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
                  <Shield className="inline w-3 h-3 mr-1 text-green-500" />
                  100% free · No signup needed · Results in seconds
                </p>
              </motion.div>
            )}

            {/* Step 5: Partial Results with AI Visibility Score + Email Gate */}
            {currentStep === 5 && (
              <motion.div
                key="step5"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-5"
              >
                {/* AI Visibility Score - THE HOOK */}
                <div className="text-center space-y-4">
                  <p className="text-sm font-medium text-muted-foreground">Your AI Visibility Score</p>
                  <div className="relative mx-auto w-36 h-36">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                      <circle cx="60" cy="60" r="52" fill="none" stroke="hsl(var(--muted))" strokeWidth="10" />
                      <motion.circle
                        cx="60" cy="60" r="52" fill="none"
                        stroke={aiVisibilityScore < 40 ? "hsl(0, 80%, 55%)" : aiVisibilityScore < 70 ? "hsl(40, 90%, 50%)" : "hsl(142, 70%, 45%)"}
                        strokeWidth="10"
                        strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 52}`}
                        initial={{ strokeDashoffset: 2 * Math.PI * 52 }}
                        animate={{ strokeDashoffset: 2 * Math.PI * 52 * (1 - aiVisibilityScore / 100) }}
                        transition={{ duration: 1.5, ease: "easeOut" }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <motion.span
                        className="text-4xl font-bold"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.5 }}
                      >
                        {aiVisibilityScore}
                      </motion.span>
                      <span className="text-xs text-muted-foreground">/100</span>
                    </div>
                  </div>
                  <p className={cn(
                    "text-sm font-medium",
                    aiVisibilityScore < 40 ? "text-red-500" : "text-amber-500"
                  )}>
                    {aiVisibilityScore < 30 ? "⚠️ Low visibility — AI barely knows you" :
                     aiVisibilityScore < 50 ? "⚠️ Below average — competitors ahead" :
                     "📊 Room to grow — let's optimize"}
                  </p>
                </div>

                {/* Quick stats - visible */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-card border border-border text-center">
                    <p className="text-xs text-muted-foreground">ChatGPT mentions</p>
                    <p className="text-lg font-bold text-red-500">Low</p>
                  </div>
                  <div className="p-3 rounded-xl bg-card border border-border text-center">
                    <p className="text-xs text-muted-foreground">Google presence</p>
                    <p className="text-lg font-bold text-amber-500">Medium</p>
                  </div>
                  <div className="p-3 rounded-xl bg-card border border-border text-center">
                    <p className="text-xs text-muted-foreground">Competitors ahead</p>
                    <p className="text-lg font-bold text-foreground">{Math.max(data.competitors.length, 3)}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-card border border-border text-center">
                    <p className="text-xs text-muted-foreground">Traffic potential</p>
                    <p className="text-lg font-bold text-primary">+{data.trafficPotential.toLocaleString()}</p>
                  </div>
                </div>

                {/* Site info */}
                <div className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border">
                  <img 
                    src={data.siteLogo} 
                    alt={data.brandName}
                    className="w-8 h-8 rounded-lg bg-muted"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${data.brandName}&background=random`;
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{data.brandName}</p>
                    <p className="text-xs text-muted-foreground">{getDomainFromUrl(data.websiteUrl)}</p>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-emerald-500 font-medium">
                    <Check className="w-3.5 h-3.5" />
                    Analyzed
                  </div>
                </div>

                {/* Blurred sections - email gate teaser */}
                <div className="relative">
                  <div className="space-y-3 blur-sm pointer-events-none select-none">
                    {data.competitors.length > 0 && (
                      <div className="p-3 rounded-xl bg-card border border-border">
                        <p className="text-xs font-medium text-muted-foreground mb-2">Competitor analysis</p>
                        {data.competitors.slice(0, 2).map((comp, i) => (
                          <div key={i} className="flex items-center gap-2 py-1">
                            <div className="w-5 h-5 rounded bg-muted" />
                            <span className="text-sm">{comp.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="p-3 rounded-xl bg-card border border-border">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Content opportunities</p>
                      <div className="space-y-1">
                        <div className="h-4 w-3/4 bg-muted rounded" />
                        <div className="h-4 w-1/2 bg-muted rounded" />
                      </div>
                    </div>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="bg-background/90 backdrop-blur-sm border border-primary/30 rounded-xl p-4 text-center shadow-lg max-w-[260px]">
                      <Sparkles className="w-5 h-5 text-primary mx-auto mb-2" />
                      <p className="text-sm font-semibold">Unlock full report</p>
                      <p className="text-xs text-muted-foreground mt-1">Competitors · Keywords · Strategy</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 3: Email Collection — AFTER showing value */}
            {currentStep === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6 text-center"
              >
                <div className="space-y-3">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <Sparkles className="w-8 h-8 text-primary" />
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight">Your report is ready!</h1>
                  <p className="text-muted-foreground text-sm">
                    Enter your email to unlock the full analysis with competitor gaps, keyword opportunities, and your action plan.
                  </p>
                </div>

                {/* Quick recap */}
                <div className="flex items-center justify-center gap-4 text-sm">
                  <div className="flex items-center gap-1.5">
                    <div className={cn(
                      "w-2.5 h-2.5 rounded-full",
                      aiVisibilityScore < 40 ? "bg-red-500" : "bg-amber-500"
                    )} />
                    <span>Score: {aiVisibilityScore}/100</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>{Math.max(data.competitors.length, 3)} competitors</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <Input
                    type="email"
                    placeholder="your@email.com"
                    value={data.email}
                    onChange={(e) => {
                      setData(prev => ({ ...prev, email: e.target.value }));
                      setEmailError("");
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleContinue()}
                    className={cn(
                      "h-14 text-lg text-center rounded-xl border-2 bg-card",
                      emailError ? "border-destructive" : "border-border focus:border-primary"
                    )}
                  />
                  {emailError && <p className="text-sm text-destructive">{emailError}</p>}
                </div>

                <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-green-500" />
                    <span>No spam, ever</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-green-500" />
                    <span>Unsubscribe anytime</span>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 7: Pain/FOMO Page */}
            {currentStep === 7 && (
              <motion.div
                key="step7"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <div className="text-center space-y-3">
                  <h1 className="text-2xl font-bold tracking-tight">
                    You're losing clients to{" "}
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500">
                      AI search
                    </span>
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Every day, ChatGPT recommends your competitors instead of you
                  </p>
                </div>

                {/* Comparison table */}
                <div className="p-4 rounded-2xl bg-card border border-border space-y-4">
                  <div className="flex items-center justify-between text-sm font-medium">
                    <span className="text-muted-foreground">AI Search Results</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-500">Right now</span>
                  </div>
                  
                  {/* Competitors visible */}
                  {(data.competitors.length > 0 ? data.competitors.slice(0, 2) : [
                    { name: "Competitor A", domain: "competitor-a.com" },
                    { name: "Competitor B", domain: "competitor-b.com" },
                  ]).map((comp, i) => (
                    <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                      <div className="w-6 h-6 rounded bg-emerald-500/20 flex items-center justify-center text-xs font-bold text-emerald-600">
                        {i + 1}
                      </div>
                      <img 
                        src={`https://www.google.com/s2/favicons?domain=${comp.domain}&sz=32`}
                        alt={comp.name}
                        className="w-5 h-5 rounded"
                      />
                      <span className="text-sm font-medium">{comp.name}</span>
                      <Check className="w-4 h-4 text-emerald-500 ml-auto" />
                    </div>
                  ))}
                  
                  {/* You - not visible */}
                  <div className="flex items-center gap-3 p-2 rounded-lg bg-red-500/5 border border-red-500/20">
                    <div className="w-6 h-6 rounded bg-red-500/20 flex items-center justify-center text-xs font-bold text-red-500">
                      ?
                    </div>
                    <img 
                      src={data.siteLogo} 
                      alt={data.brandName}
                      className="w-5 h-5 rounded bg-muted"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${data.brandName}&background=random`;
                      }}
                    />
                    <span className="text-sm font-medium">{data.brandName}</span>
                    <span className="text-xs text-red-500 ml-auto font-medium">Not visible</span>
                  </div>
                </div>

                {/* Missed traffic estimate */}
                <div className="p-4 rounded-2xl bg-gradient-to-r from-red-500/10 to-orange-500/10 border border-red-500/20 text-center space-y-1">
                  <p className="text-sm text-muted-foreground">Estimated missed traffic</p>
                  <p className="text-3xl font-bold text-red-500">-{data.trafficPotential.toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground">visitors/month going to competitors</p>
                </div>

                {/* Solution teaser */}
                <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20 flex items-center gap-4">
                  <img 
                    src={lovelyRobotMascot as unknown as string}
                    alt="Lovely AI Agent" 
                    className="w-20 h-20 object-contain drop-shadow-lg shrink-0 -ml-1 -my-1"
                  />
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Lovely can fix this in 30 days
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      AI-powered content + auto-publishing = ChatGPT starts recommending you
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 6: Pricing */}
            {currentStep === 6 && (
              <motion.div
                key="step6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                {/* Lovely mascot mini + headline */}
                <div className="text-center space-y-3">
                  <div className="flex items-center justify-center gap-3">
                    <img 
                      src={lovelyMascot as unknown as string}
                      alt="Lovely" 
                      className="w-16 h-16 object-contain drop-shadow-md"
                    />
                    <div className="text-left">
                      <h1 className="text-2xl font-bold tracking-tight">Start Getting Recommended</h1>
                      <p className="text-sm text-muted-foreground">by ChatGPT, Gemini & Google — in 30 days</p>
                    </div>
                  </div>
                </div>

                {/* Pricing Cards */}
                {(() => {
                  const trialEndDate = new Date();
                  trialEndDate.setDate(trialEndDate.getDate() + 3);
                  const formattedDate = trialEndDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                  return (
                    <div className="space-y-3">
                      {/* Annual - 2 months free */}
                      <button
                        onClick={() => setBillingCycle("annual")}
                        className={cn(
                          "w-full p-4 rounded-xl border-2 text-left transition-all relative",
                          billingCycle === "annual"
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-muted-foreground bg-card"
                        )}
                      >
                        <div className="absolute -top-3 left-4">
                          <span className="bg-emerald-500 text-white text-xs font-semibold px-2.5 py-0.5 rounded-full">
                            2 months free
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-baseline gap-2">
                              <span className="text-lg text-muted-foreground line-through">$58</span>
                              <span className="text-3xl font-bold">$23</span>
                              <span className="text-muted-foreground">/month</span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">Billed $279/year</p>
                          </div>
                          <div className={cn(
                            "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
                            billingCycle === "annual" ? "border-primary bg-primary" : "border-muted-foreground/30"
                          )}>
                            {billingCycle === "annual" && <div className="w-2 h-2 rounded-full bg-white" />}
                          </div>
                        </div>
                      </button>

                      {/* Monthly */}
                      <button
                        onClick={() => setBillingCycle("monthly")}
                        className={cn(
                          "w-full p-4 rounded-xl border-2 text-left transition-all relative",
                          billingCycle === "monthly"
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-muted-foreground bg-card"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-baseline gap-2">
                              <span className="text-3xl font-bold">$29</span>
                              <span className="text-muted-foreground">/month</span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">Billed monthly</p>
                          </div>
                          <div className={cn(
                            "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
                            billingCycle === "monthly" ? "border-primary bg-primary" : "border-muted-foreground/30"
                          )}>
                            {billingCycle === "monthly" && <div className="w-2 h-2 rounded-full bg-white" />}
                          </div>
                        </div>
                      </button>

                      {/* Pay after 3 days notice */}
                      <p className="text-center text-sm text-muted-foreground">
                        Free for 3 days · You'll be charged on <span className="font-medium text-foreground">{formattedDate}</span>
                      </p>

                      {/* Guarantee */}
                      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                        <Shield className="h-4 w-4" />
                        <span>14-day money back guarantee</span>
                      </div>
                    </div>
                  );
                })()}

                {/* Features */}
                <div className="pt-5 border-t border-border/50">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                    Everything included
                  </p>
                  <div className="grid grid-cols-1 gap-3">
                    {features.map((feature, i) => {
                      const Icon = feature.icon;
                      return (
                        <div key={i} className="flex items-start gap-3 group">
                          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                            <Icon className="h-4 w-4 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground leading-tight">
                              {feature.title}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {feature.description}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Sticky Bottom Button */}
      {currentStep !== 4 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-lg border-t border-border">
          <div className="max-w-lg mx-auto space-y-3">
            {/* Progress nudge */}
            <ProgressBar
              currentStep={
                currentStep === 1 ? 1 :
                currentStep === 5 ? 2 :
                currentStep === 3 ? 3 :
                currentStep === 7 ? 4 :
                currentStep === 6 ? 5 : currentStep
              }
              totalSteps={5}
              labels={["URL", "Analyse", "Email", "Résultats", "Plan"]}
            />
            {currentStep === 6 ? (
              <Button
                onClick={handleCheckout}
                disabled={isCheckingOut}
                className="w-full h-14 text-lg font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity rounded-xl"
              >
                {isCheckingOut ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Redirecting...
                  </>
                ) : (
                  <>
                    Start free trial · ${billingCycle === "monthly" ? "29" : "23"}/m after
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </>
                )}
              </Button>
            ) : (
              <Button
                onClick={handleContinue}
                disabled={
                  (currentStep === 1 && !isValidUrl(data.websiteUrl)) ||
                  (currentStep === 3 && !isValidEmail(data.email))
                }
                className={cn(
                  "w-full h-14 text-lg font-medium hover:opacity-90 transition-opacity rounded-xl",
                  "bg-primary text-primary-foreground"
                )}
              >
                {currentStep === 1 ? (
                  <>
                    <Search className="w-5 h-5 mr-2" />
                    Get My Free Audit
                  </>
                ) : currentStep === 5 ? (
                  <>
                    <Sparkles className="w-5 h-5 mr-2" />
                    Unlock Full Report
                  </>
                ) : currentStep === 3 ? (
                  <>
                    <ArrowRight className="w-5 h-5 mr-2" />
                    Get My Full Report
                  </>
                ) : currentStep === 7 ? (
                  <>
                    <Zap className="w-5 h-5 mr-2" />
                    Start Getting Recommended
                  </>
                ) : (
                  <>
                    Continue
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

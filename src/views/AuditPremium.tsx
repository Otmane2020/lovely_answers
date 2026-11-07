"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScoreRing } from "@/components/ui/score-ring";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { AnimatedLogo } from "@/components/AnimatedLogo";
import {
  ArrowRight,
  Globe,
  TrendingUp,
  Target,
  Users,
  Zap,
  Shield,
  BarChart3,
  Search,
  Sparkles,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Building2,
  Clock,
  ChevronRight,
  Loader2,
  Lock,
  CreditCard,
} from "lucide-react";
import { AuditPaywall } from "@/components/audit/AuditPaywall";
import { AuditReportDisplay } from "@/components/audit/AuditReportDisplay";

type Report = {
  id: string;
  url: string;
  slug: string;
  company_info: any;
  scores: any;
  macro_analysis: any;
  micro_analysis: any;
  recommendations: any;
  kpi_tracking: any[];
};

export default function AuditPremium() {
  const searchParams = useSearchParams();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState(searchParams.get("url") || "");
  const [isPaid, setIsPaid] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    const sessionId = searchParams.get("session_id");
    const idParam = searchParams.get("id");
    const urlParam = searchParams.get("url");

    if (sessionId) {
      verifyPayment(sessionId);
    } else if (idParam) {
      // Direct report access (e.g. shared link)
      loadReportById(idParam);
    }
  }, [searchParams]);

  const verifyPayment = async (sessionId: string) => {
    setIsVerifying(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("verify-audit-payment", {
        body: { session_id: sessionId },
      });

      if (fnError) throw fnError;

      if (data?.paid) {
        setIsPaid(true);
        // Auto-start the analysis after successful payment
        const urlParam = searchParams.get("url");
        if (urlParam) {
          analyzeUrl(urlParam);
        }
      } else {
        setError("Payment not confirmed. Please try again.");
      }
    } catch (err: any) {
      console.error("[audit-premium] Payment verification error:", err);
      setError("Could not verify payment. Please contact support.");
    } finally {
      setIsVerifying(false);
    }
  };

  const loadReportById = async (id: string) => {
    setLoading(true);
    setError(null);
    const { data, error: dbError } = await supabase
      .from("reports")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (dbError || !data) {
      setError("Report not found");
    } else {
      setReport(data as any);
      setIsPaid(true); // Existing reports are already paid
    }
    setLoading(false);
  };

  const analyzeUrl = async (url: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("analyze-aeo", {
        body: { url },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setReport(data.report);
    } catch (err: any) {
      setError(err.message || "Analysis failed");
    }
    setLoading(false);
  };

  const showPaywall = !isPaid && !report && !loading && !isVerifying;

  return (
    <>
      <Helmet>
        <title>Premium AEO Audit – Competitor Analysis | AutoPilot Geo</title>
        <meta name="description" content="Get a comprehensive AEO audit with competitor analysis, market trends, and strategic recommendations." />
        <link rel="canonical" href="https://autopilotgeo.com/audit-premium" />
      </Helmet>

      <div className="min-h-screen bg-background">
        {/* Navbar */}
        <nav className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
          <div className="container flex h-16 items-center justify-between px-4">
            <Link href="/" className="flex items-center">
              <AnimatedLogo size="md" />
            </Link>
            <Button className="gap-2 bg-gradient-to-r from-primary to-violet-500 text-white" asChild>
              <Link href="/onboarding">
                <Sparkles className="h-4 w-4" />
                Start Free
              </Link>
            </Button>
          </div>
        </nav>

        {/* Payment Verification Loading */}
        {isVerifying && (
          <section className="py-20">
            <div className="container px-4 max-w-2xl mx-auto text-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="inline-block mb-6"
              >
                <CreditCard className="h-12 w-12 text-primary" />
              </motion.div>
              <h2 className="text-2xl font-bold mb-2">Verifying your payment...</h2>
              <p className="text-muted-foreground">Please wait a moment while we confirm your purchase.</p>
            </div>
          </section>
        )}

        {/* Paywall */}
        {showPaywall && (
          <AuditPaywall
            urlInput={urlInput}
            setUrlInput={setUrlInput}
            error={error}
          />
        )}

        {/* Analysis Loading */}
        {loading && (
          <section className="py-20">
            <div className="container px-4 max-w-4xl mx-auto text-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="inline-block mb-6"
              >
                <Search className="h-12 w-12 text-primary" />
              </motion.div>
              <h2 className="text-2xl font-bold mb-2">Deep Analysis in Progress...</h2>
              <p className="text-muted-foreground mb-8">Scraping content, analyzing competitors, generating report (~30s)</p>
              <div className="space-y-4 max-w-2xl mx-auto">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-xl" />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Report Display */}
        {report && !loading && (
          <AuditReportDisplay report={report} />
        )}

        <PublicFooter />
      </div>
    </>
  );
}

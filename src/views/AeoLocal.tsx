"use client";
import { Loader2 } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquare, Calendar, MapPin, TrendingUp, Check, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { useLocalBusiness } from "@/hooks/useLocalBusiness";
import { useActiveProject } from "@/hooks/useProjects";
import { useGoogleBusiness } from "@/hooks/useGoogleBusiness";
import { BusinessSearch } from "@/components/local/BusinessSearch";
import { LocalBusinessCard } from "@/components/local/LocalBusinessCard";
import { LocalAnswersTab } from "@/components/local/LocalAnswersTab";
import { LocalPlanningTab } from "@/components/local/LocalPlanningTab";
import { LocalHeatmap } from "@/components/local/LocalHeatmap";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";


export default function AeoLocal() {
  const { business, isLoading, isInitialLoading, selectBusiness, clearBusiness } = useLocalBusiness();
  const { project } = useActiveProject();
  const { isConnected, disconnectGMB, isLoading: gmbLoading } = useGoogleBusiness();

  const handleConnectGMB = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please sign in first");
        return;
      }

      // GMB OAuth is whitelisted on /integrations only — remember to come back here
      try { sessionStorage.setItem("gmb_return_to", "/local"); } catch {}

      const { data, error } = await supabase.functions.invoke("gmb-oauth-url", {
        body: {
          redirectUri: `${window.location.origin}/integrations`,
          projectId: project?.id,
        },
      });

      if (error) throw error;

      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (error: any) {
      console.error("Error connecting GMB:", error);
      toast.error("Failed to start Google Business connection");
    }
  };


  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          icon={MapPin}
          title="Local AEO"
          description="Optimize your local AI visibility"
          gradientFrom="from-orange-500/10"
          gradientVia="via-amber-500/10"
          gradientTo="to-yellow-500/10"
          iconFrom="from-orange-500"
          iconTo="to-amber-600"
        />

        {/* GMB Connection Card */}
        <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-primary/10">
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <img
                  src="https://www.google.com/images/branding/googleg/1x/googleg_standard_color_128dp.png"
                  alt="Google"
                  className="h-8 w-8"
                />
                <div>
                  <h3 className="font-semibold text-sm sm:text-base">Google My Business</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    {isConnected
                      ? "Connected — auto-publish Q&A to your business profile"
                      : "Connect to auto-publish answers to your Google Business Profile"}
                  </p>
                </div>
              </div>
              {isConnected ? (
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className="bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800 gap-1.5">
                    <Check className="h-3 w-3" />
                    Connected
                  </Badge>
                  <Button variant="outline" size="sm" onClick={disconnectGMB} className="text-destructive border-destructive/30 hover:bg-destructive/10">
                    Disconnect
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={handleConnectGMB}
                  disabled={gmbLoading}
                  size="sm"
                  className="shrink-0 gap-2"
                >
                  {gmbLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ExternalLink className="h-4 w-4" />
                  )}
                  Connect GMB
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {!business ? (
          <BusinessSearch onSelectBusiness={selectBusiness} isLoading={isLoading} />
        ) : (
          <>
            <LocalBusinessCard business={business} businessDescription={project?.business_description} onClear={clearBusiness} />
            <Tabs defaultValue="answers" className="space-y-6">
              <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid">
                <TabsTrigger value="answers" className="gap-2"><MessageSquare className="h-4 w-4" /><span className="hidden sm:inline">Local Q&A</span><span className="sm:hidden">Q&A</span></TabsTrigger>
                <TabsTrigger value="planning" className="gap-2"><Calendar className="h-4 w-4" /><span className="hidden sm:inline">Planning</span><span className="sm:hidden">Plan</span></TabsTrigger>
                <TabsTrigger value="heatmap" className="gap-2"><TrendingUp className="h-4 w-4" /><span className="hidden sm:inline">Visibility</span><span className="sm:hidden">Map</span></TabsTrigger>
              </TabsList>
              <TabsContent value="answers"><LocalAnswersTab business={business} /></TabsContent>
              <TabsContent value="planning"><LocalPlanningTab businessName={business.name} businessId={business.id} /></TabsContent>
              <TabsContent value="heatmap"><LocalHeatmap businessName={business.name} location={business.address} /></TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

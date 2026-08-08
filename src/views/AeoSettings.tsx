import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Settings, Mail } from "lucide-react";
import { SubscriptionGate } from "@/components/aeo/SubscriptionGate";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserSettings } from "./settings/UserSettings";
import { BusinessSettings } from "./settings/BusinessSettings";
import { TeamMembers } from "./settings/TeamMembers";
import { ArticleSettings } from "./settings/ArticleSettings";
import { ArticleVisuals } from "./settings/ArticleVisuals";
import { IntegrationsSettings } from "./settings/IntegrationsSettings";
import { CompetitorSettings } from "./settings/CompetitorSettings";
import { KeywordsSettings } from "./settings/KeywordsSettings";
import { AudiencesSettings } from "./settings/AudiencesSettings";
import { AnalyticsSettings } from "./settings/AnalyticsSettings";
import { BulkArticleGenerator } from "./settings/BulkArticleGenerator";
import { BacklinksSettings } from "./settings/BacklinksSettings";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";

const ADMIN_EMAILS = ["otmane.benyahya@sweetdeco.com", "oben.rockman@gmail.com"];

export default function AeoSettings() {
  const { user } = useAuth();
  const isAdmin = user?.email ? ADMIN_EMAILS.includes(user.email) : false;
  const [sendingTest, setSendingTest] = useState(false);

  const handleSendTestEmail = async () => {
    if (!user?.email) return;
    setSendingTest(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-email", {
        body: { type: "test", to: user.email, name: user.user_metadata?.full_name || "" },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success(`Email test envoyé à ${user.email}`);
      } else {
        throw new Error(data?.error || "Erreur inconnue");
      }
    } catch (err: any) {
      toast.error(`Erreur: ${err.message}`);
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <DashboardLayout>
      <SubscriptionGate title="Unlock Advanced Settings" description="Fine-tune your AI content strategy, manage team members, and configure publishing preferences.">
      <div className="space-y-6">
        <PageHeader
          icon={Settings}
          title="Settings"
          description="Configure your AEO project"
          gradientFrom="from-gray-500/10"
          gradientVia="via-slate-500/10"
          gradientTo="to-zinc-500/10"
          iconFrom="from-gray-500"
          iconTo="to-slate-600"
        />

        <Tabs defaultValue="user" className="w-full">
          <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent flex-wrap gap-0">
            <TabsTrigger 
              value="user"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3"
            >
              User Settings
            </TabsTrigger>
            <TabsTrigger 
              value="business"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3"
            >
              Business Settings
            </TabsTrigger>
            <TabsTrigger 
              value="keywords"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3"
            >
              Keywords
            </TabsTrigger>
            <TabsTrigger 
              value="team"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3"
            >
              Team Members
            </TabsTrigger>
            <TabsTrigger 
              value="article"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3"
            >
              Article Settings
            </TabsTrigger>
            <TabsTrigger 
              value="visuals"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3"
            >
              Article Visuals
            </TabsTrigger>
            <TabsTrigger 
              value="integrations"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3"
            >
              Integrations
            </TabsTrigger>
            <TabsTrigger 
              value="competitors"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3"
            >
              Competitors
            </TabsTrigger>
            <TabsTrigger 
              value="audiences"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3"
            >
              Audiences
            </TabsTrigger>
            <TabsTrigger 
              value="analytics"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3"
            >
              Google Analytics
            </TabsTrigger>
            <TabsTrigger 
              value="backlinks"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3"
            >
              Backlinks IA
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger 
                value="bulk-generator"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3"
              >
                Bulk Generator
              </TabsTrigger>
            )}
          </TabsList>

          <div className="mt-6 max-w-2xl">
            <TabsContent value="user" className="mt-0">
              <UserSettings />
              {isAdmin && (
                <div className="mt-6 p-4 border rounded-lg bg-muted/30">
                  <h3 className="text-sm font-medium mb-2">Email Test</h3>
                  <p className="text-xs text-muted-foreground mb-3">Envoyer un email test à {user?.email} depuis support@autopilotgeo.com</p>
                  <Button onClick={handleSendTestEmail} disabled={sendingTest} size="sm" variant="outline">
                    <Mail className="mr-2 h-4 w-4" />
                    {sendingTest ? "Envoi..." : "Envoyer email test"}
                  </Button>
                </div>
              )}
            </TabsContent>
            <TabsContent value="business" className="mt-0">
              <BusinessSettings />
            </TabsContent>
            <TabsContent value="keywords" className="mt-0">
              <KeywordsSettings />
            </TabsContent>
            <TabsContent value="team" className="mt-0">
              <TeamMembers />
            </TabsContent>
            <TabsContent value="article" className="mt-0">
              <ArticleSettings />
            </TabsContent>
            <TabsContent value="visuals" className="mt-0">
              <ArticleVisuals />
            </TabsContent>
            <TabsContent value="integrations" className="mt-0">
              <IntegrationsSettings />
            </TabsContent>
            <TabsContent value="competitors" className="mt-0">
              <CompetitorSettings />
            </TabsContent>
            <TabsContent value="audiences" className="mt-0">
              <AudiencesSettings />
            </TabsContent>
            <TabsContent value="analytics" className="mt-0">
              <AnalyticsSettings />
            </TabsContent>
            <TabsContent value="backlinks" className="mt-0 max-w-2xl">
              <BacklinksSettings />
            </TabsContent>
            {isAdmin && (
              <TabsContent value="bulk-generator" className="mt-0 max-w-4xl">
                <BulkArticleGenerator />
              </TabsContent>
            )}
          </div>
        </Tabs>
      </div>
      </SubscriptionGate>
    </DashboardLayout>
  );
}

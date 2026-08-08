"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sparkles, X, ExternalLink, Loader2, AlertTriangle, Link2, RefreshCw, CheckCircle2, Trash2, Plus } from "lucide-react";
import { useActiveProject, useUpdateProject } from "@/hooks/useProjects";
import { useSitePages, useParseSitemap, useSitePagesCount } from "@/hooks/useSitePages";
import { usePlanFeatures } from "@/hooks/usePlanFeatures";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";

const siteWizardPath = (url?: string) =>
  url ? `/wizard?addSite=1&url=${encodeURIComponent(url.trim())}` : "/wizard?addSite=1";

export function BusinessSettings() {
  const router = useRouter();
  const { project, projects, isLoading } = useActiveProject();
  const updateProject = useUpdateProject();
  const { data: sitePages = [] } = useSitePages();
  const { data: sitePagesCount = 0 } = useSitePagesCount();
  const parseSitemap = useParseSitemap();
  const { sitesLimit, sitesUnlimited, hasPlan, plan } = usePlanFeatures();
  const currentSitesCount = projects?.length ?? 0;
  const canAddSite = hasPlan && (sitesUnlimited || (typeof sitesLimit === "number" && currentSitesCount < sitesLimit));

  const [websiteUrl, setWebsiteUrl] = useState("");
  const [description, setDescription] = useState("");
  const [audienceTags, setAudienceTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [brandColor, setBrandColor] = useState("#000000");
  const [brandVoice, setBrandVoice] = useState("");
  const [sitemapUrl, setSitemapUrl] = useState("");
  
  // URL change confirmation
  const [showUrlChangeWarning, setShowUrlChangeWarning] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [originalUrl, setOriginalUrl] = useState("");
  const [showPagesDialog, setShowPagesDialog] = useState(false);
  const [showDeleteAllWarning, setShowDeleteAllWarning] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showAddUrlDialog, setShowAddUrlDialog] = useState(false);
  const [newUrl, setNewUrl] = useState("");

  const handleParseSitemap = async () => {
    if (!sitemapUrl.trim()) {
      toast.error("Please enter a sitemap URL first");
      return;
    }

    try {
      const result = await parseSitemap.mutateAsync(sitemapUrl);
      toast.success(`Found ${result.totalFound} pages, imported ${result.inserted} for internal linking`);
      setShowPagesDialog(true);
    } catch (error: any) {
      toast.error("Failed to parse sitemap: " + (error.message || "Unknown error"));
    }
  };

  // Load data from project when it's available
  useEffect(() => {
    if (project) {
      setWebsiteUrl(project.website_url || "");
      setOriginalUrl(project.website_url || "");
      setDescription(project.business_description || "");
      if (project.audience) {
        try {
          const parsed = JSON.parse(project.audience);
          setAudienceTags(Array.isArray(parsed) ? parsed : [project.audience]);
        } catch {
          setAudienceTags(project.audience.split(",").map(s => s.trim()).filter(Boolean));
        }
      }
      setBrandColor((project as any).brand_color || "#000000");
      setBrandVoice((project as any).brand_voice_url || "");
      setSitemapUrl((project as any).sitemap_url || "");
    }
  }, [project]);

  const addTag = () => {
    if (newTag && !audienceTags.includes(newTag)) {
      setAudienceTags([...audienceTags, newTag]);
      setNewTag("");
    }
  };

  const removeTag = (tag: string) => {
    setAudienceTags(audienceTags.filter(t => t !== tag));
  };

  const hasUrlChanged = () => {
    return websiteUrl.trim() !== originalUrl.trim() && websiteUrl.trim() !== "";
  };

  const handleSave = async () => {
    if (!project) return;

    if (hasUrlChanged()) {
      setShowUrlChangeWarning(true);
      return;
    }

    await saveWithoutUrlChange();
  };

  const saveWithoutUrlChange = async () => {
    if (!project) return;

    try {
      await updateProject.mutateAsync({
        projectId: project.id,
        updates: {
          business_description: description,
          audience: JSON.stringify(audienceTags),
          brand_color: brandColor,
          brand_voice_url: brandVoice,
          sitemap_url: sitemapUrl,
        },
      });
      toast.success("Business settings saved");
    } catch (error) {
      toast.error("Failed to save settings");
    }
  };

  const handleConfirmUrlChange = async () => {
    if (!project) return;
    
    setIsResetting(true);
    setShowUrlChangeWarning(false);

    try {
      // Delete the project and all its content
      const response = await supabase.functions.invoke("delete-project-content", {
        body: {
          projectId: project.id,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      toast.success("Project deleted. Redirecting to onboarding...");
      
      // Clear any cached onboarding data
      localStorage.removeItem('onboarding_data');
      
      // Redirect to the paid-user site wizard with the new URL
      router.push(siteWizardPath(websiteUrl));
      
    } catch (error: unknown) {
      console.error("URL change failed:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast.error("Failed to change URL: " + errorMessage);
      setWebsiteUrl(originalUrl);
      setIsResetting(false);
    }
  };

  const handleDeleteAll = async () => {
    if (!project) return;
    
    setIsDeleting(true);
    setShowDeleteAllWarning(false);

    try {
      const response = await supabase.functions.invoke("delete-project-content", {
        body: {
          projectId: project.id,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      toast.success("All data deleted. Redirecting to onboarding...");
      
      localStorage.removeItem('onboarding_data');
      router.push(siteWizardPath());
      
    } catch (error: unknown) {
      console.error("Delete all failed:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast.error("Failed to delete: " + errorMessage);
      setIsDeleting(false);
    }
  };

  const handleAddUrl = () => {
    if (!newUrl.trim()) {
      toast.error("Please enter a URL");
      return;
    }
    if (!canAddSite) {
      if (!hasPlan) {
        toast.error("Subscribe to a plan to add more sites");
      } else {
        toast.error(`Your ${plan ?? "current"} plan allows up to ${sitesLimit} site${(sitesLimit ?? 1) > 1 ? "s" : ""}. Upgrade to add more.`);
      }
      setShowAddUrlDialog(false);
      router.push("/checkout?plan=pro");
      return;
    }

    localStorage.removeItem('onboarding_data');
    router.push(siteWizardPath(newUrl));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!project) {
    return (
      <Card className="p-6">
        <p className="text-muted-foreground">No project found. Please create a project first.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <AlertDialog open={showUrlChangeWarning} onOpenChange={setShowUrlChangeWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Warning: Changing Website URL
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p className="font-semibold text-foreground">
                This action is IRREVERSIBLE and will permanently delete ALL your data:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>All generated answers</li>
                <li>All articles</li>
                <li>Complete content planning</li>
                <li>All keywords</li>
                <li>All Reddit responses</li>
              </ul>
              <p className="pt-2">
                After deletion, a new 30-day content generation will start automatically for the new URL.
              </p>
              <div className="bg-muted p-3 rounded-md mt-2">
                <p className="text-sm">
                  <span className="text-muted-foreground">Current:</span> {originalUrl}<br/>
                  <span className="text-muted-foreground">New:</span> {websiteUrl}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmUrlChange}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Confirm & Delete All Data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card className="p-6">
        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="websiteUrl">Website URL</Label>
            <Input
              id="websiteUrl"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://example.com"
              className={hasUrlChanged() ? "border-amber-500 focus-visible:ring-amber-500" : ""}
            />
            {hasUrlChanged() && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Changing URL will delete all existing content
              </p>
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <div className="relative">
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your business..."
                className="min-h-[100px] pr-32"
              />
              <Button
                variant="outline"
                size="sm"
                className="absolute top-2 right-2 gap-1.5"
              >
                <Sparkles className="w-3 h-3" />
                Generate with AI
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Target Audience</Label>
            <p className="text-xs text-muted-foreground">Minimum 2 required</p>
            <div className="flex flex-wrap gap-2 mb-2">
              {audienceTags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                  {tag}
                  <button
                    onClick={() => removeTag(tag)}
                    className="ml-1 hover:bg-muted rounded-full p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="Add audience segment"
                onKeyPress={(e) => e.key === "Enter" && addTag()}
              />
              <Button variant="outline" onClick={addTag}>Add</Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="brandColor">Brand Color</Label>
            <div className="flex gap-3 items-center">
              <input
                type="color"
                id="brandColor"
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                className="w-10 h-10 rounded-lg border cursor-pointer"
              />
              <Input
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                className="flex-1 font-mono"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="brandVoice">Brand Voice Article</Label>
            <Input
              id="brandVoice"
              value={brandVoice}
              onChange={(e) => setBrandVoice(e.target.value)}
              placeholder="https://example.com/about-us"
            />
            <p className="text-xs text-muted-foreground">
              URL to an article that represents your brand voice
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="sitemap">Sitemap URL</Label>
              {sitePagesCount > 0 && (
                <Badge variant="secondary" className="gap-1">
                  <Link2 className="w-3 h-3" />
                  {sitePagesCount} pages detected
                </Badge>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                id="sitemap"
                value={sitemapUrl}
                onChange={(e) => setSitemapUrl(e.target.value)}
                placeholder="https://example.com/sitemap.xml"
                className="flex-1"
              />
              <Button 
                variant="outline" 
                className="gap-1.5 shrink-0"
                onClick={handleParseSitemap}
                disabled={parseSitemap.isPending}
              >
                {parseSitemap.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Parsing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Detect Links
                  </>
                )}
              </Button>
              {sitePagesCount > 0 && (
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => setShowPagesDialog(true)}
                >
                  <ExternalLink className="w-4 h-4" />
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              We'll crawl your sitemap to create automatic internal links in generated articles
            </p>
          </div>

          <div className="flex gap-2">
            <Button 
              className="flex-1" 
              onClick={handleSave}
              disabled={updateProject.isPending || isResetting || isDeleting}
            >
              {isResetting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Resetting...
                </>
              ) : updateProject.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </Button>
            <Button 
              variant="outline"
              onClick={() => {
                if (!canAddSite) {
                  if (!hasPlan) {
                    toast.error("Subscribe to a plan to add more sites");
                  } else {
                    toast.error(`Your ${plan ?? "current"} plan allows up to ${sitesLimit} site${(sitesLimit ?? 1) > 1 ? "s" : ""}. Upgrade to add more.`);
                  }
                  router.push("/checkout?plan=pro");
                  return;
                }
                setShowAddUrlDialog(true);
              }}
              disabled={isDeleting || isResetting}
              title={
                !canAddSite
                  ? (hasPlan
                      ? `Limit reached: ${currentSitesCount}/${sitesLimit} sites on ${plan ?? "your"} plan`
                      : "Subscribe to add more sites")
                  : sitesUnlimited
                    ? "Unlimited sites"
                    : `${currentSitesCount}/${sitesLimit} sites used`
              }
            >
              <Plus className="w-4 h-4 mr-2" />
              Add URL
              {hasPlan && !sitesUnlimited && typeof sitesLimit === "number" && (
                <span className="ml-2 text-xs text-muted-foreground">({currentSitesCount}/{sitesLimit})</span>
              )}
            </Button>
            <Button 
              variant="destructive"
              onClick={() => setShowDeleteAllWarning(true)}
              disabled={isDeleting || isResetting}
            >
              {isDeleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete All
                </>
              )}
            </Button>
          </div>
        </div>
      </Card>

      {/* Detected Pages Dialog */}
      <Dialog open={showPagesDialog} onOpenChange={setShowPagesDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="w-5 h-5 text-primary" />
              Detected Site Pages ({sitePagesCount})
            </DialogTitle>
            <DialogDescription>
              These pages will be used for automatic internal linking in generated articles
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-2">
              {sitePages.map((page) => (
                <div 
                  key={page.id}
                  className="p-3 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {page.title || "Untitled"}
                      </p>
                      <a 
                        href={page.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:text-primary truncate block"
                      >
                        {page.url}
                      </a>
                    </div>
                  </div>
                </div>
              ))}
              {sitePages.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Link2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No pages detected yet</p>
                  <p className="text-sm">Enter your sitemap URL and click "Detect Links"</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Delete All Confirmation */}
      <AlertDialog open={showDeleteAllWarning} onOpenChange={setShowDeleteAllWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              Delete All Data
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p className="font-semibold text-foreground">
                This will permanently delete ALL your project data:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>All generated answers</li>
                <li>All articles</li>
                <li>Complete content planning</li>
                <li>All keywords</li>
                <li>All Reddit responses</li>
                <li>Website URL and settings</li>
              </ul>
              <p className="pt-2 text-destructive font-medium">
                This action is IRREVERSIBLE!
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAll}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add URL Dialog */}
      <Dialog open={showAddUrlDialog} onOpenChange={setShowAddUrlDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-primary" />
              Add New Website URL
            </DialogTitle>
            <DialogDescription>
              Enter the URL of the website you want to analyze. This will start a fresh onboarding process.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="newUrl">Website URL</Label>
              <Input
                id="newUrl"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://example.com"
              />
            </div>
            <Button className="w-full" onClick={handleAddUrl}>
              Start Onboarding
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
export default BusinessSettings;

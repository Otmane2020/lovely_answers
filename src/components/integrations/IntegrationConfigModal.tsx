"use client";
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ExternalLink, BookOpen, CheckCircle2, AlertCircle, ChevronRight, Copy, Check } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import shopifyLogo from "@/assets/shopify-logo-new.png";
import wixLogo from "@/assets/wix-logo.png";
import wordpressLogo from "@/assets/wordpress-logo-new.png";
import bigcommerceLogo from "@/assets/bigcommerce-logo.png";
import framerLogo from "@/assets/framer-logo.png";
import boltLogo from "@/assets/bolt-logo.png";
import lovableLogo from "@/assets/lovable-logo.svg";

// Guide steps for each platform
const PLATFORM_GUIDES: Record<string, { title: string; steps: string[] }> = {
  wordpress: {
    title: "How to Get Your WordPress Credentials",
    steps: [
      "Log in to your WordPress admin dashboard",
      "Go to Users → Your Profile",
      "Scroll down to the 'Application Passwords' section",
      "Enter a name (e.g., 'AutoPilot AEO') and click 'Add New Application Password'",
      "Copy the generated password (format: xxxx xxxx xxxx xxxx)",
      "Enter your WordPress username in the 'Username' field",
      "Paste the application password in the 'Application Password' field",
    ],
  },
  shopify: {
    title: "How to Create a Shopify Custom App",
    steps: [
      "Log in to your Shopify Admin",
      "Go to Settings → Apps and sales channels",
      "Click 'Develop apps' in the top right",
      "Click 'Create an app' and give it a name",
      "In the Configuration tab, click 'Configure Admin API scopes'",
      "Enable permissions: 'write_content', 'read_content' (for the blog)",
      "Click 'Save' then 'Install app'",
      "Copy the Admin API access token (starts with shpat_)",
    ],
  },
  wix: {
    title: "🔑 How to Get Your Wix API Key",
    steps: [
      "1️⃣ Go to dev.wix.com and sign in",
      "2️⃣ In the left menu, click 'API Keys'",
      "3️⃣ Click the '+ Generate API Key' button",
      "4️⃣ Give it a name (e.g., 'AutoPilot Geo')",
      "5️⃣ IMPORTANT: Check 'All site permissions' or select your site",
      "6️⃣ In permissions, enable 'Wix Blog' → 'Read & Write Blog'",
      "7️⃣ Click 'Generate' and copy the key (starts with IST...)",
      "8️⃣ For Site ID: go to manage.wix.com → the ID is in the URL after /dashboard/",
    ],
  },
  webflow: {
    title: "How to Get Your Webflow API Token",
    steps: [
      "Log in to your Webflow account",
      "Go to Site Settings → Integrations → API Access",
      "Click 'Generate API Token'",
      "Copy the generated token",
      "For Collection ID: go to CMS → click on your collection",
      "The Collection ID is visible in the URL or collection settings",
      "Site ID is in Site Settings → General",
    ],
  },
  duda: {
    title: "How to Get Your Duda API Credentials",
    steps: [
      "Log in to your Duda dashboard",
      "Go to Account → API Access",
      "Generate a new API Key / API Secret pair",
      "Copy the API key",
      "The site name is visible in your dashboard (under the site)",
    ],
  },
  bigcommerce: {
    title: "How to Get Your BigCommerce API Token",
    steps: [
      "Log in to your BigCommerce Admin",
      "Go to Advanced Settings → API Accounts",
      "Click 'Create API Account' → 'Create V2/V3 API Token'",
      "Give the account a name and select permissions (Content: modify)",
      "Click 'Save' and copy the Access Token",
      "The Store Hash is visible in your admin URL (after /manage/)",
    ],
  },
  api: {
    title: "Custom API Configuration",
    steps: [
      "Enter the full URL of your API endpoint",
      "Expected format: https://api.example.com/posts",
      "For Authorization, enter the full header value",
      "Examples: 'Bearer your-token' or 'Basic base64-credentials'",
      "HTTP method is usually POST for creating content",
    ],
  },
  webhook: {
    title: "Webhook Configuration",
    steps: [
      "In Zapier: Create a Zap → Trigger 'Webhooks by Zapier' → 'Catch Hook'",
      "Copy the provided webhook URL",
      "In Make: Create a scenario → Webhook → 'Custom webhook'",
      "In n8n: Add a Webhook node and copy the test/production URL",
      "Paste the URL in the 'Webhook URL' field above",
    ],
  },
  snapps: {
    title: "How to Connect Snapps",
    steps: [
      "Log in to your Snapps dashboard",
      "Go to Settings → API",
      "Generate a new API key",
      "Copy the key and your site URL",
    ],
  },
  framer: {
    title: "How to Connect Framer",
    steps: [
      "Framer does not natively support publishing APIs",
      "Use a third-party service like Zapier or Make",
      "Create a webhook that triggers a Framer action",
      "Or use Framer CMS with a custom integration",
    ],
  },
  bolt: {
    title: "How to Connect Bolt.new",
    steps: [
      "🚀 Bolt.new is an AI-powered web builder",
      "📋 Step 1: Open your Bolt.new project",
      "💬 Step 2: Use this prompt in Bolt:",
      "\"Create a Supabase Edge Function 'receive-article' that accepts POST requests with { title, body, slug, sourceId } and saves to a 'published_articles' table. Also create a /blog/:slug page to display articles.\"",
      "📝 Step 3: Once created, copy the Edge Function URL from Bolt",
      "🔗 Step 4: Paste the URL in the 'Edge Function URL' field below",
      "✅ Articles will be published to your Bolt site at /blog/{slug}",
    ],
  },
  lovable: {
    title: "Connect Lovable Site",
    steps: [],
  },
};

// CMS Platform configurations with detailed help
const CMS_CONFIG: Record<string, {
  name: string;
  icon: string;
  isImage?: boolean;
  color?: string;
  description: string;
  tutorialUrl?: string;
  helpText?: string;
  fields: { key: string; label: string; placeholder: string; type?: string; helpText?: string; optional?: boolean }[];
}> = {
  wordpress: {
    name: "WordPress",
    icon: wordpressLogo as unknown as string,
    isImage: true,
    color: "from-slate-600 to-slate-800",
    description: "Publish articles directly to your WordPress blog.",
    helpText: "Use Application Passwords (Users → Profile → Application Passwords).",
    fields: [
      { key: "name", label: "Integration Name", placeholder: "My WordPress Blog" },
      { key: "endpoint", label: "Site URL", placeholder: "https://your-domain.com", helpText: "Your WordPress site URL (without /wp-json)" },
      { key: "username", label: "WordPress Username", placeholder: "admin", helpText: "Your WordPress login username" },
      { key: "token", label: "Application Password", placeholder: "xxxx xxxx xxxx xxxx", type: "password", helpText: "Generated from Users → Application Passwords (spaces are OK)" },
    ],
  },
  shopify: {
    name: "Shopify",
    icon: shopifyLogo as unknown as string,
    isImage: true,
    color: "from-green-500 to-green-600",
    description: "Publish blog articles to your Shopify store.",
    helpText: "Create a Custom App in Shopify Admin → Settings → Apps and sales channels → Develop apps.",
    fields: [
      { key: "name", label: "Integration Name", placeholder: "My Shopify Store" },
      { key: "endpoint", label: "Store URL", placeholder: "https://your-store.myshopify.com", helpText: "Your .myshopify.com URL" },
      { key: "token", label: "Admin API Access Token", placeholder: "shpat_xxxxx", type: "password", helpText: "From your Custom App → API credentials" },
    ],
  },
  wix: {
    name: "Wix",
    icon: wixLogo as unknown as string,
    isImage: true,
    color: "from-yellow-500 to-yellow-600",
    description: "Publish articles to your Wix blog.",
    helpText: "Create an API Key on dev.wix.com with Blog permissions.",
    tutorialUrl: "https://dev.wix.com/docs/rest/account-level-apis/api-keys/generating-api-keys",
    fields: [
      { key: "name", label: "Integration Name", placeholder: "My Wix Blog" },
      { key: "token", label: "API Key", placeholder: "IST.eyJ... (starts with IST)", type: "password", helpText: "From dev.wix.com → API Keys → Generate" },
      { key: "siteId", label: "Site ID", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", helpText: "In the URL: manage.wix.com/dashboard/SITE-ID-HERE/..." },
    ],
  },
  webflow: {
    name: "Webflow",
    icon: "🔷",
    color: "from-blue-500 to-indigo-600",
    description: "Publish CMS items to your Webflow collections.",
    helpText: "Create an API token in Webflow → Site Settings → Integrations.",
    fields: [
      { key: "name", label: "Integration Name", placeholder: "My Webflow Site" },
      { key: "endpoint", label: "Collection ID", placeholder: "Enter your collection ID", helpText: "Found in CMS collection settings" },
      { key: "token", label: "API Token", placeholder: "Enter your Webflow API token", type: "password" },
      { key: "siteId", label: "Site ID", placeholder: "Enter your Webflow Site ID" },
    ],
  },
  duda: {
    name: "Duda",
    icon: "🟠",
    color: "from-orange-500 to-orange-600",
    description: "Publish blog posts to your Duda website.",
    helpText: "Get API credentials from Duda → Dashboard → API Access.",
    fields: [
      { key: "name", label: "Integration Name", placeholder: "My Duda Site" },
      { key: "endpoint", label: "Site Name", placeholder: "Enter your Duda site name", helpText: "The site name from your dashboard" },
      { key: "token", label: "API Key", placeholder: "Enter your Duda API key", type: "password" },
    ],
  },
  api: {
    name: "Custom API",
    icon: "⚙️",
    color: "from-gray-500 to-gray-600",
    description: "Connect to any REST API endpoint.",
    helpText: "Send content to your own API endpoint.",
    fields: [
      { key: "name", label: "Integration Name", placeholder: "My Custom API" },
      { key: "endpoint", label: "API Endpoint", placeholder: "https://api.example.com/posts" },
      { key: "token", label: "Authorization Header", placeholder: "Bearer your-token", type: "password", helpText: "Full Authorization header value" },
      { key: "method", label: "HTTP Method", placeholder: "POST" },
    ],
  },
  webhook: {
    name: "Webhook",
    icon: "🔗",
    color: "from-purple-500 to-purple-600",
    description: "Send content to any webhook (Zapier, Make, n8n, etc.).",
    helpText: "Perfect for automation workflows.",
    fields: [
      { key: "name", label: "Integration Name", placeholder: "My Zapier Webhook" },
      { key: "endpoint", label: "Webhook URL", placeholder: "https://hooks.zapier.com/..." },
    ],
  },
  bigcommerce: {
    name: "BigCommerce",
    icon: bigcommerceLogo as unknown as string,
    isImage: true,
    color: "from-gray-700 to-black",
    description: "Publish blog content to your BigCommerce store.",
    fields: [
      { key: "name", label: "Integration Name", placeholder: "My BigCommerce Store" },
      { key: "endpoint", label: "Store Hash", placeholder: "Enter your store hash", helpText: "Found in your API account settings" },
      { key: "token", label: "API Token", placeholder: "Enter your API token", type: "password" },
    ],
  },
  snapps: {
    name: "Snapps",
    icon: "📱",
    color: "from-pink-500 to-pink-600",
    description: "Connect your Snapps site for content publishing.",
    fields: [
      { key: "name", label: "Integration Name", placeholder: "My Snapps Site" },
      { key: "endpoint", label: "Site URL", placeholder: "https://your-site.snapps.ai" },
      { key: "token", label: "API Key", placeholder: "Enter your API key", type: "password" },
    ],
  },
  framer: {
    name: "Framer",
    icon: framerLogo as unknown as string,
    isImage: true,
    color: "from-sky-400 to-blue-500",
    description: "Connect your Framer site via webhook.",
    fields: [
      { key: "name", label: "Integration Name", placeholder: "My Framer Site" },
      { key: "endpoint", label: "Webhook URL", placeholder: "https://your-webhook-url" },
      { key: "token", label: "API Token", placeholder: "Enter your API token (optional)", type: "password", optional: true },
    ],
  },
  bolt: {
    name: "Bolt.new",
    icon: boltLogo as unknown as string,
    isImage: true,
    color: "from-yellow-400 to-amber-500",
    description: "Connect your Bolt.new AI-powered web project.",
    helpText: "Use webhooks or API to push content to your Bolt project.",
    fields: [
      { key: "name", label: "Integration Name", placeholder: "My Bolt Project" },
      { key: "endpoint", label: "Webhook URL", placeholder: "https://your-bolt-webhook.com/..." },
      { key: "token", label: "API Token", placeholder: "Enter your API token (optional)", type: "password", optional: true },
    ],
  },
  lovable: {
    name: "Lovable.dev",
    icon: lovableLogo as unknown as string,
    isImage: true,
    color: "from-rose-500 to-pink-600",
    description: "Publish articles to your Lovable.dev project",
    helpText: "",
    fields: [
      { key: "endpoint", label: "Supabase Function URL", placeholder: "https://xxx.supabase.co/functions/v1/receive-article", helpText: "The receive-article function URL from your project" },
    ],
  },
};

interface IntegrationConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  platform: string | null;
  projectId: string;
  existingConfig?: Record<string, string>;
  integrationId?: string;
  onSuccess: () => void;
}

export function IntegrationConfigModal({
  open,
  onOpenChange,
  platform,
  projectId,
  existingConfig,
  integrationId,
  onSuccess,
}: IntegrationConfigModalProps) {
  const [formData, setFormData] = useState<Record<string, string>>(existingConfig || {});
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);
  const [testMessage, setTestMessage] = useState<string>("");
  const [showGuide, setShowGuide] = useState(false);
  const isMobile = useIsMobile();

const LOVABLE_PROMPT = `Create a complete blog system with article ingestion:

## 1. Edge Function "receive-article"
Create supabase/functions/receive-article/index.ts:
- Accept POST with JSON: { title, body, slug, sourceId?, metaDescription?, author? }
- Validate required fields (title, body, slug) - return 400 if missing
- Create "published_articles" table: id (uuid), title (text), body (text), slug (text UNIQUE), source_id (text), meta_description (text), author (text), published_at (timestamptz default now()), created_at (timestamptz default now()), updated_at (timestamptz)
- Enable RLS with public SELECT policy
- Upsert by slug (update if exists, insert if new)
- Return: { success: true, article: { id, slug }, url: "/blog/{slug}" }
- Add CORS headers for cross-origin requests

## 2. Blog Index Page "/blog"
Create src/pages/Blog.tsx and add route:
- Fetch all articles from published_articles ordered by published_at DESC
- Display article cards with title, excerpt (first 150 chars of body stripped of HTML), published date
- Link each card to /blog/{slug}
- Add SEO meta tags

## 3. Blog Article Page "/blog/:slug"  
Create src/pages/BlogArticle.tsx and add route:
- Fetch single article by slug from published_articles
- Show 404 page if not found
- Display title, body (render as HTML with dangerouslySetInnerHTML)
- Add SEO meta tags (title, meta_description)
- Add "Back to blog" link

## 4. Add Routes in App.tsx
Add these routes:
<Route path="/blog" element={<Blog />} />
<Route path="/blog/:slug" element={<BlogArticle />} />

After implementation, give me the Edge Function URL (format: https://xxx.supabase.co/functions/v1/receive-article)`;

  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const handleCopyPrompt = async () => {
    await navigator.clipboard.writeText(LOVABLE_PROMPT);
    setCopiedPrompt(true);
    toast.success("Prompt copied!");
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  // Reset form when modal opens with new data
  useEffect(() => {
    if (open) {
      setFormData(existingConfig || {});
      setTestResult(null);
      setTestMessage("");
      setShowGuide(false);
    }
  }, [open, existingConfig]);

  if (!platform || !CMS_CONFIG[platform]) return null;

  const config = CMS_CONFIG[platform];
  const guide = PLATFORM_GUIDES[platform];

  const handleFieldChange = (key: string, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    // Validate required fields for testing based on platform
    if (platform === "wix") {
      if (!formData.token) {
        toast.error("Please enter your Wix API Key");
        return;
      }
    } else if (!formData.endpoint && !formData.token) {
      toast.error("Please enter required fields");
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    setTestMessage("");

    try {
      // Use edge function to test connection (avoids CORS issues)
      const { data, error } = await supabase.functions.invoke("test-integration", {
        body: {
          platform,
          config: formData,
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data?.success) {
        setTestResult("success");
        setTestMessage(data.message || "Connection successful!");
        toast.success(`${config.name} connection successful!`);
      } else {
        setTestResult("error");
        setTestMessage(data?.message || "Connection failed");
        toast.error(data?.message || "Connection failed");
      }
    } catch (error) {
      console.error("Test failed:", error);
      setTestResult("error");
      setTestMessage(error instanceof Error ? error.message : "Connection failed");
      toast.error("Failed to connect");
    } finally {
      setIsTesting(false);
    }
  };

  const handleConnect = async () => {
    // Validate required fields (skip optional ones)
    const missingFields = config.fields
      .filter(f => f.key !== "method" && !f.optional && !formData[f.key])
      .map(f => f.label);

    if (missingFields.length > 0) {
      toast.error(`Please fill in: ${missingFields.join(", ")}`);
      return;
    }

    setIsSaving(true);
    try {
      if (integrationId) {
        // Update existing
        const { error } = await supabase
          .from("integrations")
          .update({
            config: formData,
            is_connected: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", integrationId);

        if (error) throw error;
        toast.success(`${config.name} integration updated!`);
      } else {
        // Create new
        const { error } = await supabase
          .from("integrations")
          .insert({
            project_id: projectId,
            platform,
            config: formData,
            is_connected: true,
          });

        if (error) throw error;
        toast.success(`${config.name} connected successfully!`);
      }

      onSuccess();
      onOpenChange(false);
      setFormData({});
    } catch (error) {
      console.error("Error saving integration:", error);
      toast.error("Failed to save integration");
    } finally {
      setIsSaving(false);
    }
  };

  // Content shared between Dialog and Drawer
  const ModalHeader = () => (
    <>
      <div className="flex items-center gap-3">
        {config.isImage ? (
          <img src={config.icon} alt={config.name} className="h-7 w-7 sm:h-8 sm:w-8 object-contain dark:invert shrink-0" />
        ) : (
          <span className="text-2xl shrink-0">{config.icon}</span>
        )}
        <span className="font-semibold text-base sm:text-lg truncate">{config.name} Integration</span>
      </div>
      <p className="text-sm text-muted-foreground mt-1.5">{config.description}</p>
    </>
  );

  const ModalContent = () => (
    <div className="space-y-4 py-2">
      {/* Lovable-specific: Copyable Prompt only */}
      {platform === "lovable" && (
        <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <span className="text-lg">📋</span> 
              Prompt to copy in Lovable
            </h4>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyPrompt}
              className="h-8 px-3 gap-1.5 text-xs border-primary/30 hover:bg-primary/10"
            >
              {copiedPrompt ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedPrompt ? "Copied!" : "Copy"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground bg-background/80 rounded-lg p-3 font-mono leading-relaxed border max-h-40 overflow-y-auto whitespace-pre-wrap">
            {LOVABLE_PROMPT}
          </p>
          <p className="text-[11px] text-muted-foreground/80 flex items-center gap-1.5">
            <span>💡</span> Paste this prompt in your Lovable project to create the receive-article function
          </p>
        </div>
      )}

      {/* Guide Button - Only for non-lovable platforms */}
      {guide && guide.steps.length > 0 && platform !== "lovable" && (
        <Button
          variant="outline"
          onClick={() => setShowGuide(!showGuide)}
          className="w-full justify-between gap-2 bg-primary/5 border-primary/20 hover:bg-primary/10 h-auto py-3 px-4"
        >
          <span className="flex items-center gap-2 text-left">
            <BookOpen className="h-4 w-4 text-primary shrink-0" />
            <span className="font-medium text-sm">📖 Guide: How to Get API Keys</span>
          </span>
          <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${showGuide ? "rotate-90" : ""}`} />
        </Button>
      )}

      {/* Guide Content */}
      {showGuide && guide && guide.steps.length > 0 && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
          <h4 className="font-semibold text-primary text-sm">{guide.title}</h4>
          <div className="max-h-[150px] overflow-y-auto">
            <ol className="space-y-2.5 text-sm">
              {guide.steps.map((step, index) => (
                <li key={index} className="flex gap-3">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-medium">
                    {index + 1}
                  </span>
                  <span className="text-muted-foreground leading-relaxed flex-1">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {config.helpText && !showGuide && platform !== "lovable" && (
        <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-xl">
          💡 {config.helpText}
        </p>
      )}
      
      {/* Configuration Form */}
      <div className="rounded-xl border bg-card p-4 space-y-4">
        <h4 className="font-medium text-sm">Configuration</h4>

        {config.fields.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <Label htmlFor={field.key} className="text-xs font-medium">{field.label}</Label>
            <Input
              id={field.key}
              type={field.type || "text"}
              placeholder={field.placeholder}
              value={formData[field.key] || ""}
              onChange={(e) => handleFieldChange(field.key, e.target.value)}
              className="text-sm h-11 px-3 text-foreground bg-background placeholder:text-muted-foreground"
              autoComplete="off"
            />
            {field.helpText && (
              <p className="text-[10px] text-muted-foreground leading-tight">{field.helpText}</p>
            )}
          </div>
        ))}

        {platform !== "lovable" && (
          <Button
            variant="outline"
            onClick={handleTestConnection}
            disabled={isTesting || !formData.endpoint}
            className="gap-2 w-full h-11 text-sm"
          >
            {isTesting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : testResult === "success" ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : testResult === "error" ? (
              <AlertCircle className="h-4 w-4 text-destructive" />
            ) : null}
            {testResult === "success" ? "Connected" : testResult === "error" ? "Failed" : "Test Connection"}
          </Button>
        )}
        {testMessage && (
          <p className={`text-xs ${testResult === "error" ? "text-destructive" : "text-muted-foreground"}`}>
            {testMessage}
          </p>
        )}
      </div>
    </div>
  );

  const ModalFooter = () => (
    <div className="flex flex-col gap-2 w-full">
      <Button
        onClick={handleConnect}
        disabled={isSaving}
        className="bg-foreground text-background hover:bg-foreground/90 w-full h-12 text-base font-medium"
      >
        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Connect
      </Button>
      <Button variant="ghost" onClick={() => onOpenChange(false)} className="w-full h-10 text-muted-foreground">
        Cancel
      </Button>
    </div>
  );

  // Mobile: Use Drawer (slides from bottom)
  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[85vh] px-4 pb-6 flex flex-col">
          <DrawerHeader className="px-0 pt-4 pb-2 text-left shrink-0">
            <DrawerTitle asChild>
              <div><ModalHeader /></div>
            </DrawerTitle>
          </DrawerHeader>
          
          <div className="flex-1 overflow-y-auto -mx-4 px-4 min-h-0">
            <ModalContent />
          </div>
          
          <DrawerFooter className="px-0 pt-4 shrink-0">
            <ModalFooter />
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  // Desktop: Use Dialog
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle asChild>
            <div><ModalHeader /></div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 min-h-0">
          <ModalContent />
        </div>

        <DialogFooter className="px-6 pb-6 pt-4 border-t bg-background shrink-0">
          <div className="flex gap-3 w-full">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1 h-11">
              Cancel
            </Button>
            <Button
              onClick={handleConnect}
              disabled={isSaving}
              className="bg-foreground text-background hover:bg-foreground/90 flex-1 h-11"
            >
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Connect
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

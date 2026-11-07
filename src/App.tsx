import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ScrollToTop } from "@/components/ScrollToTop";

// Views
import IndexPage from "@/views/Index";
import AuthPage from "@/views/Auth";
import SignupPage from "@/views/Signup";
import Dashboard from "@/views/Dashboard";
import Pricing from "@/views/Pricing";
import Blog from "@/views/Blog";
import AeoSettings from "@/views/AeoSettings";
import Answers from "@/views/Answers";
import AeoArticles from "@/views/AeoArticles";
import AeoKeywords from "@/views/AeoKeywords";
import AeoPlanning from "@/views/AeoPlanning";
import AeoAnalytics from "@/views/AeoAnalytics";
import Checkout from "@/views/Checkout";
import Cart from "@/views/Cart";
import AeoSubscription from "@/views/AeoSubscription";
import AeoBilling from "@/views/AeoBilling";
import AeoSupport from "@/views/AeoSupport";
import AeoIntegrations from "@/views/AeoIntegrations";
import AeoHistory from "@/views/AeoHistory";
import AeoGeo from "@/views/AeoGeo";
import GeoEngineLanding from "@/views/GeoEngineLanding";

import AeoLocal from "@/views/AeoLocal";
import AeoReddit from "@/views/AeoReddit";
import AeoSeoAudit from "@/views/AeoSeoAudit";
import AeoOpportunities from "@/views/AeoOpportunities";
import AeoAccount from "@/views/AeoAccount";
import About from "@/views/About";
import Privacy from "@/views/Privacy";
import Terms from "@/views/Terms";
import ThankYou from "@/views/ThankYou";
import NotFound from "@/views/NotFound";
import AiSeo from "@/views/AiSeo";
import AutoSeo from "@/views/AutoSeo";
import AuditPremium from "@/views/AuditPremium";
import AiShoppingAssistant from "@/views/AiShoppingAssistant";
import ShoppingDashboard from "@/views/ShoppingDashboard";
import ShoppingPlanning from "@/views/ShoppingPlanning";
import ShoppingProduct from "@/views/ShoppingProduct";
import SuperAdmin from "@/views/SuperAdmin";
import SuperAdminAds from "@/views/SuperAdminAds";
import GoogleAnalyticsPage from "@/views/GoogleAnalyticsPage";
import GoogleTagManager from "@/views/GoogleTagManager";
import AeoPublicAnswer from "@/views/AeoPublicAnswer";
import LocalAeoArticle from "@/views/LocalAeoArticle";
import GeoSuccessMetrics from "@/views/GeoSuccessMetrics";
import AiVisibilityChecker from "@/views/tools/AiVisibilityChecker";
import Onboarding from "@/views/Onboarding";
import AeoWizard from "@/views/AeoWizard";
import OAuthConsent from "@/views/OAuthConsent";
import Connect from "@/views/Connect";
import { SubscriptionGate } from "@/components/auth/SubscriptionGate";

const gated = (el: React.ReactNode) => <SubscriptionGate>{el}</SubscriptionGate>;

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<IndexPage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/wizard" element={gated(<AeoWizard />)} />
        <Route path="/dashboard" element={gated(<Dashboard />)} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/blog/measuring-geo-success" element={<GeoSuccessMetrics />} />
        <Route path="/blog/:slug" element={<AeoPublicAnswer />} />
        <Route path="/settings" element={gated(<AeoSettings />)} />
        <Route path="/answers" element={gated(<Answers />)} />
        <Route path="/answers/:slug" element={<AeoPublicAnswer />} />
        <Route path="/articles" element={gated(<AeoArticles />)} />
        <Route path="/keywords" element={gated(<AeoKeywords />)} />
        <Route path="/planning" element={gated(<AeoPlanning />)} />
        <Route path="/analytics" element={gated(<AeoAnalytics />)} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/subscription" element={<AeoSubscription />} />
        <Route path="/billing" element={<AeoBilling />} />
        <Route path="/support" element={<AeoSupport />} />
        <Route path="/integrations" element={gated(<AeoIntegrations />)} />
        <Route path="/history" element={gated(<AeoHistory />)} />
        <Route path="/geo" element={gated(<AeoGeo />)} />
        <Route path="/geo-engine" element={<GeoEngineLanding />} />

        <Route path="/local" element={gated(<AeoLocal />)} />
        <Route path="/localAEO" element={<LocalAeoArticle />} />
        <Route path="/reddit" element={<AeoReddit />} />
        <Route path="/seo-audit" element={<AeoSeoAudit />} />
        <Route path="/audit-premium" element={<AuditPremium />} />
        <Route path="/about" element={<About />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/thank-you" element={<ThankYou />} />
        <Route path="/ai-seo" element={<AiSeo />} />
        <Route path="/autoseo" element={<AutoSeo />} />
        <Route path="/ai-shopping-assistant" element={<AiShoppingAssistant />} />
        <Route path="/shopping" element={<ShoppingDashboard />} />
        <Route path="/shopping/planning" element={<ShoppingPlanning />} />
        <Route path="/shopping/product/:productId" element={<ShoppingProduct />} />
        <Route path="/superadmin" element={<SuperAdmin />} />
        <Route path="/superadmin/ads" element={<SuperAdminAds />} />
        <Route path="/google-analytics" element={<GoogleAnalyticsPage />} />
        <Route path="/google-tag-manager" element={<GoogleTagManager />} />
        <Route path="/account" element={<AeoAccount />} />
        <Route path="/tools/ai-visibility-checker" element={<AiVisibilityChecker />} />
        <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
        <Route path="/connect" element={<Connect />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Helmet } from "react-helmet-async";
import { trackSignUp } from "@/lib/gtag-conversions";
import { trackMetaLead } from "@/lib/meta-pixel";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Mail, Lock, User, ArrowRight, Loader2, Eye, EyeOff, Apple, Phone } from "lucide-react";
import { lovable } from "@/integrations/lovable";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { AnimatedLogo } from "@/components/AnimatedLogo";

const emailSchema = z.string().email("Invalid email address");
const passwordSchema = z.string().min(6, "Password must be at least 6 characters");

export default function Signup() {
  const router = useRouter();
  const { user, signUp, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  useEffect(() => {
    document.documentElement.classList.remove("dark");
  }, []);

  useEffect(() => {
    if (!user) return;
    const checkSubAndRedirect = async () => {
      // Check active subscription/trial first — if none, force checkout
      try {
        const { data: sub } = await supabase.functions.invoke("check-subscription");
        if (!sub?.subscribed && !sub?.trial) {
          console.log("[SIGNUP] No active subscription/trial → /checkout");
          window.location.replace("/checkout?plan=pro&cycle=annual");
          return;
        }
      } catch (e) {
        console.error("[SIGNUP] check-subscription failed", e);
        window.location.replace("/checkout?plan=pro&cycle=annual");
        return;
      }
      const { data } = await supabase.from("projects").select("id").eq("user_id", user.id).limit(1);
      const target = data && data.length > 0 ? "/dashboard" : "/wizard";
      console.log("[SIGNUP] Has subscription → redirecting to", target);
      window.location.replace(target);
    };
    checkSubAndRedirect();
  }, [user]);

  const validateForm = () => {
    const newErrors: { email?: string; password?: string } = {};
    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) newErrors.email = emailResult.error.errors[0].message;
    const passwordResult = passwordSchema.safeParse(password);
    if (!passwordResult.success) newErrors.password = passwordResult.error.errors[0].message;
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsLoading(true);
    const { error } = await signUp(email, password, fullName, phone);
    if (error) {
      setIsLoading(false);
      let message = error.message;
      if (error.message.includes("already registered")) message = "This email is already registered. Please sign in.";
      toast({ title: "Sign up failed", description: message, variant: "destructive" });
      return;
    }
    trackSignUp(email);
    trackMetaLead(email);
    toast({ title: "Account created!", description: "Please check your email to verify your account." });
    setIsLoading(false);
  };

  const handleGoogleSignIn = async () => {
    sessionStorage.setItem("post_oauth_intent", "signup");
    const { error } = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/auth?intent=signup`,
    });
    if (error) {
      sessionStorage.removeItem("post_oauth_intent");
      toast({ title: "Error", description: "Google sign-in failed.", variant: "destructive" });
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      window.location.replace("/checkout?plan=pro&cycle=annual");
    }
  };

  const handleAppleSignIn = async () => {
    sessionStorage.setItem("post_oauth_intent", "signup");
    const { error } = await lovable.auth.signInWithOAuth("apple", {
      redirect_uri: `${window.location.origin}/auth?intent=signup`,
    });
    if (error) {
      sessionStorage.removeItem("post_oauth_intent");
      toast({ title: "Error", description: "Apple sign-in failed.", variant: "destructive" });
    }
  };

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-[hsl(222,47%,11%)]"><Loader2 className="h-8 w-8 animate-spin text-violet-400" /></div>;
  }

  return (
    <>
      <Helmet>
        <title>Create Your Account | AutoPilot Geo</title>
        <meta name="description" content="Create your AutoPilot Geo account to start getting cited by ChatGPT, Gemini and Perplexity in 30 days." />
        <link rel="canonical" href="https://autopilotgeo.com/signup" />
        <meta name="robots" content="noindex,follow" />
      </Helmet>
    <div className="min-h-screen bg-white flex">
      {/* Left Panel */}
      <div className="flex-1 flex flex-col justify-center px-8 py-12 lg:px-16">
        <div className="w-full max-w-md mx-auto">
          <Link href="/" className="flex items-center mb-12">
            <AnimatedLogo size="lg" />
          </Link>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-[hsl(222,47%,11%)]">Create an account</h1>
              <p className="mt-2 text-gray-500">
                Already have an account?{" "}
                <Link href="/auth" className="text-violet-600 font-medium hover:underline">Sign in</Link>
              </p>
            </div>

            <div className="space-y-3">
              <Button variant="outline" className="w-full h-12 text-base border-gray-200" onClick={handleGoogleSignIn}>
                <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" /></svg>
                Continue with Google
              </Button>
              <Button variant="outline" className="w-full h-12 text-base border-gray-200" onClick={handleAppleSignIn}>
                <Apple className="mr-2 h-5 w-5" /> Continue with Apple
              </Button>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-gray-200" /></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-gray-600">Or</span></div>
            </div>

            <form onSubmit={handleSignUp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-gray-600">Full name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-5 w-5 text-gray-600" />
                  <Input id="fullName" placeholder="John Doe" value={fullName} onChange={(e) => setFullName(e.target.value)} className="pl-10 h-12 border-gray-200" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-gray-600">
                  Phone <span className="text-gray-600 font-normal text-xs">(optional — get a welcome AI call)</span>
                </Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 h-5 w-5 text-gray-600" />
                  <Input id="phone" type="tel" placeholder="+1 234 567 8900" value={phone} onChange={(e) => setPhone(e.target.value)} className="pl-10 h-12 border-gray-200" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-gray-600">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-600" />
                  <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => { setEmail(e.target.value); setErrors(prev => ({ ...prev, email: undefined })); }} className={`pl-10 h-12 border-gray-200 ${errors.email ? "border-red-500" : ""}`} required />
                </div>
                {errors.email && <p className="text-sm text-red-500">{errors.email}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-gray-600">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-600" />
                  <Input id="password" type={showPassword ? "text" : "password"} placeholder="Min. 6 characters" value={password} onChange={(e) => { setPassword(e.target.value); setErrors(prev => ({ ...prev, password: undefined })); }} className={`pl-10 pr-10 h-12 border-gray-200 ${errors.password ? "border-red-500" : ""}`} required />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-gray-600 hover:text-gray-600">
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                {errors.password && <p className="text-sm text-red-500">{errors.password}</p>}
              </div>
              <Button type="submit" className="w-full h-12 text-base bg-[hsl(222,47%,11%)] text-white hover:bg-[hsl(222,47%,15%)]" disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <ArrowRight className="mr-2 h-5 w-5" />}
                Create account
              </Button>
            </form>

            <p className="text-xs text-center text-gray-600">
              By signing up, you agree to our <Link href="/terms" className="underline hover:text-gray-600">Terms</Link> and <Link href="/privacy" className="underline hover:text-gray-600">Privacy Policy</Link>.
            </p>
          </motion.div>
        </div>
      </div>

      {/* Right Panel - Dark Navy */}
      <div className="hidden lg:flex flex-1 bg-[hsl(222,47%,11%)] items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute top-1/3 left-1/4 w-[400px] h-[400px] bg-violet-500/10 rounded-full blur-[150px]" />
        <div className="relative max-w-lg text-center space-y-6">
          <div className="w-20 h-20 rounded-2xl bg-white/10 flex items-center justify-center mx-auto">
            <User className="h-10 w-10 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-white">Get started in minutes</h2>
          <p className="text-lg text-white/50">
            Create your account and start generating AI-optimized content that gets cited by ChatGPT, Gemini, and Perplexity.
          </p>
          <div className="grid grid-cols-2 gap-4 text-left">
            {["30 SEO articles/month", "AI answer optimization", "Auto-publish to your CMS", "Google Search Console sync"].map((feature) => (
              <div key={feature} className="flex items-center gap-2 text-sm text-white/60">
                <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                  <ArrowRight className="h-3 w-3 text-violet-400" />
                </div>
                {feature}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

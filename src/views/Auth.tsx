"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Helmet } from "react-helmet-async";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Mail, Lock, User, ArrowRight, Loader2, Eye, EyeOff, Apple } from "lucide-react";
import { lovable } from "@/integrations/lovable";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { AnimatedLogo } from "@/components/AnimatedLogo";

const emailSchema = z.string().email("Invalid email address");
const passwordSchema = z.string().min(6, "Password must be at least 6 characters");

export default function Auth() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, signIn, signUp, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  
  // Check URL params for signup mode and checkout success
  const searchParams = useSearchParams();
  const modeFromUrl = searchParams.get('mode');
  const checkoutSuccess = searchParams.get('checkout') === 'success';
  const nextParam = searchParams.get('next');
  const [isLogin, setIsLogin] = useState(modeFromUrl !== 'signup');
  
  // Pre-fill email from onboarding if available (client-side only)
  const [email, setEmail] = useState("");
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [isResetPassword, setIsResetPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string; confirmPassword?: string }>({});

  // Load saved email from localStorage on client only
  useEffect(() => {
    const saved = localStorage.getItem('onboarding_email');
    if (saved) setEmail(saved);
  }, []);

  // Force light theme on auth page
  useEffect(() => {
    document.documentElement.classList.remove("dark");
  }, []);

  // Listen for auth events (OAuth callback, password recovery, etc.)
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("[AUTH] Auth event:", event, "Session:", !!session);
      
      if (event === "PASSWORD_RECOVERY") {
        console.log("[AUTH] Password recovery detected, showing reset form");
        setIsResetPassword(true);
        return;
      }
      
      // Handle SIGNED_IN event - this fires after OAuth callback
      if (event === "SIGNED_IN" && session?.user) {
        const user = session.user;
        console.log("[AUTH] SIGNED_IN event for user:", user.id);
        
        const isOAuth = user.app_metadata?.provider && user.app_metadata.provider !== "email";
        const createdAt = new Date(user.created_at);
        const now = new Date();
        const isNewUser = (now.getTime() - createdAt.getTime()) < 60000; // Created within last minute
        
        if (isOAuth && isNewUser) {
          console.log("[AUTH] New OAuth user detected, sending welcome email");
          try {
            await supabase.functions.invoke("send-email", {
              body: {
                type: "welcome",
                to: user.email,
                name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0],
              },
            });
            console.log("[AUTH] Welcome email sent for OAuth user");
          } catch (emailError) {
            console.error("[AUTH] Failed to send welcome email:", emailError);
          }
        }
        
        // For OAuth logins, trigger redirect check immediately
        if (isOAuth) {
          console.log("[AUTH] OAuth login detected, will redirect via useEffect");
        }
      }
    });

    // Check URL for recovery token (query params or hash)
    const checkRecoveryToken = () => {
      // Check URL hash
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      if (hashParams.get('type') === 'recovery') {
        console.log("[AUTH] Recovery type in hash, showing reset form");
        setIsResetPassword(true);
        return;
      }
      
      // Check URL search params (new Supabase format)
      const searchParams = new URLSearchParams(window.location.search);
      if (searchParams.get('type') === 'recovery') {
        console.log("[AUTH] Recovery type in search params, showing reset form");
        setIsResetPassword(true);
        return;
      }
      
      // Check for error_code (expired/invalid token)
      const errorCode = hashParams.get('error_code') || searchParams.get('error_code');
      const errorDescription = hashParams.get('error_description') || searchParams.get('error_description');
      if (errorCode === 'otp_expired' || errorDescription?.includes('expired')) {
        console.log("[AUTH] Recovery token expired");
        toast({
          title: "Link expired",
          description: "The password reset link has expired. Please request a new one.",
          variant: "destructive",
        });
      }
    };
    
    checkRecoveryToken();

    return () => subscription.unsubscribe();
  }, [toast]);

  useEffect(() => {
    // Don't redirect if user is resetting password
    if (isResetPassword) {
      console.log("[AUTH] In password reset mode, not redirecting");
      return;
    }

    const checkUserAndRedirect = async () => {
      if (!user) {
        console.log("[AUTH] No user, staying on auth page");
        return;
      }

      console.log("[AUTH] User found, checking subscription + projects...", user.id);

      // GATE: require active subscription/trial before any app access
      let hasAccess = false;
      try {
        const { data: sub } = await supabase.functions.invoke("check-subscription");
        hasAccess = !!(sub?.subscribed || sub?.trial);
      } catch (e) {
        console.error("[AUTH] check-subscription failed", e);
      }

      if (!hasAccess && !checkoutSuccess) {
        console.log("[AUTH] No active subscription/trial → /checkout");
        window.location.replace(nextParam?.startsWith("/") ? nextParam : "/checkout?plan=pro&cycle=annual");
        return;
      }

      const { data: existingProjects, error } = await supabase
        .from("projects")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);

      if (error) {
        console.error("[AUTH] Error fetching projects:", error);
        return;
      }

      if (existingProjects && existingProjects.length > 0) {
        localStorage.removeItem('onboarding_data');
        localStorage.removeItem('onboarding_email');
        const target = checkoutSuccess ? "/dashboard?subscription=success" : "/dashboard";
        window.location.replace(target);
        return;
      }

      localStorage.removeItem('onboarding_data');
      localStorage.removeItem('onboarding_email');
      window.location.replace("/wizard");
    };

    checkUserAndRedirect();
  }, [user, router, isResetPassword, checkoutSuccess, nextParam]);

  const validateForm = () => {
    const newErrors: { email?: string; password?: string } = {};
    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) newErrors.email = emailResult.error.errors[0].message;
    const passwordResult = passwordSchema.safeParse(password);
    if (!passwordResult.success) newErrors.password = passwordResult.error.errors[0].message;
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsLoading(true);
    const { error } = await signIn(email, password);
    setIsLoading(false);
    if (error) {
      toast({
        title: "Sign in failed",
        description: error.message === "Invalid login credentials" ? "Invalid email or password." : error.message,
        variant: "destructive",
      });
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsLoading(true);
    
    const { error } = await signUp(email, password, fullName);
    
    if (error) {
      setIsLoading(false);
      let message = error.message;
      if (error.message.includes("already registered")) message = "This email is already registered. Please sign in.";
      toast({ title: "Sign up failed", description: message, variant: "destructive" });
      return;
    }

    // Account created - the useEffect will handle redirect based on onboarding_data
    toast({ title: "Account created!", description: "Setting up your project..." });
    setIsLoading(false);
    // Don't navigate here - let useEffect handle it based on onboarding_data in localStorage
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) {
      setErrors({ email: emailResult.error.errors[0].message });
      return;
    }
    setErrors({});
    setIsLoading(true);
    
    // Use the current origin for redirect
    const redirectUrl = `${window.location.origin}/auth`;
    console.log("[AUTH] Password reset redirect URL:", redirectUrl);
    
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl,
    });
    
    setIsLoading(false);
    
    if (error) {
      console.error("[AUTH] Reset password error:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    
    toast({
      title: "Check your email",
      description: "We've sent you a password reset link. Please check your inbox and spam folder.",
    });
    setIsForgotPassword(false);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate password
    const passwordResult = passwordSchema.safeParse(password);
    if (!passwordResult.success) {
      setErrors({ password: passwordResult.error.errors[0].message });
      return;
    }
    
    // Check passwords match
    if (password !== confirmPassword) {
      setErrors({ confirmPassword: "Passwords do not match" });
      return;
    }
    
    setErrors({});
    setIsLoading(true);
    
    const { error } = await supabase.auth.updateUser({ password });
    
    setIsLoading(false);
    
    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    
    toast({
      title: "Password updated!",
      description: "Your password has been successfully reset.",
    });
    
    setIsResetPassword(false);
    // Clean up URL
    window.history.replaceState({}, document.title, window.location.pathname);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Sign In | AutoPilot Geo</title>
        <meta name="description" content="Sign in to AutoPilot Geo to manage your AI visibility, AEO content, and Google search performance." />
        <link rel="canonical" href="https://autopilotgeo.com/auth" />
        <meta name="robots" content="noindex,follow" />
      </Helmet>
    <div className="min-h-screen bg-background flex">
      {/* Left Panel - Auth Form */}
      <div className="flex-1 flex flex-col justify-center px-8 py-12 lg:px-16">
        <div className="w-full max-w-md mx-auto">
          {/* Logo */}
          <Link href="/" className="flex items-center mb-12">
            <AnimatedLogo size="lg" />
          </Link>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                {isResetPassword ? "Set new password" : isForgotPassword ? "Reset password" : isLogin ? "Sign in" : "Create an account"}
              </h1>
              <p className="mt-2 text-muted-foreground">
                {isResetPassword ? (
                  "Enter your new password below"
                ) : isForgotPassword ? (
                  <>
                    Remember your password?{" "}
                    <button
                      onClick={() => setIsForgotPassword(false)}
                      className="text-primary font-medium hover:underline"
                    >
                      Sign in
                    </button>
                  </>
                ) : (
                  <>
                    {isLogin ? "Don't have an account? " : "Already have an account? "}
                    {isLogin ? (
                      <button
                        onClick={() => router.push("/signup")}
                        className="text-primary font-medium hover:underline"
                      >
                        Sign up
                      </button>
                    ) : (
                      <button
                        onClick={() => setIsLogin(true)}
                        className="text-primary font-medium hover:underline"
                      >
                        Sign in
                      </button>
                    )}
                  </>
                )}
              </p>
            </div>

            {/* Only show Google button and divider when not resetting password */}
            {!isResetPassword && (
              <>
                {/* Social Auth Buttons */}
                <div className="flex flex-col gap-3">
                  <Button
                    variant="outline"
                    className="w-full h-12 gap-3 text-base font-medium border-primary/20 bg-primary/5 hover:bg-primary/10"
                    onClick={async () => {
                      // Redirect back to /auth so the useEffect can handle the redirect logic
                      sessionStorage.removeItem("post_oauth_intent");
                      const { error } = await lovable.auth.signInWithOAuth('google', {
                        redirect_uri: `${window.location.origin}/auth`,
                      });
                      if (error) {
                        toast({
                          title: "Google sign in failed",
                          description: error.message,
                          variant: "destructive",
                        });
                        return;
                      }

                      const { data: { session } } = await supabase.auth.getSession();
                      if (session?.user) {
                        if (nextParam?.startsWith("/")) {
                          window.location.replace(nextParam);
                          return;
                        }
                        const { data: sub } = await supabase.functions.invoke("check-subscription");
                        if (!sub?.subscribed && !sub?.trial) {
                          window.location.replace("/checkout?plan=pro&cycle=annual");
                          return;
                        }
                        const { data: projects } = await supabase
                          .from("projects")
                          .select("id")
                          .eq("user_id", session.user.id)
                          .limit(1);
                        window.location.replace(projects && projects.length > 0 ? "/dashboard" : "/wizard");
                      }
                    }}
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Continue with Google
                  </Button>

                  <Button
                    variant="outline"
                    className="w-full h-12 gap-3 text-base font-medium border-primary/20 bg-primary/5 hover:bg-primary/10"
                    onClick={async () => {
                      sessionStorage.removeItem("post_oauth_intent");
                      const { error } = await lovable.auth.signInWithOAuth('apple', {
                        redirect_uri: `${window.location.origin}/auth`,
                      });
                      if (error) {
                        toast({
                          title: "Apple sign in failed",
                          description: error.message,
                          variant: "destructive",
                        });
                      }
                    }}
                  >
                    <Apple className="h-5 w-5" />
                    Continue with Apple
                  </Button>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">or</span>
                  </div>
                </div>
              </>
            )}

            {isResetPassword ? (
              <form onSubmit={handleResetPassword} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="new-password" className="text-muted-foreground">New Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="new-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 pr-10 h-12 bg-muted/50 border-border"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password" className="text-muted-foreground">Confirm Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="confirm-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="pl-10 h-12 bg-muted/50 border-border"
                      required
                    />
                  </div>
                  {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword}</p>}
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 gap-2 bg-foreground text-background hover:bg-foreground/90 text-base font-medium"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      Update password
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>
            ) : isForgotPassword ? (
              <form onSubmit={handleForgotPassword} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-muted-foreground">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10 h-12 bg-muted/50 border-border"
                      required
                    />
                  </div>
                  {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 gap-2 bg-foreground text-background hover:bg-foreground/90 text-base font-medium"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      Send reset link
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>
            ) : (
              <>
                <form onSubmit={isLogin ? handleSignIn : handleSignUp} className="space-y-5">
                  {!isLogin && (
                    <div className="space-y-2">
                      <Label htmlFor="name" className="text-muted-foreground">Full name</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="name"
                          type="text"
                          placeholder="John Doe"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          className="pl-10 h-12 bg-muted/50 border-border"
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-muted-foreground">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10 h-12 bg-muted/50 border-border"
                        required
                      />
                    </div>
                    {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-muted-foreground">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10 pr-10 h-12 bg-muted/50 border-border"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
                  </div>

                  {isLogin && (
                    <button 
                      type="button" 
                      onClick={() => setIsForgotPassword(true)}
                      className="text-sm text-primary hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}

                  <Button
                    type="submit"
                    className="w-full h-12 gap-2 bg-foreground text-background hover:bg-foreground/90 text-base font-medium"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        {isLogin ? "Sign in" : "Create account"}
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                </form>

                {!isLogin && (
                  <p className="text-xs text-center text-muted-foreground">
                    By signing up, you agree to our Terms of Service and Privacy Policy.
                  </p>
                )}
              </>
            )}
          </motion.div>
        </div>
      </div>

      {/* Right Panel - Dark Navy */}
      <div className="hidden lg:flex w-1/2 bg-[hsl(222,47%,11%)] relative overflow-hidden items-center justify-center">
        <div className="absolute top-1/3 left-1/4 w-[400px] h-[400px] bg-violet-500/10 rounded-full blur-[150px]" />
        
        <div className="relative z-10 p-12 max-w-md">
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-8">
            <div className="flex items-center gap-4 mb-6">
              <div className="h-14 w-14 rounded-full bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center text-white font-bold text-xl">
                MK
              </div>
              <div>
                <h3 className="font-bold text-lg text-white">Marcus Klein</h3>
                <p className="text-violet-400 text-sm font-medium">Head of Content @TechFlow</p>
              </div>
            </div>
            <blockquote className="space-y-4">
              <p className="text-white/80 font-medium text-lg leading-relaxed">
                "AutoPilot AEO transformed how we approach AI visibility. Our brand now appears in ChatGPT and Perplexity responses consistently."
              </p>
              <p className="text-white/40 text-sm leading-relaxed">
                Within 3 months, we saw a 340% increase in AI-driven traffic.
              </p>
            </blockquote>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

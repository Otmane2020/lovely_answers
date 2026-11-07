"use client";
import { useState } from "react";
import { ChevronDown, Crown, Bell, LogOut, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { ProjectSwitcher } from "@/components/layout/ProjectSwitcher";

const languages = [
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
];

export function AppTopbar() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { subscribed, isLoading: subLoading, startCheckout } = useSubscription();
  const [currentLanguage, setCurrentLanguage] = useState(languages[0]);

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  const userInitials = user?.user_metadata?.full_name
    ? user.user_metadata.full_name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() || "U";

  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-card/80 px-6 backdrop-blur-xl">
      <div className="flex items-center gap-4">
        <ProjectSwitcher />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2">
              <span>{currentLanguage.flag}</span>
              <span className="hidden sm:inline">{currentLanguage.code.toUpperCase()}</span>
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {languages.map((lang) => (
              <DropdownMenuItem key={lang.code} onClick={() => setCurrentLanguage(lang)} className={cn(currentLanguage.code === lang.code && "bg-accent")}>
                <span className="mr-2">{lang.flag}</span>{lang.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center gap-3">
        {subscribed ? (
          <Badge variant="outline" className="gap-1.5 border-emerald-500/30 bg-emerald-500/10 text-emerald-500 px-3 py-1.5">
            <Check className="h-3.5 w-3.5" />
            <span className="text-sm font-medium">All-in-One</span>
          </Badge>
        ) : (
          <Button 
            size="sm" 
            className="gap-2 gradient-bg text-primary-foreground shadow-glow-sm hover:shadow-glow"
            onClick={startCheckout}
            disabled={subLoading}
          >
            <Crown className="h-4 w-4" />
            <span className="hidden sm:inline">Start Free Trial</span>
          </Button>
        )}
        
        <Button variant="ghost" size="icon" className="relative"><Bell className="h-5 w-5" /></Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full">
              <div className="h-8 w-8 rounded-full gradient-bg flex items-center justify-center text-sm font-semibold text-primary-foreground">{userInitials}</div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled className="text-xs text-muted-foreground">{user?.email}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/subscription")}>
              <Crown className="mr-2 h-4 w-4" />Subscription
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive"><LogOut className="mr-2 h-4 w-4" />Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

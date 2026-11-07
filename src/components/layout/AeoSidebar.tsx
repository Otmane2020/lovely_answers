"use client";
import { NavLink } from "@/components/NavLink";
import {
  Home, FileText, BarChart3, Link2, MessageSquareText, Settings, CreditCard, LogOut, CalendarDays, History, HelpCircle, Newspaper, MapPin, ShoppingCart, Package, Globe,
} from "lucide-react";
import { AnimatedLogo } from "@/components/AnimatedLogo";
import { useRouter, usePathname } from "next/navigation";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, useSidebar } from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useIsMobile } from "@/hooks/use-mobile";

export function AeoSidebar() {
  const { state, isMobile: sidebarIsMobile, openMobile, toggleSidebar } = useSidebar();
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const currentPath = pathname;
  const isMobile = useIsMobile();

  const mainMenuItems = [
    { title: "Overview", url: "/dashboard", icon: Home },
    { title: "GEO Engine", url: "/geo", icon: Globe, badge: "Hot" },
    { title: "AEO Answers", url: "/answers", icon: FileText },
    { title: "Auto SEO", url: "/autoseo", icon: Newspaper },
    { title: "Local AEO", url: "/local", icon: MapPin },
    { title: "Planning", url: "/planning", icon: CalendarDays },
    { title: "History", url: "/history", icon: History },
    { title: "Analytics", url: "/analytics", icon: BarChart3 },
    { title: "Integrations", url: "/integrations", icon: Link2 },
    // { title: "Reddit", url: "/reddit", icon: MessageSquareText }, // hidden
  ];

  const shoppingMenuItems = [
    { title: "Products", url: "/shopping", icon: Package },
    { title: "AEO Shopping", url: "/shopping?tab=aeo", icon: ShoppingCart, badge: "New" },
    { title: "Planning", url: "/shopping?tab=planning", icon: CalendarDays },
  ];

  const otherMenuItems = [
    { title: "Settings", url: "/settings", icon: Settings },
    { title: "Billing", url: "/billing", icon: CreditCard },
    { title: "Support", url: "/support", icon: HelpCircle },
  ];

  const isActive = (path: string) => {
    if (path.includes('?tab=')) {
      const [base, query] = path.split('?');
      const tab = new URLSearchParams(query).get('tab');
      return currentPath === base && new URLSearchParams().get('tab') === tab;
    }
    if (path === '/shopping') {
      return currentPath === '/shopping' && !window.location.search.includes('tab=');
    }
    return currentPath === path;
  };
  const handleNavClick = () => { if ((sidebarIsMobile || isMobile) && openMobile) toggleSidebar(); };
  const handleSignOut = async () => { await signOut(); router.push('/'); };

  return (
    <Sidebar collapsible={isMobile ? "offcanvas" : "icon"} className="border-r border-border/50 bg-background [&>div]:bg-background">
      <div className="py-1 px-[8px] mx-[12px]">
        <NavLink to="/dashboard" onClick={handleNavClick} className="flex items-center group">
          <AnimatedLogo size="sm" variant={state === "expanded" ? "full" : "icon"} />
        </NavLink>
      </div>

      <SidebarContent className="px-3 bg-slate-800 text-slate-50">
        <SidebarGroup className="bg-slate-800 text-slate-50">
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {mainMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} className="h-10 rounded-lg transition-all duration-200 hover:bg-slate-700 hover:text-white data-[active=true]:bg-blue-600 data-[active=true]:text-white data-[active=true]:border-l-2 data-[active=true]:border-blue-400 data-[active=true]:font-medium">
                    <NavLink to={item.url} onClick={handleNavClick} className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-3">
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </div>
                      {item.badge && state === "expanded" && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 bg-foreground/10 text-foreground/70 border-0">{item.badge}</Badge>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-4 bg-slate-700/50 rounded-lg">
          <SidebarGroupLabel className="text-sm font-bold uppercase tracking-widest px-3 py-2 mb-1 text-blue-300">🛒 Shopping</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {shoppingMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} className="h-10 rounded-lg transition-all duration-200 hover:bg-slate-600 hover:text-white data-[active=true]:bg-blue-600 data-[active=true]:text-white data-[active=true]:border-l-2 data-[active=true]:border-blue-400 data-[active=true]:font-medium">
                    <NavLink to={item.url} onClick={handleNavClick} className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-3">
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </div>
                      {item.badge && state === "expanded" && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 bg-foreground/10 text-foreground/70 border-0">{item.badge}</Badge>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-6 bg-zinc-800 text-slate-200">
          <SidebarGroupLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 mb-2">Other</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {otherMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} className="h-10 rounded-lg transition-all duration-200 hover:bg-zinc-700 hover:text-white data-[active=true]:bg-blue-600 data-[active=true]:text-white data-[active=true]:border-l-2 data-[active=true]:border-blue-400 data-[active=true]:font-medium">
                    <NavLink to={item.url} onClick={handleNavClick}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3 mt-auto">
        {user && (
          <Button variant="ghost" size="sm" onClick={handleSignOut} className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10">
            <LogOut className="h-4 w-4 mr-2" />
            {state === "expanded" && "Sign out"}
          </Button>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}

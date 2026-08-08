"use client";
import { useMemo, useState } from "react";
import { Globe, ChevronDown, Check, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  useActiveProject,
  useSetActiveProject,
} from "@/hooks/useProjects";
import { useRouter } from "next/navigation";
import { useUsage } from "@/hooks/useUsage";
import { toast } from "sonner";

interface Props {
  className?: string;
  triggerClassName?: string;
  compact?: boolean;
}

function getFavicon(domain?: string | null) {
  if (!domain) return null;
  const clean = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return `https://www.google.com/s2/favicons?domain=${clean}&sz=64`;
}

export function ProjectSwitcher({ className, triggerClassName, compact }: Props) {
  const router = useRouter();
  const { project, projects = [] } = useActiveProject();
  const setActiveProject = useSetActiveProject();
  const { canCreateProject, sitesLimit, projectsCount, isLoading: isUsageLoading } = useUsage();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.name?.toLowerCase().includes(q) ||
        p.domain?.toLowerCase().includes(q) ||
        p.website_url?.toLowerCase().includes(q),
    );
  }, [projects, query]);

  const activeFavicon = getFavicon(project?.domain || project?.website_url);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn("gap-2 text-sm font-medium", triggerClassName)}
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 overflow-hidden">
            {activeFavicon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={activeFavicon}
                alt=""
                className="h-5 w-5 rounded"
                onError={(e) => ((e.currentTarget.style.display = "none"))}
              />
            ) : (
              <Globe className="h-4 w-4 text-primary" />
            )}
          </div>
          {!compact && (
            <span className="hidden sm:inline truncate max-w-[160px]">
              {project?.name || "Select project"}
            </span>
          )}
          {!compact && project?.domain && (
            <span className="text-muted-foreground hidden md:inline truncate max-w-[160px]">
              ({project.domain})
            </span>
          )}
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        className={cn("w-80 p-2", className)}
      >
        {/* Search + add */}
        <div className="flex items-center gap-2 px-1 pb-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Search projects…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 pl-8 text-sm"
            />
          </div>
          <Button
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={() => {
              if (isUsageLoading) {
                toast.info("Checking your plan access...");
                return;
              }
              if (!canCreateProject) {
                setOpen(false);
                toast.error(
                  sitesLimit == null
                    ? "Subscribe to add more websites."
                    : `You've reached your ${sitesLimit}-site limit (${projectsCount}/${sitesLimit}). Upgrade your plan to add more.`,
                );
                router.push("/checkout?plan=pro&cycle=annual");
                return;
              }
              setOpen(false);
              router.push("/wizard?addSite=1");
            }}
            aria-label="Add new project"
            title="Add new project"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>


        <DropdownMenuSeparator />

        <div className="max-h-72 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              {projects.length === 0 ? "No projects yet" : "No match"}
            </div>
          )}
          {filtered.map((p) => {
            const fav = getFavicon(p.domain || p.website_url);
            const isActive = project?.id === p.id;
            return (
              <DropdownMenuItem
                key={p.id}
                onClick={() => setActiveProject.mutate(p.id)}
                className={cn(
                  "flex items-center gap-3 rounded-md py-2.5",
                  isActive && "bg-accent",
                )}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted overflow-hidden shrink-0">
                  {fav ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={fav}
                      alt=""
                      className="h-5 w-5 rounded"
                      onError={(e) => ((e.currentTarget.style.display = "none"))}
                    />
                  ) : (
                    <Globe className="h-4 w-4 text-primary" />
                  )}
                </div>
                <div className="flex flex-1 flex-col min-w-0">
                  <span className="font-medium truncate">{p.name}</span>
                  <span className="text-xs text-muted-foreground truncate">
                    {p.domain || p.website_url}
                  </span>
                </div>
                {isActive ? (
                  <Badge
                    variant="outline"
                    className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-500 px-2 py-0.5 text-[10px] font-semibold"
                  >
                    <Check className="h-3 w-3" /> Active
                  </Badge>
                ) : null}
              </DropdownMenuItem>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

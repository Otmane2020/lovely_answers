"use client";
import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useShoppingProducts } from "@/hooks/useShoppingProducts";
import { useActiveProject } from "@/hooks/useProjects";
import { supabase } from "@/integrations/supabase/client";
import { CalendarDays, Sparkles, Loader2, Check } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { toast } from "sonner";
import { format, addDays } from "date-fns";

export default function ShoppingPlanning() {
  const { project } = useActiveProject();
  const { data: products = [], isLoading } = useShoppingProducts();
  const [scheduling, setScheduling] = useState(false);

  const optimizedProducts = products.filter(p => p.status === "optimized" && !p.scheduled_date);
  const scheduledProducts = products.filter(p => p.scheduled_date).sort((a, b) => 
    new Date(a.scheduled_date!).getTime() - new Date(b.scheduled_date!).getTime()
  );
  const publishedProducts = products.filter(p => p.status === "published");

  const handleAutoSchedule = async () => {
    if (optimizedProducts.length === 0) {
      toast.error("No optimized products to schedule");
      return;
    }
    setScheduling(true);
    try {
      const today = new Date();
      const updates = optimizedProducts.map((product, index) => ({
        id: product.id,
        scheduled_date: format(addDays(today, index + 1), "yyyy-MM-dd"),
        status: "scheduled" as const,
      }));

      for (const update of updates) {
        await supabase
          .from("shopping_products")
          .update({ scheduled_date: update.scheduled_date, status: "scheduled" })
          .eq("id", update.id);
      }

      toast.success(`${updates.length} products scheduled over the next ${updates.length} days`);
      window.location.reload();
    } catch (e: any) {
      toast.error(e.message || "Failed to schedule products");
    } finally {
      setScheduling(false);
    }
  };

  return (
    <DashboardLayout>
    <div className="space-y-8">
      <PageHeader
        icon={CalendarDays}
        title="Shopping Planning"
        description="Schedule optimized product content for automatic publishing"
        gradientFrom="from-pink-500/10"
        gradientVia="via-fuchsia-500/10"
        gradientTo="to-purple-500/10"
        iconFrom="from-pink-500"
        iconTo="to-fuchsia-600"
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-6 text-center">
          <p className="text-3xl font-bold">{optimizedProducts.length}</p>
          <p className="text-sm text-muted-foreground">Ready to schedule</p>
        </Card>
        <Card className="p-6 text-center">
          <p className="text-3xl font-bold">{scheduledProducts.length}</p>
          <p className="text-sm text-muted-foreground">Scheduled</p>
        </Card>
        <Card className="p-6 text-center">
          <p className="text-3xl font-bold">{publishedProducts.length}</p>
          <p className="text-sm text-muted-foreground">Published</p>
        </Card>
      </div>

      {/* Auto Schedule CTA */}
      {optimizedProducts.length > 0 && (
        <Card className="bg-[hsl(222,47%,11%)] border-white/10 p-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-white">Auto-Schedule Products</h3>
              <p className="text-white/60 text-sm">Distribute {optimizedProducts.length} optimized products over the next {optimizedProducts.length} days</p>
            </div>
            <Button onClick={handleAutoSchedule} disabled={scheduling} className="bg-white text-[hsl(222,47%,11%)] hover:bg-white/90">
              {scheduling ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CalendarDays className="w-4 h-4 mr-2" />}
              Schedule All
            </Button>
          </div>
        </Card>
      )}

      {/* Scheduled Timeline */}
      <div>
        <h2 className="text-xl font-bold mb-4">Publication Timeline</h2>
        {scheduledProducts.length === 0 && optimizedProducts.length === 0 ? (
          <Card className="p-12 text-center">
            <CalendarDays className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No scheduled products</h3>
            <p className="text-muted-foreground">Optimize your products first, then schedule them for publishing</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {scheduledProducts.map((product) => (
              <Card key={product.id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {product.image_url && (
                    <img src={product.image_url} alt="" className="w-10 h-10 rounded object-cover bg-muted" />
                  )}
                  <div>
                    <p className="font-medium text-sm">{product.ai_title || product.title}</p>
                    <p className="text-xs text-muted-foreground">{product.category}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {product.ai_score && <Badge variant="secondary" className="bg-foreground/5">{product.ai_score}%</Badge>}
                  <span className="text-sm text-muted-foreground">
                    {product.scheduled_date && format(new Date(product.scheduled_date), "MMM d, yyyy")}
                  </span>
                  {product.status === "published" && <Check className="w-4 h-4 text-emerald-500" />}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
    </DashboardLayout>
  );
}

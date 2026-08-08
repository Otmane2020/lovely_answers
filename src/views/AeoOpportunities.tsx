import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Sparkles } from "lucide-react";

export default function AeoOpportunities() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          icon={Sparkles}
          title="Opportunities"
          description="Discover AI citation opportunities"
          gradientFrom="from-fuchsia-500/10"
          gradientVia="via-pink-500/10"
          gradientTo="to-rose-500/10"
          iconFrom="from-fuchsia-500"
          iconTo="to-pink-600"
        />
        <Card className="p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[hsl(222,47%,11%)] flex items-center justify-center mx-auto mb-6">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-xl font-semibold mb-2">No opportunities found</h2>
          <p className="text-muted-foreground max-w-md mx-auto">Use the wizard to discover AI citation opportunities for your brand.</p>
        </Card>
      </div>
    </DashboardLayout>
  );
}

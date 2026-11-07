import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sparkles, ArrowRight } from "lucide-react";

interface SoftPaywallBannerProps {
  answersCount: number;
  onUpgrade: () => void;
}

export function SoftPaywallBanner({ answersCount, onUpgrade }: SoftPaywallBannerProps) {
  return (
    <Card className="p-6 bg-foreground/5 border-foreground/10">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[hsl(222,47%,11%)] flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
             <h3 className="font-semibold text-foreground">Your competitors are being recommended by ChatGPT — you're not.</h3>
             <p className="text-sm text-muted-foreground">Unlock {answersCount} AI-optimized answers and start appearing in AI search results today.</p>
           </div>
         </div>
         <Button onClick={onUpgrade} className="bg-[hsl(222,47%,11%)] hover:bg-[hsl(222,47%,15%)] text-white">
           Start Ranking <ArrowRight className="w-4 h-4 ml-2" />
         </Button>
      </div>
    </Card>
  );
}

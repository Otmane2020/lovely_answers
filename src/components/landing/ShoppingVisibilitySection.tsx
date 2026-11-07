import { motion } from "framer-motion";
import { ShoppingBag, Star, MessageSquare, Sparkles } from "lucide-react";

export function ShoppingVisibilitySection() {
  return (
    <section className="py-12 md:py-24 bg-[#f8f9fb] relative overflow-hidden">
      <div className="container px-4 relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-8 md:mb-16"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs md:text-sm text-primary font-medium mb-3 md:mb-4">
            <ShoppingBag className="h-3 w-3 md:h-3.5 md:w-3.5" />
            #1 AI Shopping Platform Visibility
          </div>
          <h2 className="text-2xl md:text-5xl font-extrabold tracking-tight mb-3 md:mb-4 text-foreground">
            Your Products, Everywhere{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-600">
              AI Recommends
            </span>
          </h2>
          <p className="text-muted-foreground text-sm md:text-lg max-w-2xl mx-auto">
            Dominate Google Shopping, Rich Results, Discover feeds, and AI conversations — all on autopilot.
          </p>
        </motion.div>

        {/* Single ChatGPT phone mockup */}
        <div className="flex justify-center max-w-sm mx-auto">
          
          {/* Phone: ChatGPT Product Recommendation */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="w-full max-w-[280px] md:max-w-[320px]"
          >
            <PhoneMockup label="AI Chat" accent>
              <div className="flex items-center gap-1.5 mb-2 md:mb-3 px-1">
                <div className="w-4 h-4 md:w-5 md:h-5 rounded-full bg-[#10a37f] flex items-center justify-center">
                  <MessageSquare className="h-2 w-2 md:h-2.5 md:w-2.5 text-white" />
                </div>
                <span className="text-[10px] md:text-sm font-semibold text-foreground">ChatGPT</span>
              </div>
              
              {/* User message */}
              <div className="flex justify-end mb-1.5 md:mb-2">
                <div className="max-w-[85%] px-2 py-1 md:px-2.5 md:py-1.5 rounded-xl bg-primary text-primary-foreground text-[9px] md:text-xs">
                  Best running shoes under $150?
                </div>
              </div>
              
              {/* AI response with product */}
              <div className="flex justify-start">
                <div className="max-w-[92%] px-2 py-1.5 md:px-2.5 md:py-2 rounded-xl bg-muted/70 border border-border text-[9px] md:text-xs text-foreground">
                  <p className="mb-1.5 md:mb-2">I recommend the <span className="font-bold text-primary">Nike Air Max 90</span> — great comfort and style.</p>
                  {/* Product card inside chat */}
                  <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-1.5 md:p-2">
                    <div className="flex items-center gap-1.5 md:gap-2">
                      <div className="w-8 h-8 md:w-12 md:h-12 rounded-md bg-gradient-to-br from-red-100 to-red-50 flex items-center justify-center flex-shrink-0">
                        <Sparkles className="h-4 w-4 md:h-5 md:w-5 text-red-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[9px] md:text-[10px] font-semibold truncate">Nike Air Max 90</p>
                        <div className="flex items-center gap-0.5 mt-0.5">
                          <div className="flex">
                            {[1,2,3,4,5].map(i => <Star key={i} className="h-1.5 w-1.5 md:h-2 md:w-2 fill-amber-400 text-amber-400" />)}
                          </div>
                        </div>
                        <p className="text-[9px] md:text-[10px] font-bold text-emerald-600 mt-0.5">$149.99</p>
                      </div>
                    </div>
                    <div className="mt-1 md:mt-1.5 flex items-center gap-1">
                      <span className="text-[7px] md:text-[8px] text-primary font-medium">🔗 your-store.com</span>
                      <span className="text-[7px] md:text-[8px] text-muted-foreground">• In stock</span>
                    </div>
                  </div>
                  <p className="mt-1.5 md:mt-2 text-[8px] md:text-[9px] text-muted-foreground">Available at <span className="text-primary font-medium">your-store.com</span> with free shipping.</p>
                </div>
              </div>
            </PhoneMockup>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function PhoneMockup({ children, label, highlight, accent }: { children: React.ReactNode; label: string; highlight?: boolean; accent?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1.5 md:gap-2">
      <div className={`w-full rounded-[1rem] md:rounded-[1.5rem] border-2 md:border-[3px] p-1 md:p-1.5 shadow-lg md:shadow-xl ${
        highlight ? "border-primary/40 bg-white shadow-primary/10" :
        accent ? "border-emerald-400/40 bg-white shadow-emerald-500/10" :
        "border-border/50 bg-white"
      }`}>
        {/* Notch */}
        <div className="flex justify-center mb-0.5 md:mb-1">
          <div className="w-10 md:w-16 h-2.5 md:h-4 bg-muted/60 rounded-full" />
        </div>
        {/* Content */}
        <div className="bg-background rounded-lg md:rounded-2xl p-1.5 md:p-3 min-h-[180px] md:min-h-[300px]">
          {children}
        </div>
      </div>
      <span className={`text-[10px] md:text-sm font-semibold ${
        highlight ? "text-primary" : accent ? "text-emerald-600" : "text-muted-foreground"
      }`}>{label}</span>
    </div>
  );
}

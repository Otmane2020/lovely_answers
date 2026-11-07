"use client";
import { useRouter, useParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useShoppingProducts, useGenerateProductAI } from "@/hooks/useShoppingProducts";
import { ArrowLeft, Sparkles, Copy, ExternalLink, Loader2, Package } from "lucide-react";
import { toast } from "sonner";

export default function ShoppingProduct() {
  const { productId } = useParams();
  const router = useRouter();
  const { data: products = [] } = useShoppingProducts();
  const generateAI = useGenerateProductAI();

  const product = products.find(p => p.id === productId);

  if (!product) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <Package className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">Product not found</h3>
          <Button variant="ghost" className="mt-4" onClick={() => router.push("/shopping")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to products
          </Button>
        </div>
      </div>
    );
  }

  const handleGenerate = async () => {
    try {
      await generateAI.mutateAsync({ productId: product.id });
      toast.success("AI content generated!");
    } catch (e: any) {
      toast.error(e.message || "Generation failed");
    }
  };

  const copySchema = () => {
    if (product.ai_schema_markup) {
      navigator.clipboard.writeText(JSON.stringify(product.ai_schema_markup, null, 2));
      toast.success("Schema markup copied!");
    }
  };

  const faq = Array.isArray(product.ai_faq) ? product.ai_faq : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push("/shopping")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{product.title}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary">{product.status}</Badge>
            {product.ai_score && <Badge variant="secondary" className="bg-foreground/5">{product.ai_score}% AI Score</Badge>}
            {product.category && <span className="text-sm text-muted-foreground">{product.category}</span>}
          </div>
        </div>
        <Button
          onClick={handleGenerate}
          disabled={generateAI.isPending}
          className="bg-[hsl(222,47%,11%)] hover:bg-[hsl(222,47%,15%)] text-white"
        >
          {generateAI.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
          {product.ai_faq ? "Regenerate" : "Generate AI Content"}
        </Button>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Product Info */}
        <Card className="p-6">
          <h3 className="font-semibold mb-4">Product Info</h3>
          {product.image_url && (
            <img src={product.image_url} alt={product.title} className="w-full h-48 rounded-lg object-cover bg-muted mb-4" />
          )}
          <div className="space-y-3 text-sm">
            {product.price && <div><span className="text-muted-foreground">Price:</span> <span className="font-medium">{product.price} {product.currency}</span></div>}
            {product.brand && <div><span className="text-muted-foreground">Brand:</span> {product.brand}</div>}
            {product.availability && <div><span className="text-muted-foreground">Availability:</span> {product.availability}</div>}
            {product.gtin && <div><span className="text-muted-foreground">GTIN:</span> {product.gtin}</div>}
            {product.description && <div><span className="text-muted-foreground">Description:</span><p className="mt-1 text-muted-foreground">{product.description}</p></div>}
            {product.product_url && (
              <a href={product.product_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-foreground hover:underline">
                <ExternalLink className="w-3 h-3" /> View product page
              </a>
            )}
          </div>
        </Card>

        {/* AI Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* AI Title & Description */}
          {product.ai_title && (
            <Card className="p-6">
              <h3 className="font-semibold mb-3">AI Optimized Title</h3>
              <p className="text-lg font-medium">{product.ai_title}</p>
              {product.ai_description && (
                <>
                  <h4 className="font-semibold mt-4 mb-2">AI Description</h4>
                  <p className="text-muted-foreground text-sm whitespace-pre-line">{product.ai_description}</p>
                </>
              )}
            </Card>
          )}

          {/* FAQ */}
          {faq.length > 0 && (
            <Card className="p-6">
              <h3 className="font-semibold mb-4">AI Product Q&A ({faq.length})</h3>
              <div className="space-y-4">
                {faq.map((item: any, i: number) => (
                  <div key={i} className="border-b border-border/50 pb-4 last:border-0 last:pb-0">
                    <p className="font-medium text-sm">Q: {item.question}</p>
                    <p className="text-sm text-muted-foreground mt-1">A: {item.answer}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Schema Markup */}
          {product.ai_schema_markup && (
            <Card className="p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">Schema Markup (JSON-LD)</h3>
                <Button variant="ghost" size="sm" onClick={copySchema}>
                  <Copy className="w-4 h-4 mr-1" /> Copy
                </Button>
              </div>
              <pre className="bg-muted/50 rounded-lg p-4 text-xs overflow-x-auto max-h-64">
                {JSON.stringify(product.ai_schema_markup, null, 2)}
              </pre>
            </Card>
          )}

          {!product.ai_title && !product.ai_faq && (
            <Card className="p-12 text-center">
              <Sparkles className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No AI content yet</h3>
              <p className="text-muted-foreground mb-4">Click "Generate AI Content" to create optimized Q&A, title, description, and schema markup</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

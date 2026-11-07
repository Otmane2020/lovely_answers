"use client";
import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Download, CreditCard, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Invoice {
  id: string;
  date: string;
  amount: string;
  status: "paid" | "pending" | "failed";
  pdfUrl?: string;
}

export default function AeoBilling() {
  const { user } = useAuth();
  const { subscribed, trial, subscriptionEnd, openCustomerPortal } = useSubscription();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  const handleCancelSubscription = async () => {
    setCancelling(true);
    try {
      const { data, error } = await supabase.functions.invoke("cancel-subscription");
      if (error) throw error;
      const endDate = data?.period_end
        ? format(new Date(data.period_end), "MMM d, yyyy")
        : "the end of your billing period";
      toast.success(`Subscription cancelled. You keep access until ${endDate}.`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to cancel subscription");
    } finally {
      setCancelling(false);
    }
  };

  // Fetch real invoices from database
  useEffect(() => {
    const fetchInvoices = async () => {
      if (!user?.id) {
        setLoadingInvoices(false);
        return;
      }
      
      setLoadingInvoices(true);
      
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("user_id", user.id)
        .order("billing_date", { ascending: false });
      
      if (data && !error) {
        setInvoices(data.map(inv => ({
          id: inv.stripe_invoice_id || inv.id,
          date: inv.billing_date || new Date().toISOString(),
          amount: `$${(inv.amount || 0).toFixed(2)}`,
          status: (inv.status as "paid" | "pending" | "failed") || "paid",
          pdfUrl: inv.pdf_url || undefined
        })));
      }
      
      setLoadingInvoices(false);
    };
    
    fetchInvoices();
  }, [user?.id]);

  const getStatusBadge = (status: Invoice["status"]) => {
    switch (status) {
      case "paid":
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Paid</Badge>;
      case "pending":
        return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">Pending</Badge>;
      case "failed":
        return <Badge className="bg-red-500/10 text-red-600 border-red-500/20">Failed</Badge>;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          icon={CreditCard}
          title="Billing"
          description="Manage your subscription and payment history"
          gradientFrom="from-green-500/10"
          gradientVia="via-emerald-500/10"
          gradientTo="to-teal-500/10"
          iconFrom="from-green-500"
          iconTo="to-emerald-600"
        />

        {/* Subscription Card */}
        <Card className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <CreditCard className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Your Subscription</h2>
                <p className="text-muted-foreground">Manage your plan and billing</p>
              </div>
            </div>
            {trial ? (
              <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">
                Trial Period
              </Badge>
            ) : subscribed ? (
              <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                Active
              </Badge>
            ) : (
              <Badge variant="secondary">Inactive</Badge>
            )}
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground">Current Plan</p>
              <p className="text-lg font-semibold mt-1">All-in-One</p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground">Next Billing Date</p>
              <p className="text-lg font-semibold mt-1">
                {subscriptionEnd 
                  ? format(new Date(subscriptionEnd), "MMM d, yyyy")
                  : "—"
                }
              </p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground">Status</p>
              <p className="text-lg font-semibold mt-1">
                {trial ? "Trial" : subscribed ? "Active" : "Inactive"}
              </p>
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <Button onClick={openCustomerPortal}>
              Manage Subscription
            </Button>
            {subscribed && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    disabled={cancelling}
                  >
                    {cancelling ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : null}
                    Cancel Subscription
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancel your subscription?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Your subscription will remain active until{" "}
                      {subscriptionEnd
                        ? format(new Date(subscriptionEnd), "MMM d, yyyy")
                        : "the end of your current billing period"}
                      . You'll keep full access until then and won't be charged again.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep subscription</AlertDialogCancel>
                    <AlertDialogAction onClick={handleCancelSubscription}>
                      Confirm cancellation
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </Card>

        {/* Payment History */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Payment History</h3>
          
          {loadingInvoices ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : invoices.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice ID</TableHead>
                  <TableHead>Billing Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Invoice PDF</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">{invoice.id.slice(0, 12)}...</TableCell>
                    <TableCell>
                      {format(new Date(invoice.date), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>{invoice.amount}</TableCell>
                    <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="gap-2"
                        disabled={!invoice.pdfUrl}
                        onClick={() => invoice.pdfUrl && window.open(invoice.pdfUrl, '_blank')}
                      >
                        <Download className="w-4 h-4" />
                        Download
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>No payment history yet</p>
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}

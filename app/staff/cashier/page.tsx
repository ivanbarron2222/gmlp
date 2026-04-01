'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CreditCard, Percent, Printer, ReceiptText, Wallet } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageLayout } from '@/components/layout/page-layout';
import { formatCurrency } from '@/lib/formatting';
import {
  billingCatalog,
  buildDefaultLineItems,
  paymentMethods,
  type BillingRecord,
  type BillingPaymentMethod,
  type CatalogService,
} from '@/lib/billing';
import {
  saveVisitBilling,
} from '@/lib/patient-records-store';

function CashierPageContent() {
  const searchParams = useSearchParams();
  const queueId = searchParams.get('queueId') ?? '';
  const [selectedServices, setSelectedServices] = useState<CatalogService[]>([]);
  const [catalogServices, setCatalogServices] = useState<CatalogService[]>(billingCatalog);
  const [paymentMethod, setPaymentMethod] = useState<BillingPaymentMethod>('Cash');
  const [discountRate, setDiscountRate] = useState(0);
  const [paymentMessage, setPaymentMessage] = useState('');
  const [visitContext, setVisitContext] = useState<{
    patient: {
      name: string;
      contactNumber: string;
      emailAddress: string;
    };
    visit: {
      queueNumber: string;
      labNumbers: string[];
      patientName: string;
      serviceType: string;
      requestedLabService: string;
      completedLanes: string[];
      visitStatus: string;
    };
    billing: BillingRecord | null;
    suggestedLineItems: CatalogService[];
  } | null>(null);
  const [pageError, setPageError] = useState('');

  const existingBilling = visitContext?.billing ?? null;

  useEffect(() => {
    let isMounted = true;

    fetch('/api/staff/service-catalog', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Unable to load service catalog.');
        }

        return (await response.json()) as { services: CatalogService[] };
      })
      .then((payload) => {
        if (isMounted && payload.services.length > 0) {
          setCatalogServices(payload.services);
        }
      })
      .catch(() => {
        if (isMounted) {
          setCatalogServices(billingCatalog);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!queueId) {
      setVisitContext(null);
      return;
    }

    let isMounted = true;

    fetch(`/api/staff/cashier?queueId=${encodeURIComponent(queueId)}`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? 'Unable to load cashier context.');
        }

        return (await response.json()) as {
          patient: {
            name: string;
            contactNumber: string;
            emailAddress: string;
          };
          visit: {
            queueNumber: string;
            labNumbers: string[];
            patientName: string;
            serviceType: string;
            requestedLabService: string;
            completedLanes: string[];
            visitStatus: string;
          };
          billing: BillingRecord | null;
          suggestedLineItems: CatalogService[];
        };
      })
      .then((payload) => {
        if (isMounted) {
          setVisitContext(payload);
          setPageError('');
        }
      })
      .catch((error) => {
        if (isMounted) {
          setPageError(error instanceof Error ? error.message : 'Unable to load cashier context.');
          setVisitContext(null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [queueId]);

  useEffect(() => {
    if (!visitContext) {
      return;
    }

    if (existingBilling) {
      const hydratedServices = existingBilling.lineItems
        .map((lineItem) =>
          catalogServices.find((catalogItem) => catalogItem.id === lineItem.id) ?? {
            ...lineItem,
            category: 'Custom',
          }
        );

      setSelectedServices(hydratedServices);
      setPaymentMethod(existingBilling.paymentMethod);
      setDiscountRate(existingBilling.subtotal > 0 ? existingBilling.discount / existingBilling.subtotal : 0);
      return;
    }

    setSelectedServices(
      buildDefaultLineItems(
        visitContext.visit.serviceType,
        visitContext.visit.requestedLabService,
        visitContext.visit.completedLanes,
        catalogServices
      )
    );
    setPaymentMethod('Cash');
    setDiscountRate(0);
  }, [catalogServices, existingBilling, visitContext]);

  const subtotal = selectedServices.reduce((sum, service) => sum + service.amount, 0);
  const discount = subtotal * discountRate;
  const total = subtotal - discount;

  const toggleService = (service: CatalogService) => {
    const isSelected = selectedServices.some((item) => item.id === service.id);
    setSelectedServices(
      isSelected
        ? selectedServices.filter((item) => item.id !== service.id)
        : [...selectedServices, service]
    );
  };

  const handlePrintSlip = () => {
    if (!visitContext || typeof window === 'undefined') {
      return;
    }

    const printWindow = window.open('', '_blank', 'width=420,height=720');

    if (!printWindow) {
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Queue Slip ${visit.queueNumber}</title>
          <style>
            body {
              margin: 0;
              padding: 24px;
              font-family: Arial, sans-serif;
              background: #ffffff;
              color: #0f172a;
            }
            .slip {
              border: 1px solid #cbd5e1;
              border-radius: 18px;
              padding: 24px;
              max-width: 340px;
              margin: 0 auto;
              text-align: center;
            }
            .brand {
              font-size: 11px;
              font-weight: 700;
              letter-spacing: 0.22em;
              text-transform: uppercase;
              color: #0b65b1;
            }
            .title {
              margin-top: 10px;
              font-size: 24px;
              font-weight: 700;
            }
            .queue {
              margin-top: 10px;
              font-size: 52px;
              font-weight: 900;
              color: #0b65b1;
              line-height: 1;
            }
            .meta {
              margin-top: 16px;
              font-size: 14px;
              line-height: 1.6;
              color: #475569;
            }
            .meta strong {
              color: #0f172a;
            }
            .note {
              margin-top: 14px;
              font-size: 12px;
              color: #64748b;
            }
            @page {
              size: auto;
              margin: 12mm;
            }
          </style>
        </head>
        <body>
          <div class="slip">
            <div class="brand">Globalife Medical Laboratory &amp; Polyclinic</div>
            <div class="title">Queue Slip</div>
            <div class="queue">${visit.queueNumber}</div>
            <div class="meta">
              <div><strong>${visit.patientName}</strong></div>
              <div>${visit.labNumbers.length > 0 ? `Lab No: ${visit.labNumbers.join(', ')}` : 'Lab No: N/A'}</div>
              <div>${visit.serviceType}${visit.requestedLabService ? ` - ${visit.requestedLabService}` : ''}</div>
              <div>${new Date().toLocaleString()}</div>
            </div>
            <div class="note">Present this queue number at the assigned station for staff processing.</div>
          </div>
          <script>
            window.onload = function () {
              window.print();
              window.onafterprint = function () { window.close(); };
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleSaveBilling = async (status: BillingRecord['paymentStatus']) => {
    if (!queueId) {
      return;
    }

    const billing: BillingRecord = {
      lineItems: selectedServices.map(({ id, name, amount }) => ({ id, name, amount })),
      subtotal,
      discount,
      total,
      paymentMethod,
      paymentStatus: status,
      paidAt: status === 'paid' ? new Date().toISOString() : undefined,
    };

    const response = await fetch('/api/staff/cashier', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        queueId,
        billing,
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setPageError(payload?.error ?? 'Unable to save billing.');
      return;
    }

    saveVisitBilling(queueId, billing);
    setVisitContext((current) =>
      current
        ? {
            ...current,
            billing,
            visit: {
              ...current.visit,
              visitStatus: billing.paymentStatus === 'paid' ? 'paid' : 'awaiting-payment',
            },
          }
        : current
    );
    setPageError('');
    setPaymentMessage(
      status === 'paid'
        ? 'Payment has been recorded to the database and mirrored to patient records.'
        : 'Billing draft saved to the database.'
    );
  };

  if (!visitContext) {
    return (
      <PageLayout>
        <div className="px-8 py-8">
          <Card className="p-8 text-center">
            <h1 className="text-2xl font-bold">No Active Billing Context</h1>
            <p className="mt-3 text-muted-foreground">
              {pageError || 'Open cashier from a scanned queue slip or with a valid `queueId`.'}
            </p>
            <Button asChild className="mt-6">
              <Link href="/staff/queue">Back to Queue Management</Link>
            </Button>
          </Card>
        </div>
      </PageLayout>
    );
  }

  const { patient, visit } = visitContext;

  return (
    <PageLayout>
      <div className="px-8 py-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Cashier / Billing</h1>
            <p className="mt-2 text-muted-foreground">
              Handle front desk billing and print the queue slip for the active visit once the
              patient is ready to proceed.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/staff/patient-records">Open Patient Records</Link>
          </Button>
        </div>

        <div className="mt-8 grid gap-8 xl:grid-cols-[1.2fr_1fr]">
          <div className="space-y-6">
            <Card className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">
                    Active Visit
                  </p>
                  <h2 className="mt-2 text-2xl font-bold">{visit.queueNumber}</h2>
                  <p className="mt-2 text-muted-foreground">{visit.patientName}</p>
                </div>
                <Badge variant="outline" className="bg-primary/10 text-primary">
                  {visit.visitStatus}
                </Badge>
              </div>

              <div className="mt-6 grid gap-3 text-sm md:grid-cols-2">
                <p>
                  Service: <span className="font-medium text-foreground">{visit.serviceType}</span>
                </p>
                <p>
                  Lab Number:{' '}
                  <span className="font-medium text-foreground">
                    {visit.labNumbers.length > 0 ? visit.labNumbers.join(', ') : 'N/A'}
                  </span>
                </p>
                <p>
                  Lab Request:{' '}
                  <span className="font-medium text-foreground">
                    {visit.requestedLabService || 'N/A'}
                  </span>
                </p>
                <p>
                  Contact:{' '}
                  <span className="font-medium text-foreground">{patient.contactNumber || 'N/A'}</span>
                </p>
                <p>
                  Email:{' '}
                  <span className="font-medium text-foreground">{patient.emailAddress || 'N/A'}</span>
                </p>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <Button variant="outline" onClick={handlePrintSlip} className="gap-2">
                  <Printer className="h-4 w-4" />
                  Print Queue Slip
                </Button>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-lg font-bold">Billable Services</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Select the services that should be stored with this visit invoice.
              </p>

              <div className="mt-5 space-y-3">
                {catalogServices.map((service) => {
                  const isSelected = selectedServices.some((item) => item.id === service.id);

                  return (
                    <button
                      key={service.id}
                      type="button"
                      onClick={() => toggleService(service)}
                      className={`flex w-full items-start justify-between rounded-xl border p-4 text-left transition-colors ${
                        isSelected
                          ? 'border-primary bg-primary/5'
                          : 'border-border bg-background hover:border-primary/50'
                      }`}
                    >
                      <div>
                        <p className="font-semibold">{service.name}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{service.category}</p>
                      </div>
                      <span className="font-semibold text-primary">
                        {formatCurrency(service.amount)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">Invoice Summary</h2>
                <Badge variant="outline">
                  {existingBilling?.paymentStatus === 'paid' ? 'PAID' : 'ACTIVE DRAFT'}
                </Badge>
              </div>

              <div className="mt-6 space-y-3 border-b border-border pb-6">
                {selectedServices.length > 0 ? (
                  selectedServices.map((service) => (
                    <div key={service.id} className="flex items-center justify-between text-sm">
                      <div>
                        <p className="font-medium">{service.name}</p>
                        <p className="text-xs text-muted-foreground">{service.category}</p>
                      </div>
                      <span className="font-semibold">{formatCurrency(service.amount)}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No services selected.</p>
                )}
              </div>

              <div className="mt-6">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Payment Method
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {paymentMethods.map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setPaymentMethod(method)}
                      className={`rounded-lg border px-3 py-3 text-sm font-medium transition-colors ${
                        paymentMethod === method
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background hover:border-primary/50'
                      }`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-6">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Discount
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    variant={discountRate === 0 ? 'default' : 'outline'}
                    onClick={() => setDiscountRate(0)}
                  >
                    No Discount
                  </Button>
                  <Button
                    variant={discountRate === 0.2 ? 'default' : 'outline'}
                    onClick={() => setDiscountRate(0.2)}
                    className="gap-2"
                  >
                    <Percent className="h-4 w-4" />
                    Senior 20%
                  </Button>
                </div>
              </div>

              <div className="mt-6 space-y-2 border-t border-border pt-6">
                <div className="flex justify-between text-sm">
                  <span>Subtotal</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Discount</span>
                  <span>-{formatCurrency(discount)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span>{formatCurrency(total)}</span>
                </div>
              </div>

              <div className="mt-6 grid gap-3">
                <Button onClick={() => handleSaveBilling('paid')} className="gap-2">
                  <Wallet className="h-4 w-4" />
                  Process Payment
                </Button>
                <Button variant="outline" onClick={() => handleSaveBilling('unpaid')} className="gap-2">
                  <ReceiptText className="h-4 w-4" />
                  Save Billing Draft
                </Button>
              </div>
            </Card>

            {existingBilling && (
              <Card className="p-6">
                <div className="flex items-center gap-3">
                  <CreditCard className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-bold">Latest Saved Billing</h2>
                </div>
                <div className="mt-4 grid gap-2 text-sm text-muted-foreground">
                  <p>
                    Payment Method:{' '}
                    <span className="font-medium text-foreground">{existingBilling.paymentMethod}</span>
                  </p>
                  <p>
                    Payment Status:{' '}
                    <span className="font-medium text-foreground">{existingBilling.paymentStatus}</span>
                  </p>
                  <p>
                    Total:{' '}
                    <span className="font-medium text-foreground">{formatCurrency(existingBilling.total)}</span>
                  </p>
                  {existingBilling.paidAt && (
                    <p>
                      Paid At:{' '}
                      <span className="font-medium text-foreground">
                        {new Date(existingBilling.paidAt).toLocaleString()}
                      </span>
                    </p>
                  )}
                </div>
              </Card>
            )}

            {paymentMessage && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {paymentMessage}
              </div>
            )}

            {pageError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {pageError}
              </div>
            )}

            {existingBilling?.paymentStatus === 'paid' && queueId && (
              <Card className="p-6">
                <h2 className="text-lg font-bold">Next Step</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Payment is completed. Open the release workspace for this queue-linked visit.
                </p>
                <Button asChild className="mt-4 w-full">
                  <Link href={`/staff/result-release?queueId=${encodeURIComponent(queueId)}`}>
                    Open Result Release
                  </Link>
                </Button>
              </Card>
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

export default function CashierPage() {
  return (
    <Suspense fallback={null}>
      <CashierPageContent />
    </Suspense>
  );
}

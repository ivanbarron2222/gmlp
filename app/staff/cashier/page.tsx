'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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
import { saveVisitBilling } from '@/lib/patient-records-store';

type PendingBillingItem = {
  queueId: string;
  queueNumber: string;
  patientName: string;
  serviceType: string;
  requestedLabService: string;
  currentLane: string;
  visitStatus: string;
  labNumbers: string[];
  createdAt: string;
  paymentStatus: 'paid' | 'unpaid';
};

type CashierPatient = {
  name: string;
  contactNumber: string;
  emailAddress: string;
};

type CashierVisit = {
  queueNumber: string;
  labNumbers: string[];
  patientName: string;
  serviceType: string;
  requestedLabService: string;
  completedLanes: string[];
  visitStatus: string;
};

type CashierPayload = {
  pendingVisits: PendingBillingItem[];
  patient: CashierPatient | null;
  visit: CashierVisit | null;
  billing: BillingRecord | null;
  suggestedLineItems: CatalogService[];
};

function CashierPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialQueueId = searchParams.get('queueId') ?? '';
  const [activeQueueId, setActiveQueueId] = useState(initialQueueId);
  const [selectedServices, setSelectedServices] = useState<CatalogService[]>([]);
  const [catalogServices, setCatalogServices] = useState<CatalogService[]>(billingCatalog);
  const [paymentMethod, setPaymentMethod] = useState<BillingPaymentMethod>('Cash');
  const [discountRate, setDiscountRate] = useState(0);
  const [paymentMessage, setPaymentMessage] = useState('');
  const [visitContext, setVisitContext] = useState<{
    patient: CashierPatient;
    visit: CashierVisit;
    billing: BillingRecord | null;
    suggestedLineItems: CatalogService[];
  } | null>(null);
  const [pendingVisits, setPendingVisits] = useState<PendingBillingItem[]>([]);
  const [pageError, setPageError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    setActiveQueueId(initialQueueId);
  }, [initialQueueId]);

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
    let isMounted = true;

    const loadCashierContext = async () => {
      setIsLoading(true);

      try {
        const url = activeQueueId
          ? `/api/staff/cashier?queueId=${encodeURIComponent(activeQueueId)}`
          : '/api/staff/cashier';

        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? 'Unable to load cashier context.');
        }

        const payload = (await response.json()) as CashierPayload;
        if (!isMounted) {
          return;
        }

        setPendingVisits(payload.pendingVisits ?? []);
        setVisitContext(
          payload.patient && payload.visit
            ? {
                patient: payload.patient,
                visit: payload.visit,
                billing: payload.billing,
                suggestedLineItems: payload.suggestedLineItems,
              }
            : null
        );
        setPageError('');

        if (!activeQueueId && payload.pendingVisits.length > 0) {
          handleSelectQueue(payload.pendingVisits[0].queueId);
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setPageError(error instanceof Error ? error.message : 'Unable to load cashier context.');
        setVisitContext(null);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadCashierContext();

    return () => {
      isMounted = false;
    };
  }, [activeQueueId, refreshTick]);

  const existingBilling = visitContext?.billing ?? null;

  useEffect(() => {
    if (!visitContext) {
      return;
    }

    if (existingBilling) {
      const hydratedServices = existingBilling.lineItems.map(
        (lineItem) =>
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

  const selectedQueueSummary = useMemo(
    () => pendingVisits.find((item) => item.queueId === activeQueueId) ?? null,
    [activeQueueId, pendingVisits]
  );

  function handleSelectQueue(queueId: string) {
    setActiveQueueId(queueId);
    setPaymentMessage('');

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set('queueId', queueId);
    router.replace(`${pathname}?${nextParams.toString()}`);
  }

  const toggleService = (service: CatalogService) => {
    const isSelected = selectedServices.some((item) => item.id === service.id);
    setSelectedServices(
      isSelected
        ? selectedServices.filter((item) => item.id !== service.id)
        : [...selectedServices, service]
    );
  };

  const handlePrintInvoice = () => {
    if (!visitContext || typeof window === 'undefined') {
      return;
    }

    const invoiceWindow = window.open('', '_blank', 'width=860,height=940');
    if (!invoiceWindow) {
      return;
    }

    const { patient, visit } = visitContext;
    const lineItems = selectedServices
      .map(
        (service) => `
          <tr>
            <td>${service.name}</td>
            <td>${service.category}</td>
            <td class="amount">${formatCurrency(service.amount)}</td>
          </tr>
        `
      )
      .join('');

    invoiceWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Invoice ${visit.queueNumber}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              color: #0f172a;
              padding: 24px;
            }
            .sheet {
              max-width: 760px;
              margin: 0 auto;
              border: 1px solid #cbd5e1;
              border-radius: 18px;
              padding: 24px;
            }
            .brand {
              font-size: 12px;
              font-weight: 700;
              letter-spacing: 0.2em;
              text-transform: uppercase;
              color: #0b65b1;
            }
            .heading {
              display: flex;
              justify-content: space-between;
              align-items: start;
              gap: 16px;
              margin-top: 12px;
            }
            .heading h1 {
              margin: 0;
              font-size: 30px;
            }
            .meta {
              margin-top: 18px;
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 10px 18px;
              font-size: 14px;
            }
            .label {
              color: #64748b;
              font-size: 12px;
              text-transform: uppercase;
              letter-spacing: 0.08em;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 20px;
            }
            th, td {
              border: 1px solid #cbd5e1;
              padding: 10px 12px;
              font-size: 14px;
              text-align: left;
            }
            th {
              background: #eff6ff;
            }
            .amount {
              text-align: right;
              white-space: nowrap;
            }
            .totals {
              margin-top: 18px;
              margin-left: auto;
              width: 280px;
              font-size: 14px;
            }
            .totals div {
              display: flex;
              justify-content: space-between;
              padding: 6px 0;
            }
            .totals .total {
              font-size: 18px;
              font-weight: 700;
              border-top: 1px solid #cbd5e1;
              margin-top: 6px;
              padding-top: 10px;
            }
            .note {
              margin-top: 18px;
              font-size: 13px;
              color: #475569;
            }
            @page {
              size: auto;
              margin: 12mm;
            }
          </style>
        </head>
        <body>
          <div class="sheet">
            <div class="brand">Globalife Medical Laboratory &amp; Polyclinic</div>
            <div class="heading">
              <div>
                <h1>Invoice / Receipt</h1>
                <div style="margin-top: 8px; color: #475569;">Present this receipt to the laboratory before processing.</div>
              </div>
              <div style="text-align: right; font-size: 14px;">
                <div><strong>${existingBilling?.invoiceNumber || 'Pending Invoice No.'}</strong></div>
                <div>${new Date().toLocaleString()}</div>
              </div>
            </div>

            <div class="meta">
              <div><div class="label">Patient</div><div>${visit.patientName}</div></div>
              <div><div class="label">Service</div><div>${visit.serviceType}${visit.requestedLabService ? ` - ${visit.requestedLabService}` : ''}</div></div>
              <div><div class="label">Lab Number</div><div>${visit.labNumbers.length > 0 ? visit.labNumbers.join(', ') : 'N/A'}</div></div>
              <div><div class="label">Invoice Number</div><div>${existingBilling?.invoiceNumber || 'To be assigned on save'}</div></div>
              <div><div class="label">Payment Method</div><div>${paymentMethod}</div></div>
              <div><div class="label">Contact</div><div>${patient.contactNumber || 'N/A'}</div></div>
              <div><div class="label">Email</div><div>${patient.emailAddress || 'N/A'}</div></div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Category</th>
                  <th class="amount">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${lineItems || '<tr><td colspan="3">No billable services selected.</td></tr>'}
              </tbody>
            </table>

            <div class="totals">
              <div><span>Subtotal</span><span>${formatCurrency(subtotal)}</span></div>
              <div><span>Discount</span><span>-${formatCurrency(discount)}</span></div>
              <div class="total"><span>Total</span><span>${formatCurrency(total)}</span></div>
            </div>

            <div class="note">
              Payment status: <strong>${existingBilling?.paymentStatus === 'paid' ? 'Paid' : 'For payment processing'}</strong>
            </div>
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
    invoiceWindow.document.close();
  };

  const handleSaveBilling = async (status: BillingRecord['paymentStatus']) => {
    if (!activeQueueId) {
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
        queueId: activeQueueId,
        billing,
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setPageError(payload?.error ?? 'Unable to save billing.');
      return;
    }

    const payload = (await response.json()) as { billing: BillingRecord };
    const savedBilling = payload.billing;

    saveVisitBilling(activeQueueId, savedBilling);
    setVisitContext((current) =>
      current
        ? {
            ...current,
            billing: savedBilling,
            visit: {
              ...current.visit,
              visitStatus: savedBilling.paymentStatus === 'paid' ? 'paid' : 'awaiting-payment',
            },
          }
        : current
    );
    setPendingVisits((current) =>
      status === 'paid' ? current.filter((item) => item.queueId !== activeQueueId) : current
    );
    setPageError('');
    setPaymentMessage(
      status === 'paid'
        ? 'Payment recorded. Print the invoice / receipt and let the patient proceed back to the queue for laboratory processing.'
        : 'Billing draft saved to the database.'
    );
    setRefreshTick((current) => current + 1);
  };

  return (
    <PageLayout>
      <div className="px-8 py-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Cashier / Billing</h1>
            <p className="mt-2 text-muted-foreground">
              Process pending patient payments, print the invoice / receipt, and send the patient
              back to the correct laboratory queue for processing.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/staff/queue">Open Queue Management</Link>
          </Button>
        </div>

        <div className="mt-8 grid gap-8 xl:grid-cols-[360px_1fr]">
          <Card className="p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">Pending Billing</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Select a patient who still needs cashier processing.
                </p>
              </div>
              <Badge variant="outline">{pendingVisits.length} pending</Badge>
            </div>

            <div className="mt-5 max-h-[68vh] space-y-3 overflow-y-auto pr-1">
              {pendingVisits.length > 0 ? (
                pendingVisits.map((item) => {
                  const isActive = item.queueId === activeQueueId;

                  return (
                    <button
                      key={`${item.queueId}-${item.queueNumber}`}
                      type="button"
                      onClick={() => handleSelectQueue(item.queueId)}
                      className={`w-full rounded-xl border p-4 text-left transition-colors ${
                        isActive
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : 'border-border bg-background hover:border-primary/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{item.queueNumber}</p>
                          <p className="mt-1 text-sm font-medium text-foreground">{item.patientName}</p>
                        </div>
                        <Badge variant={isActive ? 'default' : 'outline'}>
                          {item.requestedLabService || item.serviceType}
                        </Badge>
                      </div>

                      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                        <p>{item.serviceType}</p>
                        <p>{item.labNumbers.length > 0 ? `Lab No: ${item.labNumbers.join(', ')}` : 'Lab No: N/A'}</p>
                        <p>{new Date(item.createdAt).toLocaleString()}</p>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                  No pending cashier patients right now.
                </div>
              )}
            </div>
          </Card>

          <div className="space-y-6">
            {!visitContext ? (
              <Card className="p-8 text-center shadow-sm">
                <h2 className="text-2xl font-bold">
                  {isLoading ? 'Loading billing queue...' : 'Select a patient for billing'}
                </h2>
                <p className="mt-3 text-muted-foreground">
                  {pageError || 'Choose a pending patient from the left so the invoice can be prepared.'}
                </p>
              </Card>
            ) : (
              <>
                <Card className="p-6 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">
                        Active Billing Context
                      </p>
                      <h2 className="mt-2 text-2xl font-bold">{visitContext.visit.queueNumber}</h2>
                      <p className="mt-2 text-muted-foreground">{visitContext.visit.patientName}</p>
                    </div>
                    <Badge variant="outline" className="bg-primary/10 text-primary">
                      {visitContext.visit.visitStatus}
                    </Badge>
                  </div>

                  <div className="mt-6 grid gap-3 text-sm md:grid-cols-2">
                    <p>
                      Service:{' '}
                      <span className="font-medium text-foreground">{visitContext.visit.serviceType}</span>
                    </p>
                    <p>
                      Lab Number:{' '}
                      <span className="font-medium text-foreground">
                        {visitContext.visit.labNumbers.length > 0 ? visitContext.visit.labNumbers.join(', ') : 'N/A'}
                      </span>
                    </p>
                    <p>
                      Invoice Number:{' '}
                      <span className="font-medium text-foreground">
                        {existingBilling?.invoiceNumber || 'Not generated yet'}
                      </span>
                    </p>
                    <p>
                      Lab Request:{' '}
                      <span className="font-medium text-foreground">
                        {visitContext.visit.requestedLabService || 'N/A'}
                      </span>
                    </p>
                    <p>
                      Contact:{' '}
                      <span className="font-medium text-foreground">
                        {visitContext.patient.contactNumber || 'N/A'}
                      </span>
                    </p>
                    <p>
                      Email:{' '}
                      <span className="font-medium text-foreground">
                        {visitContext.patient.emailAddress || 'N/A'}
                      </span>
                    </p>
                    <p>
                      Queue Status:{' '}
                      <span className="font-medium text-foreground">
                        {selectedQueueSummary?.visitStatus ?? visitContext.visit.visitStatus}
                      </span>
                    </p>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <Button variant="outline" onClick={handlePrintInvoice} className="gap-2">
                      <Printer className="h-4 w-4" />
                      Print Invoice / Receipt
                    </Button>
                    <Button asChild variant="outline">
                      <Link href={`/staff/patient-records?queueId=${encodeURIComponent(activeQueueId)}`}>
                        Open Patient Visit
                      </Link>
                    </Button>
                  </div>
                </Card>

                <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
                  <Card className="p-6 shadow-sm">
                    <h2 className="text-lg font-bold">Billable Services</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Select the services that should appear on the invoice for this visit.
                    </p>

                    <div className="mt-5 max-h-[52vh] space-y-3 overflow-y-auto pr-1">
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
                            <span className="font-semibold text-primary">{formatCurrency(service.amount)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </Card>

                  <div className="space-y-6">
                    <Card className="p-6 shadow-sm">
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
                      <Card className="p-6 shadow-sm">
                        <div className="flex items-center gap-3">
                          <CreditCard className="h-5 w-5 text-primary" />
                          <h2 className="text-lg font-bold">Latest Saved Billing</h2>
                        </div>
                        <div className="mt-4 grid gap-2 text-sm text-muted-foreground">
                          <p>
                            Invoice Number:{' '}
                            <span className="font-medium text-foreground">
                              {existingBilling.invoiceNumber || 'N/A'}
                            </span>
                          </p>
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
                          {existingBilling.receiptNumber && (
                            <p>
                              Receipt Number:{' '}
                              <span className="font-medium text-foreground">{existingBilling.receiptNumber}</span>
                            </p>
                          )}
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
                  </div>
                </div>
              </>
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

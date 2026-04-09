'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  DollarSign,
  Eye,
  FileBarChart2,
  FlaskConical,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageLayout } from '@/components/layout/page-layout';
import { MetricCard } from '@/components/common/metric-card';
import { StatusBadge } from '@/components/common/status-badge';
import { formatCurrency } from '@/lib/formatting';

type DashboardPayload = {
  metrics: {
    patientsToday: number;
    pendingTests: number;
    releasedResults: number;
    revenueToday: number;
  };
  patientFlow: Array<{ time: string; count: number }>;
  serviceBreakdown: Array<{ service: string; count: number }>;
  revenueTrend: Array<{ date: string; label: string; amount: number }>;
  recentPatients: Array<{
    id: string;
    patientCode: string;
    name: string;
    requestTime: string;
    status: 'pending' | 'processing' | 'released';
    queueNumber: string;
  }>;
  liveQueue: Array<{
    id: string;
    queueNumber: string;
    currentLane: string;
    serviceType: string;
  }>;
  pendingValidations: Array<{
    id: string;
    testName: string;
    patient: string;
    priority: 'urgent' | 'review';
    action: string;
  }>;
};

const emptyDashboard: DashboardPayload = {
  metrics: {
    patientsToday: 0,
    pendingTests: 0,
    releasedResults: 0,
    revenueToday: 0,
  },
  patientFlow: [],
  serviceBreakdown: [],
  revenueTrend: [],
  recentPatients: [],
  liveQueue: [],
  pendingValidations: [],
};

const serviceColors = ['#0b65b1', '#1f9d8b', '#f59e0b'];

export default function DashboardPage() {
  const [dashboard, setDashboard] = useState<DashboardPayload>(emptyDashboard);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState('');

  useEffect(() => {
    let isMounted = true;

    const loadDashboard = async () => {
      try {
        const response = await fetch('/api/staff/dashboard', {
          cache: 'no-store',
        });
        const payload = (await response.json()) as DashboardPayload & { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? 'Unable to load dashboard analytics.');
        }

        if (!isMounted) {
          return;
        }

        setDashboard(payload);
        setPageError('');
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setDashboard(emptyDashboard);
        setPageError(
          error instanceof Error ? error.message : 'Unable to load dashboard analytics.'
        );
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadDashboard();
    const poll = window.setInterval(() => {
      void loadDashboard();
    }, 15000);

    return () => {
      isMounted = false;
      window.clearInterval(poll);
    };
  }, []);

  return (
    <PageLayout>
      <div className="px-8 py-8">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <p className="mt-1 text-muted-foreground">
              Live clinic analytics from the database, including queue, billing, and result activity.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline" className="gap-2">
              <Link href="/staff/patient-registration">
                <UserPlus className="h-4 w-4" />
                Register Patient
              </Link>
            </Button>
            <Button asChild className="gap-2">
              <Link href="/staff/queue">
                <FlaskConical className="h-4 w-4" />
                Open Queue
              </Link>
            </Button>
          </div>
        </div>

        {pageError && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {pageError}
          </div>
        )}

        <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="PATIENTS TODAY"
            value={dashboard.metrics.patientsToday}
            icon={<Users className="h-5 w-5 text-primary" />}
          />
          <MetricCard
            label="PENDING TESTS"
            value={dashboard.metrics.pendingTests}
            critical={dashboard.metrics.pendingTests > 0}
            icon={<AlertTriangle className="h-5 w-5 text-destructive" />}
          />
          <MetricCard
            label="RELEASED RESULTS"
            value={dashboard.metrics.releasedResults}
            icon={<CheckCircle2 className="h-5 w-5 text-accent" />}
          />
          <MetricCard
            label="REVENUE TODAY"
            value={formatCurrency(dashboard.metrics.revenueToday)}
            icon={<DollarSign className="h-5 w-5 text-primary" />}
          />
        </div>

        <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Link href="/staff/patient-registration">
            <Card className="p-5 shadow-sm transition-shadow hover:shadow-md">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-3 text-primary">
                  <UserPlus className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Front Desk</p>
                  <p className="text-sm font-semibold">Patient Registration</p>
                </div>
              </div>
            </Card>
          </Link>

          <Link href="/staff/queue">
            <Card className="p-5 shadow-sm transition-shadow hover:shadow-md">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-accent/10 p-3 text-accent">
                  <FlaskConical className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Operations</p>
                  <p className="text-sm font-semibold">Queue Management</p>
                </div>
              </div>
            </Card>
          </Link>

          <Link href="/staff/cashier">
            <Card className="p-5 shadow-sm transition-shadow hover:shadow-md">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-100 p-3 text-blue-700">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Billing</p>
                  <p className="text-sm font-semibold">Cashier / Front Desk</p>
                </div>
              </div>
            </Card>
          </Link>

          <Link href="/staff/result-release">
            <Card className="p-5 shadow-sm transition-shadow hover:shadow-md">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-purple-100 p-3 text-purple-700">
                  <FileBarChart2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Results</p>
                  <p className="text-sm font-semibold">Release Workspace</p>
                </div>
              </div>
            </Card>
          </Link>
        </div>

        <div className="grid gap-8 xl:grid-cols-3">
          <div className="space-y-8 xl:col-span-2">
            <div className="grid gap-8 lg:grid-cols-2">
              <Card className="p-6 shadow-sm">
                <div className="mb-5">
                  <h2 className="text-lg font-bold">Patient Flow Today</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Two-hour intake pattern across the current clinic day.
                  </p>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={dashboard.patientFlow}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="time" stroke="#64748b" />
                    <YAxis stroke="#64748b" allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#fff',
                        border: '1px solid #e2e8f0',
                        borderRadius: 12,
                      }}
                    />
                    <Bar dataKey="count" fill="#0b65b1" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              <Card className="p-6 shadow-sm">
                <div className="mb-5">
                  <h2 className="text-lg font-bold">Service Mix Today</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Distribution of today&apos;s visits by service type.
                  </p>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={dashboard.serviceBreakdown}
                      dataKey="count"
                      nameKey="service"
                      innerRadius={50}
                      outerRadius={82}
                      paddingAngle={3}
                    >
                      {dashboard.serviceBreakdown.map((entry, index) => (
                        <Cell
                          key={`${entry.service}-${index}`}
                          fill={serviceColors[index % serviceColors.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#fff',
                        border: '1px solid #e2e8f0',
                        borderRadius: 12,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-4 flex flex-wrap gap-4">
                  {dashboard.serviceBreakdown.map((entry, index) => (
                    <div key={`${entry.service}-${index}`} className="flex items-center gap-2 text-sm">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: serviceColors[index % serviceColors.length] }}
                      />
                      <span className="text-muted-foreground">
                        {entry.service}: <span className="font-semibold text-foreground">{entry.count}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <Card className="p-6 shadow-sm">
              <div className="mb-5">
                <h2 className="text-lg font-bold">Revenue Trend</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Last 7 days of recorded payments from the database.
                </p>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={dashboard.revenueTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" stroke="#64748b" />
                  <YAxis
                    stroke="#64748b"
                    tickFormatter={(value) => `₱${Number(value).toLocaleString('en-PH')}`}
                  />
                  <Tooltip
                    formatter={(value) => formatCurrency(Number(value))}
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #e2e8f0',
                      borderRadius: 12,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="amount"
                    stroke="#0b65b1"
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#0b65b1' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-6 shadow-sm">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold">Recent Patients</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Latest visit activity recorded in the database.
                  </p>
                </div>
                <Button asChild variant="ghost" size="sm" className="text-primary">
                  <Link href="/staff/patient-records">View all</Link>
                </Button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="py-3 text-left font-semibold text-muted-foreground">PATIENT</th>
                      <th className="py-3 text-left font-semibold text-muted-foreground">QUEUE</th>
                      <th className="py-3 text-left font-semibold text-muted-foreground">TIME</th>
                      <th className="py-3 text-left font-semibold text-muted-foreground">STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.recentPatients.length > 0 ? (
                      dashboard.recentPatients.map((patient, index) => (
                        <tr
                          key={`${patient.id}-${patient.queueNumber}-${index}`}
                          className="border-b border-border hover:bg-muted/40"
                        >
                          <td className="py-4">
                            <div>
                              <p className="font-medium">{patient.name}</p>
                              <p className="text-xs text-muted-foreground">ID: {patient.patientCode}</p>
                            </div>
                          </td>
                          <td className="py-4 font-medium">{patient.queueNumber}</td>
                          <td className="py-4 text-muted-foreground">{patient.requestTime}</td>
                          <td className="py-4">
                            <StatusBadge status={patient.status} />
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-muted-foreground">
                          {isLoading
                            ? 'Loading recent patients...'
                            : 'No recent patient activity yet.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <div className="space-y-8">
            <Card className="p-6 shadow-sm">
              <div className="mb-6 flex items-center gap-2">
                <h2 className="text-lg font-bold">Live Queue</h2>
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-destructive" />
                <span className="text-xs font-bold text-destructive">LIVE</span>
              </div>

              <div className="space-y-3">
                {dashboard.liveQueue.length > 0 ? (
                  dashboard.liveQueue.map((item, index) => (
                    <div
                      key={`${item.id}-${item.queueNumber}-${index}`}
                      className="flex items-center gap-4 rounded-xl bg-muted/40 p-3"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold">{item.queueNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.currentLane} | {item.serviceType}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                    {isLoading ? 'Loading live queue...' : 'No active queue yet.'}
                  </div>
                )}
              </div>

              <Button asChild variant="outline" className="mt-4 w-full">
                <Link href="/staff/queue">Manage Full Queue</Link>
              </Button>
            </Card>

            <Card className="p-6 shadow-sm">
              <h2 className="mb-6 text-lg font-bold">Pending Validations</h2>
              <div className="space-y-3">
                {dashboard.pendingValidations.length > 0 ? (
                  dashboard.pendingValidations.map((item, index) => (
                    <div
                      key={`${item.id}-${index}`}
                      className={`rounded-lg border-l-4 p-4 ${
                        item.priority === 'urgent'
                          ? 'border-orange-300 bg-orange-50'
                          : 'border-amber-300 bg-amber-50'
                      }`}
                    >
                      <div className="mb-2 flex items-start justify-between">
                        <p
                          className={`text-sm font-semibold ${
                            item.priority === 'urgent' ? 'text-orange-700' : 'text-amber-700'
                          }`}
                        >
                          {item.testName}
                        </p>
                        <span
                          className={`rounded px-2 py-1 text-xs font-bold ${
                            item.priority === 'urgent'
                              ? 'bg-orange-100 text-orange-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {item.priority.toUpperCase()}
                        </span>
                      </div>
                      <p className="mb-3 text-xs text-muted-foreground">Patient: {item.patient}</p>
                      <Button asChild size="sm" className="w-full">
                        <Link href="/staff/result-release">{item.action}</Link>
                      </Button>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                    {isLoading ? 'Loading validations...' : 'No pending validations right now.'}
                  </div>
                )}
              </div>
            </Card>

            <Card className="rounded-lg bg-gradient-to-br from-primary to-blue-700 p-6 text-primary-foreground shadow-sm">
              <p className="mb-2 text-xs font-bold opacity-80">CLINIC SNAPSHOT</p>
              <h3 className="mb-4 text-2xl font-bold">Today at a Glance</h3>
              <div className="space-y-3">
                <div>
                  <p className="text-3xl font-bold">{dashboard.metrics.patientsToday}</p>
                  <p className="text-sm opacity-90">visits recorded today</p>
                </div>
                <div>
                  <p className="text-sm opacity-90">
                    Released results: <strong>{dashboard.metrics.releasedResults}</strong>
                  </p>
                </div>
                <div>
                  <p className="text-sm opacity-90">
                    Revenue today: <strong>{formatCurrency(dashboard.metrics.revenueToday)}</strong>
                  </p>
                </div>
              </div>
              <Button asChild variant="outline" className="mt-6 w-full bg-primary-foreground text-primary hover:bg-primary-foreground/90">
                <Link href="/staff/patient-records">
                  <Eye className="mr-2 h-4 w-4" />
                  View Patient Records
                </Link>
              </Button>
            </Card>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

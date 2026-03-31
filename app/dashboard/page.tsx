'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Users, AlertTriangle, CheckCircle2, DollarSign, Eye } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageLayout } from '@/components/layout/page-layout';
import { MetricCard } from '@/components/common/metric-card';
import { StatusBadge } from '@/components/common/status-badge';
import { 
  mockDashboardMetrics, 
  mockRecentPatients, 
  mockPendingValidations 
} from '@/lib/mock-data';
import { formatCurrency, formatTime } from '@/lib/formatting';
import type { QueueEntry } from '@/lib/queue-store';
import { fetchQueueEntries } from '@/lib/queue-api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const patientFlowData = [
  { time: '08:00', count: 12 },
  { time: '10:00', count: 28 },
  { time: '12:00', count: 35 },
  { time: '14:00', count: 22 },
  { time: '16:00', count: 38 },
  { time: '18:00', count: 32 },
  { time: '20:00', count: 18 },
];

export default function DashboardPage() {
  const [queue, setQueue] = useState<QueueEntry[]>([]);

  useEffect(() => {
    let isMounted = true;

    const syncQueue = async () => {
      try {
        const nextQueue = await fetchQueueEntries();
        if (isMounted) {
          setQueue(nextQueue);
        }
      } catch {
        if (isMounted) {
          setQueue([]);
        }
      }
    };

    void syncQueue();
    const poll = window.setInterval(() => {
      void syncQueue();
    }, 5000);

    return () => {
      isMounted = false;
      window.clearInterval(poll);
    };
  }, []);

  const liveQueue = useMemo(
    () =>
      queue
        .filter((item) => item.status !== 'completed')
        .slice(0, 3),
    [queue]
  );

  return (
    <PageLayout>
      <div className="px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground mt-1">Welcome back, Dr. Richardson</p>
          </div>
          <Button className="h-11 px-6">+ New Lab Order</Button>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <MetricCard
            label="PATIENTS TODAY"
            value={mockDashboardMetrics.patientsToday.value}
            change={mockDashboardMetrics.patientsToday.change}
            icon={<Users className="w-5 h-5 text-primary" />}
          />
          <MetricCard
            label="PENDING TESTS"
            value={mockDashboardMetrics.pendingTests.value}
            critical={mockDashboardMetrics.pendingTests.critical}
            icon={<AlertTriangle className="w-5 h-5 text-destructive" />}
          />
          <MetricCard
            label="RELEASED RESULTS"
            value={mockDashboardMetrics.releasedResults.value}
            change={mockDashboardMetrics.releasedResults.change}
            icon={<CheckCircle2 className="w-5 h-5 text-accent" />}
          />
          <MetricCard
            label="REVENUE TODAY"
            value={formatCurrency(mockDashboardMetrics.revenueToday.value)}
            change={mockDashboardMetrics.revenueToday.change}
            icon={<DollarSign className="w-5 h-5 text-primary" />}
          />
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <Card className="p-4 hover:shadow-lg transition-shadow cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Register Patient</p>
                <p className="text-sm font-semibold">New walk-in profile</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 hover:shadow-lg transition-shadow cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-accent" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                </svg>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">New Transaction</p>
                <p className="text-sm font-semibold">Create billing entry</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 hover:shadow-lg transition-shadow cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 12h-2v-2h-2v2h-2v2h2v2h2v-2h2v-2z" />
                </svg>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Scan QR</p>
                <p className="text-sm font-semibold">Verify lab request</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 hover:shadow-lg transition-shadow cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-purple-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z" />
                </svg>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">View Statistics</p>
                <p className="text-sm font-semibold">Performance report</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-3 gap-8">
          {/* Left Column */}
          <div className="col-span-2 space-y-8">
            {/* Recent Patients */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold">Recent Patients</h2>
                <Button variant="ghost" size="sm" className="text-primary">
                  View all
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 font-semibold text-muted-foreground">PATIENT NAME</th>
                      <th className="text-left py-3 font-semibold text-muted-foreground">REQUEST TIME</th>
                      <th className="text-left py-3 font-semibold text-muted-foreground">STATUS</th>
                      <th className="text-left py-3 font-semibold text-muted-foreground">ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mockRecentPatients.map((patient, idx) => (
                      <tr key={idx} className="border-b border-border hover:bg-muted/50">
                        <td className="py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-xs font-bold">
                              {patient.initials}
                            </div>
                            <div>
                              <p className="font-medium">{patient.name}</p>
                              <p className="text-xs text-muted-foreground">ID: {patient.id}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 text-muted-foreground">{patient.requestTime}</td>
                        <td className="py-4">
                          <StatusBadge status={patient.status} />
                        </td>
                        <td className="py-4">
                          <button className="text-primary hover:underline">
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Patient Flow Chart */}
            <Card className="p-6">
              <h2 className="text-lg font-bold mb-6">Patient Flow</h2>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={patientFlowData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="time" stroke="#888" />
                  <YAxis stroke="#888" />
                  <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e0e0e0' }} />
                  <Bar dataKey="count" fill="#2563eb" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* Right Column */}
          <div className="space-y-8">
            {/* Live Queue */}
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-6">
                <h2 className="text-lg font-bold">Live Queue</h2>
                <span className="inline-block w-2 h-2 bg-destructive rounded-full animate-pulse"></span>
                <span className="text-xs font-bold text-destructive">LIVE</span>
              </div>
              <div className="space-y-3">
                {liveQueue.length > 0 ? (
                  liveQueue.map((item, idx) => (
                    <div key={item.id} className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
                      <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-bold">
                        {idx + 1}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold">{item.queueNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.currentLane} • {item.serviceType}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                    No active queue yet.
                  </div>
                )}
              </div>
              <Button asChild variant="outline" className="w-full mt-4">
                <Link href="/staff/queue">
                Manage Full Queue
                </Link>
              </Button>
            </Card>

            {/* Pending Validations */}
            <Card className="p-6">
              <h2 className="text-lg font-bold mb-6">Pending Validations</h2>
              <div className="space-y-3">
                {mockPendingValidations.map((item, idx) => (
                  <div key={idx} className={`p-4 rounded-lg border-l-4 ${item.priority === 'urgent' ? 'bg-red-50 border-red-300' : 'bg-amber-50 border-amber-300'}`}>
                    <div className="flex items-start justify-between mb-2">
                      <p className={`text-sm font-semibold ${item.priority === 'urgent' ? 'text-red-700' : 'text-amber-700'}`}>
                        {item.testName}
                      </p>
                      <span className={`text-xs font-bold px-2 py-1 rounded ${item.priority === 'urgent' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                        {item.priority.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">Patient: {item.patient}</p>
                    <Button size="sm" className="w-full">
                      {item.action}
                    </Button>
                  </div>
                ))}
              </div>
            </Card>

            {/* Performance */}
            <Card className="bg-gradient-to-br from-primary to-blue-700 text-primary-foreground p-6 rounded-lg">
              <p className="text-xs font-bold opacity-80 mb-2">MY PERFORMANCE</p>
              <h3 className="text-2xl font-bold mb-4">You&apos;re in the Top 5%</h3>
              <div className="space-y-3 mb-6">
                <div>
                  <p className="text-3xl font-bold">42</p>
                  <p className="text-sm opacity-90">results released</p>
                </div>
                <div>
                  <p className="text-sm opacity-90">Today&apos;s clinical accuracy: <strong>99.8%</strong></p>
                </div>
              </div>
              <Button variant="outline" className="w-full bg-primary-foreground text-primary hover:bg-primary-foreground/90">
                View Statistics
              </Button>
            </Card>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

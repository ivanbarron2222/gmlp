'use client';

import { useState } from 'react';
import { AlertTriangle, Barcode, BarChart3 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageLayout } from '@/components/layout/page-layout';
import { StatusBadge } from '@/components/common/status-badge';
import { mockSpecimens } from '@/lib/mock-data';
import { formatTime } from '@/lib/formatting';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const tatData = [
  { time: '08:00', tat: 180 },
  { time: '10:00', tat: 165 },
  { time: '12:00', tat: 155 },
  { time: '14:00', tat: 142 },
  { time: '16:00', tat: 138 },
  { time: '18:00', tat: 145 },
  { time: '20:00', tat: 160 },
];

export default function SpecimenTrackingPage() {
  const [barcodeInput, setBarcodeInput] = useState('');
  const [autoMode, setAutoMode] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const paginatedSpecimens = mockSpecimens.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const totalPages = Math.ceil(mockSpecimens.length / itemsPerPage);

  const pendingCount = mockSpecimens.filter((s) => s.status === 'pending').length;
  const processingCount = mockSpecimens.filter((s) => s.status === 'processing').length;

  return (
    <PageLayout>
      <div className="px-8 py-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Specimen Tracking</h1>
          <p className="text-muted-foreground mt-2">
            Real-time lifecycle monitoring of clinical samples from collection to analysis.
          </p>
        </div>

        {/* KPIs */}
        <div className="mt-8 grid grid-cols-3 gap-4">
          <Card className="p-4 border-l-4 border-orange-400">
            <p className="text-xs font-semibold text-muted-foreground mb-1">PENDING</p>
            <p className="text-3xl font-bold text-orange-600">{pendingCount}</p>
          </Card>
          <Card className="p-4 border-l-4 border-blue-400">
            <p className="text-xs font-semibold text-muted-foreground mb-1">PROCESSING</p>
            <p className="text-3xl font-bold text-blue-600">{processingCount}</p>
          </Card>
          <Card className="p-4 border-l-4 border-green-400">
            <p className="text-xs font-semibold text-muted-foreground mb-1">COMPLETED</p>
            <p className="text-3xl font-bold text-green-600">
              {mockSpecimens.filter((s) => s.status === 'done').length}
            </p>
          </Card>
        </div>

        {/* Barcode Input */}
        <Card className="mt-8 p-6">
          <div className="flex gap-4 items-end mb-4">
            <div className="flex-1">
              <label className="text-sm font-semibold text-muted-foreground mb-2 block">
                SCAN BARCODE / ENTER SPECIMEN ID
              </label>
              <Input
                placeholder="Scanning active..."
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                className="h-12"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline">Manual Entry</Button>
              <Button className="px-6">Track Now</Button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={autoMode}
                onChange={(e) => setAutoMode(e.target.checked)}
                className="w-4 h-4 rounded border-border"
              />
              AUTO-MODE
            </label>
          </div>
        </Card>

        {/* Specimens Table */}
        <Card className="mt-8 p-6">
          <h2 className="text-lg font-bold mb-6">Active Specimens (22 of 22)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 font-semibold text-muted-foreground">ID</th>
                  <th className="text-left py-3 font-semibold text-muted-foreground">PATIENT NAME</th>
                  <th className="text-left py-3 font-semibold text-muted-foreground">TEST TYPE</th>
                  <th className="text-left py-3 font-semibold text-muted-foreground">SPECIMEN</th>
                  <th className="text-left py-3 font-semibold text-muted-foreground">STATUS</th>
                  <th className="text-left py-3 font-semibold text-muted-foreground">TIMESTAMP</th>
                </tr>
              </thead>
              <tbody>
                {paginatedSpecimens.map((specimen, idx) => (
                  <tr key={idx} className="border-b border-border hover:bg-muted/50">
                    <td className="py-4 font-bold">{specimen.id}</td>
                    <td className="py-4">
                      <p className="font-medium">{specimen.patientName}</p>
                      <p className="text-xs text-muted-foreground">
                        DOB: 12 May 1964
                      </p>
                    </td>
                    <td className="py-4">{specimen.testType}</td>
                    <td className="py-4 flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${
                        specimen.specimenType === 'Whole Blood' ? 'bg-red-500' :
                        specimen.specimenType === 'Serum' ? 'bg-yellow-500' : 'bg-blue-500'
                      }`}></span>
                      {specimen.specimenType}
                    </td>
                    <td className="py-4">
                      <StatusBadge status={specimen.status} />
                    </td>
                    <td className="py-4 text-muted-foreground">
                      {formatTime(specimen.collectedAt)}
                      <p className="text-xs">TODAY</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-6 pt-6 border-t border-border">
            <p className="text-sm text-muted-foreground">
              SHOWING {paginatedSpecimens.length} OF {mockSpecimens.length} ACTIVE SPECIMENS
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
              >
                ←
              </Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <Button
                  key={page}
                  variant={currentPage === page ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </Button>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
              >
                →
              </Button>
            </div>
          </div>
        </Card>

        {/* TAT Trend & Critical Alerts */}
        <div className="mt-8 grid grid-cols-3 gap-8">
          {/* Chart */}
          <div className="col-span-2">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Turnaround Time (TAT) Trend
                </h2>
                <span className="inline-block text-xs font-bold px-2 py-1 bg-accent/20 text-accent rounded">
                  WITHIN BENCHMARKS
                </span>
              </div>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={tatData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="time" stroke="#888" />
                  <YAxis stroke="#888" />
                  <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e0e0e0' }} />
                  <Bar dataKey="tat" fill="#2563eb" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* Critical Alerts */}
          <Card className="p-6 border-l-4 border-destructive">
            <div className="flex items-center gap-2 mb-6">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              <h2 className="text-lg font-bold">Critical Action Required</h2>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-red-900 mb-2">#SP-8991 Flagged</p>
              <p className="text-xs text-red-800 mb-4">
                Hemolysis detected in specimen. Re-collection requested for Patient: David Chen.
              </p>
              <Button className="w-full bg-destructive hover:bg-destructive/90">
                Review Flags
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </PageLayout>
  );
}

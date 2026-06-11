'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Search } from 'lucide-react';
import { PageLayout } from '@/components/layout/page-layout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>>;
};

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorConstructor;
  }
}

async function getAccessToken() {
  const supabase = getSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase!.auth.getSession();
  if (!session?.access_token) throw new Error('Missing authenticated session.');
  return session.access_token;
}

export default function QrScannerPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [manualValue, setManualValue] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [pageError, setPageError] = useState('');

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setIsScanning(false);
  };

  const resolveQrValue = async (value: string) => {
    try {
      setPageError('');
      const token = await getAccessToken();
      const response = await fetch('/api/staff/qr-resolve', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ value }),
      });
      const payload = (await response.json()) as { patientId?: string; visitId?: string; error?: string };
      if (!response.ok || !payload.patientId) {
        throw new Error(payload.error ?? 'Unable to resolve QR code.');
      }
      stopCamera();
      router.push(`/staff/patients/${encodeURIComponent(payload.patientId)}${payload.visitId ? `?visitId=${encodeURIComponent(payload.visitId)}` : ''}`);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Unable to resolve QR code.');
    }
  };

  const startCamera = async () => {
    try {
      setPageError('');
      if (!window.BarcodeDetector) {
        throw new Error('This browser does not support camera QR scanning. Use the manual input fallback.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      setIsScanning(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Unable to start QR scanner.');
      stopCamera();
    }
  };

  useEffect(() => {
    if (!isScanning || !window.BarcodeDetector) return;
    let cancelled = false;
    const detector = new window.BarcodeDetector({ formats: ['qr_code'] });

    const tick = async () => {
      if (cancelled || !videoRef.current) return;
      try {
        const results = await detector.detect(videoRef.current);
        const rawValue = results[0]?.rawValue;
        if (rawValue) {
          await resolveQrValue(rawValue);
          return;
        }
      } catch {
        // Keep scanning; some frames are unreadable.
      }
      window.setTimeout(tick, 400);
    };

    void tick();
    return () => {
      cancelled = true;
    };
  }, [isScanning]);

  useEffect(() => () => stopCamera(), []);

  return (
    <PageLayout>
      <div className="px-8 py-8">
        {pageError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {pageError}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
          <Card className="p-6">
            <div className="aspect-video overflow-hidden rounded-2xl border bg-black">
              <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button type="button" onClick={() => void startCamera()} disabled={isScanning}>
                <Camera className="h-4 w-4" />
                Start Camera
              </Button>
              <Button type="button" variant="outline" onClick={stopCamera} disabled={!isScanning}>
                Stop Camera
              </Button>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-xl font-bold">Manual QR Input</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Use this if the laptop browser does not support QR camera scanning.
            </p>
            <div className="mt-5 space-y-3">
              <Input
                value={manualValue}
                onChange={(event) => setManualValue(event.target.value)}
                placeholder="Paste QR content or queue ID"
              />
              <Button type="button" className="w-full" onClick={() => void resolveQrValue(manualValue)} disabled={!manualValue.trim()}>
                <Search className="h-4 w-4" />
                Open Patient Profile
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </PageLayout>
  );
}

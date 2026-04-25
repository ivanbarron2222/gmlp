import Image from 'next/image';
import Link from 'next/link';
import { ClipboardList, SearchCheck, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function RootPage() {
  return (
    <main className="min-h-screen bg-background">
      <section className="border-b border-border bg-gradient-to-br from-primary/10 via-background to-accent/10">
        <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
          <header className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Image
                src="/gmlp_logo.png"
                alt="Globalife Medical Laboratory & Polyclinic logo"
                width={48}
                height={48}
                className="h-12 w-12 object-contain"
                priority
              />
              <div>
                <p className="text-sm font-bold leading-tight sm:text-base">
                  Globalife Medical Laboratory &amp; Polyclinic
                </p>
                <p className="text-xs text-muted-foreground">Patient Portal</p>
              </div>
            </div>

            <Button asChild variant="outline" className="h-10">
              <Link href="/login">Staff Sign In</Link>
            </Button>
          </header>

          <div className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-primary">
                Same-day clinic access
              </p>
              <h1 className="mt-4 max-w-3xl text-4xl font-black tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                Start your visit or check your queue and result status.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                Register before going to the front desk, then return here during the day to
                check pending visits and released laboratory results.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="h-12 px-6 text-base">
                  <Link href="/register">
                    <ClipboardList className="h-5 w-5" />
                    Patient Registration
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-12 px-6 text-base">
                  <Link href="/visit-check">
                    <SearchCheck className="h-5 w-5" />
                    Check Visit / Results
                  </Link>
                </Button>
              </div>
            </div>

            <div className="grid gap-4">
              <Card className="p-5">
                <div className="flex items-start gap-4">
                  <div className="rounded-md bg-primary/10 p-3 text-primary">
                    <ClipboardList className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">Register Patient</h2>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      Submit patient details and service needs before reception verification.
                    </p>
                  </div>
                </div>
              </Card>

              <Card className="p-5">
                <div className="flex items-start gap-4">
                  <div className="rounded-md bg-accent/15 p-3 text-accent">
                    <SearchCheck className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">Check Today&apos;s Status</h2>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      Use your name, birth date, and email to view same-day visit updates.
                    </p>
                  </div>
                </div>
              </Card>

              <div className="flex items-center gap-3 rounded-md border border-border bg-background/70 p-4 text-sm text-muted-foreground">
                <ShieldCheck className="h-5 w-5 flex-shrink-0 text-primary" />
                <p>Patient verification is required before queue or result details are shown.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ArrowRight,
  CalendarCheck2,
  ClipboardList,
  FileCheck2,
  Globe2,
  HeartPulse,
  Microscope,
  SearchCheck,
  Share2,
  ShieldCheck,
  Stethoscope,
  Users2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const services = [
  {
    label: 'Clinical Examination',
    description: 'Physical assessment and diagnostic review conducted by clinic staff.',
    icon: Stethoscope,
  },
  {
    label: 'Laboratory Testing',
    description: 'Structured encoding for blood, urine, and related laboratory results.',
    icon: Microscope,
  },
  {
    label: 'Medical Classification',
    description: 'Clear patient classification for employment and medical screening needs.',
    icon: FileCheck2,
  },
  {
    label: 'Patient Queue Support',
    description: 'Organized flow for OPD walk-ins and APE medical mission patients.',
    icon: CalendarCheck2,
  },
];

const standards = [
  {
    title: 'Certified Specialized Care',
    description: 'A controlled workflow helps staff keep records, queues, and released results consistent.',
    icon: ShieldCheck,
  },
  {
    title: 'Rapid Results Integration',
    description: 'Patient data moves from registration to encoding and result release in one portal.',
    icon: HeartPulse,
  },
  {
    title: 'Patient-Centric Approach',
    description: 'Patients can register and check visit status without crowding the front desk.',
    icon: Users2,
  },
];

const navItems = [
  { id: 'home', label: 'Home' },
  { id: 'services', label: 'Services' },
  { id: 'standards', label: 'Clinics' },
  { id: 'about', label: 'About Us' },
];

export default function RootPage() {
  const [activeSection, setActiveSection] = useState('home');

  useEffect(() => {
    const sections = navItems
      .map((item) => document.getElementById(item.id))
      .filter((section): section is HTMLElement => Boolean(section));

    const updateActiveSection = () => {
      const scrollPosition = window.scrollY + 140;
      const currentSection = sections
        .filter((section) => section.offsetTop <= scrollPosition)
        .at(-1);

      setActiveSection(currentSection?.id ?? 'home');
    };

    updateActiveSection();
    window.addEventListener('scroll', updateActiveSection, { passive: true });
    window.addEventListener('resize', updateActiveSection);

    return () => {
      window.removeEventListener('scroll', updateActiveSection);
      window.removeEventListener('resize', updateActiveSection);
    };
  }, []);

  return (
    <main className="min-h-screen bg-[#f7f9fb] text-[#001736]">
      <header className="sticky top-0 z-30 border-b border-[#d8dadc] bg-white/95 shadow-[0_8px_30px_rgba(0,23,54,0.06)] backdrop-blur">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-12">
          <Link
            href="/"
            className="flex items-center gap-3 text-lg font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#115cb9] focus-visible:ring-offset-2"
          >
            <Image
              src="/gmlp_logo.png"
              alt="Globalife Medical Laboratory and Polyclinic logo"
              width={44}
              height={44}
              className="h-11 w-11 object-contain"
              priority
            />
            <span>Globalife Clinic</span>
          </Link>

          <nav aria-label="Main navigation" className="hidden items-center gap-10 text-sm font-semibold text-[#191c1e] md:flex">
            {navItems.map((item) => {
              const isActive = activeSection === item.id;

              return (
                <a
                  key={item.id}
                  className={
                    isActive
                      ? 'border-b-2 border-[#115cb9] pb-1 text-[#115cb9]'
                      : 'pb-1 transition hover:text-[#115cb9]'
                  }
                  href={`#${item.id}`}
                  onClick={(event) => {
                    event.preventDefault();
                    setActiveSection(item.id);
                    document.getElementById(item.id)?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'start',
                    });
                  }}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>

          <Button asChild className="min-h-11 rounded bg-[#001736] px-5 text-white hover:bg-[#002b5c]">
            <Link href="/login">Staff Sign In</Link>
          </Button>
        </div>
      </header>

      <section id="home" className="relative isolate min-h-[680px] scroll-mt-20 overflow-hidden bg-white">
        <Image
          src="/landing_image.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="absolute inset-0 -z-20 object-cover object-center"
        />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(255,255,255,0.98)_0%,rgba(255,255,255,0.9)_34%,rgba(255,255,255,0.58)_62%,rgba(255,255,255,0.2)_100%)]" />
        <div className="absolute inset-0 -z-10 bg-white/20" />

        <div className="relative mx-auto grid min-h-[680px] max-w-7xl items-center px-5 py-16 sm:px-8 lg:grid-cols-[0.88fr_1.12fr] lg:px-12">
          <div className="max-w-xl">
            <h1 className="text-5xl font-bold leading-[1.05] tracking-[-0.04em] text-[#001736] sm:text-6xl lg:text-7xl">
              Trusted Precision
              <span className="block text-[#115cb9]">in Healthcare</span>
            </h1>

            <p className="mt-6 max-w-lg text-base leading-8 text-[#43474f] sm:text-lg">
              Patient registration, queue tracking, and released result checking for Globalife clinic operations.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="min-h-12 rounded bg-[#001736] px-7 text-white hover:bg-[#002b5c]">
                <Link href="/register">
                  Patient Registration
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="min-h-12 rounded border-[#115cb9] bg-white px-7 text-[#115cb9] hover:bg-[#f2f4f6] hover:text-[#001736]"
              >
                <Link href="/visit-check">
                  <SearchCheck className="h-4 w-4" />
                  Check Visit/Result
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section id="services" className="scroll-mt-20 bg-[#f7f9fb] py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-12">
          <div className="flex items-end justify-between gap-6">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.02em] text-[#001736] sm:text-3xl">
                Our Specialized Services
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-[#43474f]">
                Core clinic workflows supported by a focused patient portal and diagnostic record system.
              </p>
            </div>
            <div className="hidden gap-3 sm:flex" aria-hidden="true">
              <button className="flex h-11 w-11 items-center justify-center rounded-lg border border-[#c4c6d0] bg-white text-[#115cb9]">
                ‹
              </button>
              <button className="flex h-11 w-11 items-center justify-center rounded-lg border border-[#c4c6d0] bg-white text-[#115cb9]">
                ›
              </button>
            </div>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {services.map((service) => {
              const Icon = service.icon;
              return (
                <article
                  key={service.label}
                  className="min-h-64 rounded-lg border border-[#d8dadc] bg-white p-8 shadow-[0_18px_45px_rgba(0,23,54,0.06)]"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-md bg-[#d6e3ff] text-[#001736]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-8 text-xl font-semibold leading-7 tracking-[-0.02em] text-[#001736]">
                    {service.label}
                  </h3>
                  <p className="mt-4 text-sm leading-6 text-[#43474f]">{service.description}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="standards" className="scroll-mt-20 bg-white py-20 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-14 px-5 sm:px-8 lg:grid-cols-[0.95fr_1.05fr] lg:px-12">
          <div className="rounded-xl bg-[#0b7884] p-8 shadow-[0_24px_70px_rgba(0,23,54,0.14)]">
            <div className="overflow-hidden rounded-lg border border-white/20 bg-[#d6e3ff] p-6">
              <div className="rounded-md bg-white/80 p-5 shadow-[0_18px_45px_rgba(0,23,54,0.15)]">
                <div className="flex items-center gap-3 border-b border-[#d8dadc] pb-4">
                  <Image
                    src="/gmlp_logo.png"
                    alt=""
                    width={46}
                    height={46}
                    className="h-11 w-11 object-contain"
                  />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#115cb9]">Globalife Clinic</p>
                    <p className="text-lg font-semibold text-[#001736]">Digital patient portal</p>
                  </div>
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  {['Registration', 'Queue', 'Results'].map((label) => (
                    <div key={label} className="rounded bg-[#f7f9fb] p-4">
                      <div className="h-2 w-12 rounded-full bg-[#115cb9]" />
                      <p className="mt-5 text-sm font-semibold text-[#001736]">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="mx-auto -mt-5 grid max-w-md grid-cols-2 rounded-lg bg-white p-6 shadow-[0_18px_45px_rgba(0,23,54,0.12)]">
              <div>
                <p className="text-2xl font-bold text-[#001736]">OPD</p>
                <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-[#43474f]">Walk-ins</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-[#001736]">APE</p>
                <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-[#43474f]">Missions</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-center">
            <h2 className="max-w-xl text-4xl font-bold leading-tight tracking-[-0.04em] text-[#001736] sm:text-5xl">
              Defining the Standards of Clinical Excellence
            </h2>

            <div className="mt-10 space-y-8">
              {standards.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="grid grid-cols-[48px_1fr] gap-5">
                    <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[#d6e3ff] text-[#115cb9]">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-[#001736]">{item.title}</h3>
                      <p className="mt-2 max-w-xl text-sm leading-6 text-[#43474f]">{item.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section id="about" className="scroll-mt-20 bg-[#001736] px-5 py-20 text-white sm:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-4xl font-bold tracking-[-0.04em] sm:text-5xl">
            Ready for your next health check?
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-[#d7e2ff]">
            Start patient registration online and proceed to the clinic for verification and queue assignment.
          </p>
          <div className="mt-8">
            <Button asChild size="lg" className="min-h-12 rounded bg-[#115cb9] px-8 text-white hover:bg-[#659dfe] hover:text-[#001736]">
              <Link href="/register">
                <ClipboardList className="h-4 w-4" />
                Start Registration
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="bg-white py-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:px-12">
          <div>
            <p className="text-lg font-semibold tracking-tight text-[#001736]">Globalife Clinic</p>
            <p className="mt-2 text-sm text-[#43474f]">© 2026 Globalife Clinic. Trusted precision in healthcare.</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4 text-sm font-semibold text-[#191c1e]">
            <Link className="hover:text-[#115cb9]" href="/visit-check">
              Privacy Policy
            </Link>
            <Link className="hover:text-[#115cb9]" href="/visit-check">
              Terms of Service
            </Link>
            <Link className="hover:text-[#115cb9]" href="/login">
              Contact Us
            </Link>
            <Link className="hover:text-[#115cb9]" href="/">
              Globalife Network
            </Link>
            <div className="flex gap-3">
              <button aria-label="Share" className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#c4c6d0] text-[#001736]">
                <Share2 className="h-4 w-4" />
              </button>
              <button aria-label="Language" className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#c4c6d0] text-[#001736]">
                <Globe2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}

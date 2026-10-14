'use client';

import React, { useState } from 'react';
import {
  Smartphone,
  Laptop,
  Shield,
  MapPin,
  CheckCircle2,
  Clock,
  Battery,
  Wifi,
  Navigation,
  FileCheck,
  TrendingUp,
  AlertTriangle,
  Lock,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { ScrollSection } from '@trackrex/ui';

export function InteractiveDeviceShowcase() {
  const [activeTab, setActiveTab] = useState<'mobile' | 'desktop' | 'privacy'>('mobile');

  return (
    <div className="relative mx-auto mt-6 max-w-5xl">
      {/* Apple-style floating tab switcher */}
      <div className="flex justify-center">
        <div className="inline-flex flex-wrap items-center justify-center gap-1 rounded-xl border border-border bg-surface/70 p-1 backdrop-blur-xl">
          <button
            onClick={() => setActiveTab('mobile')}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all duration-300 ${
              activeTab === 'mobile'
                ? 'bg-gradient-to-r from-cyan-500 to-violet-500 text-white shadow-lg shadow-cyan-500/30'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
            }`}
          >
            <Smartphone className="size-4" />
            Field Mobile App
          </button>
          <button
            onClick={() => setActiveTab('desktop')}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all duration-300 ${
              activeTab === 'desktop'
                ? 'bg-gradient-to-r from-cyan-500 to-violet-500 text-white shadow-lg shadow-cyan-500/30'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
            }`}
          >
            <Laptop className="size-4" />
            Ops Dispatcher Console
          </button>
          <button
            onClick={() => setActiveTab('privacy')}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all duration-300 ${
              activeTab === 'privacy'
                ? 'bg-gradient-to-r from-cyan-500 to-violet-500 text-white shadow-lg shadow-cyan-500/30'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
            }`}
          >
            <Shield className="size-4" />
            Privacy & Trust Engine
          </button>
        </div>
      </div>

      {/* Frame Container */}
      <div className="mt-8 transition-all duration-500">
        {activeTab === 'mobile' && (
          <ScrollSection variant="scale" className="flex justify-center">
            {/* Apple iPhone 16 Pro Frame */}
            <div className="relative w-full max-w-[340px] sm:max-w-[360px] rounded-[48px] border-[10px] border-slate-800 bg-slate-900 p-3 shadow-2xl shadow-cyan-500/20 ring-1 ring-white/10">
              {/* Dynamic Island */}
              <div className="absolute left-1/2 top-5 z-20 h-6 w-28 -translate-x-1/2 rounded-full bg-black px-2 flex items-center justify-between">
                <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-mono text-emerald-400">GPS ACTIVE</span>
              </div>

              {/* Screen Content */}
              <div className="overflow-hidden rounded-[36px] bg-slate-950 text-white font-sans">
                {/* Mobile Status Bar */}
                <div className="flex items-center justify-between px-6 pt-3 text-[11px] text-slate-400">
                  <span>9:41</span>
                  <div className="flex items-center gap-1.5">
                    <Wifi className="size-3" />
                    <Battery className="size-3 text-emerald-400" />
                  </div>
                </div>

                {/* App Header */}
                <div className="p-5 pt-7">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-slate-400">Good morning</p>
                      <h4 className="text-lg font-semibold text-white">Anitha Kumar</h4>
                    </div>
                    <span className="rounded-pill bg-cyan-500/20 px-2.5 py-1 text-[11px] font-semibold text-cyan-400 border border-cyan-500/30">
                      Field Ops #104
                    </span>
                  </div>

                  {/* Shift Live Card */}
                  <div className="relative mt-4 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90 p-4">
                    <div className="absolute -right-6 -top-6 size-24 rounded-full bg-cyan-500/10 blur-xl" />
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">Shift status</span>
                      <span className="flex items-center gap-1 text-xs font-semibold text-emerald-400">
                        <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                        Punched In
                      </span>
                    </div>
                    <p className="mt-2 text-2xl font-bold tracking-tight text-white font-mono">
                      03:42:18
                    </p>
                    <p className="text-[11px] text-slate-400">Standard General Shift (9:00 - 18:00)</p>

                    {/* Geofence Radar Status */}
                    <div className="mt-3 flex items-center gap-2 rounded-xl bg-slate-800/80 p-2.5 text-xs text-slate-300">
                      <MapPin className="size-4 text-cyan-400 shrink-0" />
                      <div className="min-w-0 flex-1 text-[11px]">
                        <p className="font-semibold text-white truncate">Tech Park Geofence</p>
                        <p className="text-slate-400 truncate">GPS accuracy 2.1m · Verified</p>
                      </div>
                      <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
                    </div>
                  </div>

                  {/* Scheduled Visits */}
                  <div className="mt-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-slate-300">Assigned Client Tasks</p>
                      <span className="text-[10px] text-cyan-400">3 of 4 done</span>
                    </div>
                    <div className="mt-2 space-y-2">
                      <div className="flex items-center gap-2.5 rounded-xl border border-slate-800/80 bg-slate-900/60 p-2.5 text-xs">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-[10px]">
                          ✓
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-white truncate">Acro Micro Systems</p>
                          <p className="text-[10px] text-slate-400">Completed · Form & Signatures saved</p>
                        </div>
                        <span className="text-[10px] text-slate-400">10:15 AM</span>
                      </div>

                      <div className="flex items-center gap-2.5 rounded-xl border border-cyan-500/30 bg-cyan-950/30 p-2.5 text-xs">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-400 text-[10px] animate-pulse">
                          ●
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-white truncate">Nexus Logistics Hub</p>
                          <p className="text-[10px] text-cyan-300">In Progress · ETA 8 mins</p>
                        </div>
                        <Navigation className="size-3.5 text-cyan-400 shrink-0" />
                      </div>
                    </div>
                  </div>

                  {/* Bottom Action Gesture */}
                  <div className="mt-5">
                    <div className="flex h-11 items-center justify-center rounded-pill bg-gradient-to-r from-cyan-500 to-violet-500 font-semibold text-xs text-white shadow-md shadow-cyan-500/30">
                      Tap to Log Customer Visit
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </ScrollSection>
        )}

        {activeTab === 'desktop' && (
          <ScrollSection variant="scale">
            {/* Apple MacBook Pro 16" Console Frame */}
            <div className="glass overflow-hidden rounded-xl shadow-2xl shadow-black/20">
              {/* Window Header */}
              <div className="flex items-center justify-between border-b border-rule bg-canvas/80 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="size-3 rounded-full bg-[#EA4335]" />
                  <span className="size-3 rounded-full bg-[#FBBC05]" />
                  <span className="size-3 rounded-full bg-[#34A853]" />
                </div>
                <div className="flex items-center gap-2 rounded-md bg-surface px-4 py-1 text-xs text-muted border border-rule font-mono">
                  <Lock className="size-3 text-emerald-500" />
                  console.vintrack.com/attendance/live
                </div>
                <div className="text-xs text-muted">Trackrex Enterprise v2.4</div>
              </div>

              {/* Console Body */}
              <div className="p-6">
                {/* KPI Ribbon */}
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div className="rounded-xl border border-rule bg-canvas/40 p-3.5">
                    <p className="text-xs font-semibold text-muted uppercase tracking-wider">Attendance Rate</p>
                    <p className="mt-1 text-2xl font-bold text-ink">97.8%</p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-emerald-500 font-medium">
                      <TrendingUp className="size-3" /> +2.4% vs last week
                    </p>
                  </div>
                  <div className="rounded-xl border border-rule bg-canvas/40 p-3.5">
                    <p className="text-xs font-semibold text-muted uppercase tracking-wider">Active Field Agents</p>
                    <p className="mt-1 text-2xl font-bold text-ink">48 / 50</p>
                    <p className="mt-1 text-xs text-muted">2 on approved leave</p>
                  </div>
                  <div className="rounded-xl border border-rule bg-canvas/40 p-3.5">
                    <p className="text-xs font-semibold text-muted uppercase tracking-wider">Geofence Compliance</p>
                    <p className="mt-1 text-2xl font-bold text-emerald-500">99.4%</p>
                    <p className="mt-1 text-xs text-muted">0 spoofing pings detected</p>
                  </div>
                  <div className="rounded-xl border border-rule bg-canvas/40 p-3.5">
                    <p className="text-xs font-semibold text-muted uppercase tracking-wider">Payroll Settlement</p>
                    <p className="mt-1 text-2xl font-bold text-cyan-500">Auto-Ready</p>
                    <p className="mt-1 text-xs text-muted">1 click monthly export</p>
                  </div>
                </div>

                {/* Live Matrix Table Preview */}
                <div className="mt-6 overflow-hidden rounded-xl border border-rule">
                  <div className="border-b border-rule bg-canvas/60 px-4 py-2.5 text-xs font-semibold text-muted flex justify-between items-center">
                    <span>Live Team Telemetry & Shifts</span>
                    <span className="flex items-center gap-1.5 text-emerald-500">
                      <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                      Live Stream
                    </span>
                  </div>
                  <div className="divide-y divide-rule text-sm">
                    {[
                      { name: 'Anitha Kumar', role: 'Senior Field Lead', time: '09:02 AM', status: 'On time', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30', loc: 'Tech Park Zone A' },
                      { name: 'Suresh Babu', role: 'Customer Success', time: '09:18 AM', status: 'Late 18m', badge: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30', loc: 'Downtown HQ' },
                      { name: 'Divya Nair', role: 'Support Specialist', time: '--', status: 'Annual Leave', badge: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/30', loc: 'Approved (HR-92)' },
                      { name: 'Vikram Raghavan', role: 'Field Technician', time: '08:55 AM', status: 'On time', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30', loc: 'Client Site North' },
                    ].map((row) => (
                      <div key={row.name} className="flex items-center justify-between px-4 py-3 hover:bg-canvas/40 transition-colors">
                        <div className="min-w-0">
                          <p className="font-medium text-ink">{row.name}</p>
                          <p className="text-xs text-muted">{row.role}</p>
                        </div>
                        <div className="hidden sm:block text-xs text-muted">
                          Punch: <span className="font-mono text-ink">{row.time}</span>
                        </div>
                        <div className="hidden md:block text-xs text-muted">
                          {row.loc}
                        </div>
                        <span className={`rounded-pill border px-2.5 py-0.5 text-xs font-medium ${row.badge}`}>
                          {row.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </ScrollSection>
        )}

        {activeTab === 'privacy' && (
          <ScrollSection variant="scale">
            {/* Apple Privacy & Cryptographic Assurance Showcase */}
            <div className="glass rounded-xl p-8 shadow-2xl shadow-black/20">
              <div className="grid gap-8 md:grid-cols-2 items-center">
                <div>
                  <span className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 font-mono text-xs font-medium text-cyan-600 dark:text-cyan-400">
                    <Shield className="size-3.5" />
                    Zero-Knowledge Workforce Privacy
                  </span>
                  <h3 className="mt-3 text-2xl font-bold tracking-tight text-ink">
                    Tracking with ethical boundaries employees can trust.
                  </h3>
                  <p className="mt-3 text-sm text-muted leading-relaxed">
                    Unlike intrusive surveillance software, Trackrex was engineered with employee dignity and mathematical guarantees at its core:
                  </p>
                  <ul className="mt-4 space-y-3 text-sm text-ink/80">
                    <li className="flex items-start gap-2.5">
                      <CheckCircle2 className="size-4 text-emerald-500 mt-0.5 shrink-0" />
                      <span><strong>Punch-Gated Only:</strong> GPS is strictly turned off the millisecond an employee punches out.</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <CheckCircle2 className="size-4 text-emerald-500 mt-0.5 shrink-0" />
                      <span><strong>Transparent to the Worker:</strong> Employees have a live audit log in their mobile app showing every ping collected.</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <CheckCircle2 className="size-4 text-emerald-500 mt-0.5 shrink-0" />
                      <span><strong>Tenant-Isolated Encryption:</strong> Each company has a dedicated cryptographic role in PostgreSQL. No shared data pools.</span>
                    </li>
                  </ul>
                </div>

                <div className="rounded-xl border border-rule bg-canvas/60 p-5 space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between text-muted border-b border-rule pb-2">
                    <span>SECURITY ATTESTATION</span>
                    <span className="text-emerald-500">PASSED</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-muted">Database Role:</span>
                    <span className="text-ink font-semibold">tenant_c48a91_isolated</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-muted">KMS Envelope Key:</span>
                    <span className="text-ink font-semibold">AES-256-GCM Hardware-Sealed</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-muted">Off-Shift Pings:</span>
                    <span className="text-emerald-500 font-semibold">0 (Hardware Enforced)</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-muted">Audit Trail Immutability:</span>
                    <span className="text-cyan-500 font-semibold">Cryptographically Chained</span>
                  </div>
                </div>
              </div>
            </div>
          </ScrollSection>
        )}
      </div>
    </div>
  );
}

export function InteractiveRoiCalculator() {
  const [teamSize, setTeamSize] = useState<number>(35);

  const pricePerUser = 3; // $3/user/mo
  const monthlyCost = teamSize * pricePerUser;
  const hoursSavedPerEmployee = 1.2; // 1.2 hrs per employee per month in dispute/payroll reconciliation
  const totalHoursSaved = Math.round(teamSize * hoursSavedPerEmployee);
  const estimatedPayrollErrorSavings = Math.round(teamSize * 36);

  return (
    <div className="stack-card overflow-hidden border border-violet-500/20 p-6 sm:p-10">
      <div className="grid gap-10 lg:grid-cols-2 items-center">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-1.5 font-mono text-xs font-medium uppercase tracking-wider text-violet-400"><span className="size-1.5 animate-pulse rounded-full bg-violet-400" />ROI Calculator</span>
          <h3 className="mt-4 text-2xl sm:text-3xl font-extrabold tracking-tight text-text-primary">
            Calculate your operational savings in seconds.
          </h3>
          <p className="mt-3 text-sm sm:text-base text-muted leading-relaxed">
            Eliminate ghost punching, time theft, shift calculation disputes, and manual payroll headaches.
          </p>

          <div className="mt-6">
            <div className="flex items-center justify-between text-sm font-semibold">
              <label htmlFor="team-slider" className="text-ink">Team Size:</label>
              <span className="gradient-text-static font-mono text-lg font-bold">{teamSize} employees</span>
            </div>
            <input
              id="team-slider"
              type="range"
              min="5"
              max="250"
              step="5"
              value={teamSize}
              onChange={(e) => setTeamSize(Number(e.target.value))}
              className="mt-3 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface accent-cyan-500"
            />
            <div className="mt-2 flex justify-between text-xs text-muted">
              <span>5 people</span>
              <span>100 people</span>
              <span>250+ people</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="glass-card p-4">
            <p className="text-xs font-medium text-muted">Monthly Investment</p>
            <p className="mt-2 text-2xl sm:text-3xl font-extrabold text-cyan-400 font-mono">${monthlyCost}</p>
            <p className="mt-1 text-[11px] text-muted">$3 / active member / mo</p>
          </div>

          <div className="glass-card p-4">
            <p className="text-xs font-medium text-muted">Admin Hours Saved</p>
            <p className="mt-2 text-2xl sm:text-3xl font-extrabold text-emerald-500 font-mono">~{totalHoursSaved}h</p>
            <p className="mt-1 text-[11px] text-muted">Saved in manual audits / mo</p>
          </div>

          <div className="gradient-border col-span-2 rounded-xl bg-gradient-to-br from-cyan-500/10 via-violet-500/10 to-rose-500/10 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Estimated Payroll Leakage Prevented
                </p>
                <p className="gradient-text-static mt-1 text-2xl font-extrabold font-mono">
                  ${estimatedPayrollErrorSavings} / month
                </p>
              </div>
              <Sparkles className="size-8 text-violet-400" />
            </div>
            <p className="mt-2 text-[11px] text-text-muted">
              Zero buddy-punching, strict geofenced boundaries, and exact server-calculated overtime.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

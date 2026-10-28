'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  CheckCircle2,
  Eye,
  Flame,
  Layers,
  RotateCcw,
  Save,
  Sparkles,
} from 'lucide-react';
import CommandHeader from '@/components/CommandHeader';
import {
  BranchVariant,
  ROLE_TRACK_META,
  RoleTrack,
  SequenceTemplate,
} from '@/types/outreach';

interface TouchStepOption {
  touchNumber: 1 | 2 | 3 | 4;
  branchVariant: BranchVariant;
  title: string;
  subtitle: string;
  dayLabel: string;
}

const TOUCH_STEPS: TouchStepOption[] = [
  {
    touchNumber: 1,
    branchVariant: 'STANDARD',
    title: 'Touch 1 — Primary Cold Pitch',
    subtitle: '9+ yrs Brand/GTM + 21 solo AI systems',
    dayLabel: 'Day 0 (Immediate)',
  },
  {
    touchNumber: 2,
    branchVariant: 'WARM',
    title: 'Touch 2A — Warm Intent Branch',
    subtitle: 'Clicked portfolio OR 2+ opens · 2-min live walkthrough offer',
    dayLabel: 'Day +3 Business Days',
  },
  {
    touchNumber: 2,
    branchVariant: 'COLD',
    title: 'Touch 2B — Cold Proof Bump',
    subtitle: '0 clicks & ≤1 open · 3-sentence executive summary bump',
    dayLabel: 'Day +3 Business Days',
  },
  {
    touchNumber: 3,
    branchVariant: 'STANDARD',
    title: 'Touch 3 — Value & Technical/GTM Insight Shift',
    subtitle: 'Shares AEO/GEO Markdown & 46-agent <$5/mo write-ups',
    dayLabel: 'Day +8 Business Days (+5d)',
  },
  {
    touchNumber: 4,
    branchVariant: 'STANDARD',
    title: 'Touch 4 — Polite Executive Breakup',
    subtitle: 'Closes loop professionally & leaves portfolio for next quarter',
    dayLabel: 'Day +14 Business Days (+6d)',
  },
];

const MERGE_VARIABLES = [
  { token: '{{first_name}}', desc: 'Recipient first name (defaults to "Team")' },
  { token: '{{company_name}}', desc: 'Target organization name' },
  { token: '{{target_role_opening}}', desc: 'Specific open role title' },
  { token: '{{custom_icebreaker}}', desc: '1-sentence hook (collapses cleanly if blank)' },
  { token: '{{tracked_portfolio_url}}', desc: 'Tracked portfolio URL (?ref={{lead_uuid}})' },
  { token: '{{tracked_resume_url}}', desc: 'Tracked resume URL (?ref={{lead_uuid}})' },
  { token: '{{original_subject}}', desc: 'Original Touch 1 subject for Re: threading' },
];

export default function SequenceStudioPage() {
  const [templates, setTemplates] = useState<SequenceTemplate[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<RoleTrack>('HYBRID_DEFAULT');
  const [selectedStepIdx, setSelectedStepIdx] = useState(0);

  // Active editor fields
  const [subjectTemplate, setSubjectTemplate] = useState('');
  const [bodyTemplate, setBodyTemplate] = useState('');
  const [waitDays, setWaitDays] = useState(0);
  const [sameThread, setSameThread] = useState(false);

  // Preview sample persona
  const [previewFirstName, setPreviewFirstName] = useState('Ananya');
  const [previewCompany, setPreviewCompany] = useState('Sarvam AI');
  const [previewRole, setPreviewRole] = useState('AI Product Marketing Manager (AI PMM)');
  const [previewIcebreaker, setPreviewIcebreaker] = useState(
    'Loved your recent enterprise rollout of sovereign voice agents across Indian banking.'
  );

  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    const res = await fetch('/api/templates', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    setTemplates(data.templates || []);
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const currentStep = TOUCH_STEPS[selectedStepIdx];

  useEffect(() => {
    if (templates.length === 0) return;
    const match = templates.find(
      (t) =>
        t.role_track === selectedTrack &&
        t.touch_number === currentStep.touchNumber &&
        t.branch_variant === currentStep.branchVariant
    );
    if (match) {
      setSubjectTemplate(match.subject_template);
      setBodyTemplate(match.body_template);
      setWaitDays(match.wait_business_days);
      setSameThread(match.same_thread);
    }
  }, [templates, selectedTrack, currentStep]);

  const handleSaveTemplate = async () => {
    setSaving(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role_track: selectedTrack,
          touch_number: currentStep.touchNumber,
          branch_variant: currentStep.branchVariant,
          subject_template: subjectTemplate,
          body_template: bodyTemplate,
          wait_business_days: waitDays,
          same_thread: sameThread,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || []);
        setStatusMessage('Sequence template saved to database.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefault = async () => {
    setSaving(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'RESET_DEFAULT',
          role_track: selectedTrack,
          touch_number: currentStep.touchNumber,
          branch_variant: currentStep.branchVariant,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || []);
        setStatusMessage('Restored verified PRD copy for this touch.');
      }
    } finally {
      setSaving(false);
    }
  };

  // Compute live preview
  const touch1Match = templates.find(
    (t) =>
      t.role_track === selectedTrack &&
      t.touch_number === 1 &&
      t.branch_variant === 'STANDARD'
  );
  const resolvedTouch1Subject = (
    touch1Match?.subject_template ||
    '9+ yrs Brand Marketing + 21 AI products shipped solo — Open roles at {{company_name}}?'
  )
    .replace(/\{\{\s*first_name\s*\}\}/gi, previewFirstName || 'Team')
    .replace(/\{\{\s*company_name\s*\}\}/gi, previewCompany || 'your team')
    .replace(/\{\{\s*target_role_opening\s*\}\}/gi, previewRole || 'Senior Brand / AI PMM');

  const renderedPreviewSubject = subjectTemplate
    .replace(/\{\{\s*first_name\s*\}\}/gi, previewFirstName || 'Team')
    .replace(/\{\{\s*company_name\s*\}\}/gi, previewCompany || 'your team')
    .replace(/\{\{\s*target_role_opening\s*\}\}/gi, previewRole || 'Senior Brand / AI PMM')
    .replace(/\{\{\s*original_subject\s*\}\}/gi, resolvedTouch1Subject);

  const formattedIcebreaker = previewIcebreaker.trim()
    ? `${previewIcebreaker.trim()}\n\n`
    : '';

  const renderedPreviewBody = bodyTemplate
    .replace(/\{\{\s*first_name\s*\}\}/gi, previewFirstName || 'Team')
    .replace(/\{\{\s*company_name\s*\}\}/gi, previewCompany || 'your team')
    .replace(/\{\{\s*target_role_opening\s*\}\}/gi, previewRole || 'Senior Brand / AI PMM')
    .replace(/\{\{\s*custom_icebreaker\s*\}\}/gi, formattedIcebreaker)
    .replace(/\{\{\s*original_subject\s*\}\}/gi, resolvedTouch1Subject)
    .replace(
      /\{\{\s*tracked_portfolio_url\s*\}\}/gi,
      'https://sumandebnath.houseofnamus.com/?ref=11111111-2222-4333-8444-555555550001'
    )
    .replace(
      /\{\{\s*tracked_resume_url\s*\}\}/gi,
      'https://sumandebnath.houseofnamus.com/resume?ref=11111111-2222-4333-8444-555555550001'
    )
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return (
    <div className="flex min-h-screen flex-col bg-[#09090B]">
      <CommandHeader />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 space-y-6">
        {/* Top Role Track Selector Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[#27272A] bg-[#121215] p-5">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-emerald-400" />
              <h1 className="text-base font-bold uppercase tracking-wider text-[#FAFAFA]">
                Sequence & Template Studio
              </h1>
            </div>
            <p className="mt-1 text-xs text-zinc-400">
              Customize all 4 touches (including Touch 2A Warm Intent & Touch 2B Cold Proof Bump) across all 4 executive role tracks.
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(['HYBRID_DEFAULT', 'BRAND', 'AI_PMM', 'AI_PM'] as RoleTrack[]).map(
              (track) => (
                <button
                  key={track}
                  onClick={() => {
                    setSelectedTrack(track);
                    setStatusMessage(null);
                  }}
                  className={`rounded border px-3 py-1.5 font-mono text-xs font-semibold transition-all ${
                    selectedTrack === track
                      ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                      : 'border-[#27272A] bg-[#09090B] text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {ROLE_TRACK_META[track].shortLabel} — {ROLE_TRACK_META[track].label}
                </button>
              )
            )}
          </div>
        </div>

        {/* 5-Step Cadence Selector Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
          {TOUCH_STEPS.map((step, idx) => {
            const active = selectedStepIdx === idx;
            const isWarm = step.branchVariant === 'WARM';
            return (
              <button
                key={`${step.touchNumber}_${step.branchVariant}`}
                onClick={() => {
                  setSelectedStepIdx(idx);
                  setStatusMessage(null);
                }}
                className={`rounded-lg border p-3 text-left transition-all ${
                  active
                    ? isWarm
                      ? 'border-amber-500/60 bg-amber-500/10'
                      : 'border-emerald-500/60 bg-[#18181C]'
                    : 'border-[#27272A] bg-[#121215] hover:bg-[#16161A]'
                }`}
              >
                <div className="flex items-center justify-between font-mono text-[10px]">
                  <span
                    className={
                      isWarm
                        ? 'font-bold text-amber-400 flex items-center gap-1'
                        : 'font-bold text-emerald-400'
                    }
                  >
                    {isWarm && <Flame className="h-3 w-3" />}
                    STEP 0{idx + 1}
                  </span>
                  <span className="text-zinc-500">{step.dayLabel}</span>
                </div>
                <p className="mt-1 text-xs font-bold text-[#FAFAFA] line-clamp-1">
                  {step.title}
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-400 line-clamp-2">
                  {step.subtitle}
                </p>
              </button>
            );
          })}
        </div>

        {statusMessage && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 font-mono text-xs text-emerald-300">
            <CheckCircle2 className="h-4 w-4" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Editor & Live Variable Preview Split Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LEFT: Template Editor */}
          <div className="rounded-lg border border-[#27272A] bg-[#121215] p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#27272A] pb-3">
              <div>
                <h2 className="font-mono text-xs font-bold uppercase text-[#FAFAFA]">
                  Template Source Editor ({ROLE_TRACK_META[selectedTrack].shortLabel} ·{' '}
                  {currentStep.title})
                </h2>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleResetDefault}
                  disabled={saving}
                  className="flex items-center gap-1 rounded border border-[#27272A] bg-[#18181C] px-2.5 py-1 text-[11px] font-mono text-zinc-300 hover:text-white"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Reset Default</span>
                </button>
                <button
                  onClick={handleSaveTemplate}
                  disabled={saving}
                  className="flex items-center gap-1 rounded bg-emerald-500 px-3 py-1 text-xs font-bold text-[#09090B] hover:bg-emerald-400"
                >
                  <Save className="h-3.5 w-3.5" />
                  <span>{saving ? 'Saving...' : 'Save Template'}</span>
                </button>
              </div>
            </div>

            {/* Cadence & Threading Controls */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-mono text-[10px] uppercase text-zinc-400 mb-1">
                  Wait Business Days (Excludes Sat/Sun)
                </label>
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={waitDays}
                  onChange={(e) => setWaitDays(Number(e.target.value))}
                  className="w-full rounded border border-[#27272A] bg-[#09090B] px-3 py-1.5 font-mono text-xs text-[#FAFAFA] focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex flex-col justify-end">
                <label className="flex items-center gap-2 rounded border border-[#27272A] bg-[#09090B] px-3 py-1.5 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sameThread}
                    onChange={(e) => setSameThread(e.target.checked)}
                    className="rounded border-zinc-700 bg-zinc-900 text-emerald-500"
                  />
                  <span className="font-mono text-[11px]">
                    Send in Same Thread (`In-Reply-To` & `References`)
                  </span>
                </label>
              </div>
            </div>

            {/* Subject Input */}
            <div>
              <label className="block font-mono text-[10px] uppercase text-zinc-400 mb-1">
                Subject Template
              </label>
              <input
                type="text"
                value={subjectTemplate}
                onChange={(e) => setSubjectTemplate(e.target.value)}
                className="w-full rounded border border-[#27272A] bg-[#09090B] px-3 py-2 text-xs font-semibold text-[#FAFAFA] focus:border-emerald-500 focus:outline-none"
              />
            </div>

            {/* Merge Variable Reference Pills */}
            <div>
              <span className="block font-mono text-[10px] uppercase text-zinc-500 mb-1.5">
                Click to Copy Dynamic Merge Variable:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {MERGE_VARIABLES.map((v) => (
                  <button
                    key={v.token}
                    type="button"
                    title={v.desc}
                    onClick={() =>
                      setBodyTemplate((prev) => `${prev} ${v.token}`)
                    }
                    className="rounded border border-[#27272A] bg-[#09090B] px-2 py-0.5 font-mono text-[11px] text-emerald-400 hover:border-emerald-500/40"
                  >
                    {v.token}
                  </button>
                ))}
              </div>
            </div>

            {/* Body Textarea */}
            <div>
              <label className="block font-mono text-[10px] uppercase text-zinc-400 mb-1">
                Body Template
              </label>
              <textarea
                rows={18}
                value={bodyTemplate}
                onChange={(e) => setBodyTemplate(e.target.value)}
                className="w-full rounded border border-[#27272A] bg-[#09090B] p-3.5 font-mono text-xs leading-relaxed text-[#FAFAFA] focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {/* RIGHT: Live Variable Preview Pane */}
          <div className="rounded-lg border border-[#27272A] bg-[#121215] p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#27272A] pb-3">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-sky-400" />
                <h2 className="font-mono text-xs font-bold uppercase text-[#FAFAFA]">
                  Live Merge Variable & RFC 2822 Preview
                </h2>
              </div>
              <span className="font-mono text-[10px] text-emerald-400 flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                1x1 Open Pixel + Click Wrapper Active
              </span>
            </div>

            {/* Sample Lead Variable Inputs */}
            <div className="grid grid-cols-2 gap-2.5 rounded border border-[#27272A] bg-[#09090B] p-3 text-xs">
              <div>
                <label className="block font-mono text-[10px] text-zinc-500">
                  {'{{first_name}}'}
                </label>
                <input
                  type="text"
                  value={previewFirstName}
                  onChange={(e) => setPreviewFirstName(e.target.value)}
                  className="mt-0.5 w-full rounded border border-[#27272A] bg-[#121215] px-2 py-1 text-[#FAFAFA]"
                />
              </div>
              <div>
                <label className="block font-mono text-[10px] text-zinc-500">
                  {'{{company_name}}'}
                </label>
                <input
                  type="text"
                  value={previewCompany}
                  onChange={(e) => setPreviewCompany(e.target.value)}
                  className="mt-0.5 w-full rounded border border-[#27272A] bg-[#121215] px-2 py-1 text-[#FAFAFA]"
                />
              </div>
              <div className="col-span-2">
                <label className="block font-mono text-[10px] text-zinc-500">
                  {'{{custom_icebreaker}}'} (Clear this input to verify zero extra line-break collapse)
                </label>
                <input
                  type="text"
                  value={previewIcebreaker}
                  onChange={(e) => setPreviewIcebreaker(e.target.value)}
                  placeholder="Leave empty to test clean collapse..."
                  className="mt-0.5 w-full rounded border border-[#27272A] bg-[#121215] px-2 py-1 text-[#FAFAFA]"
                />
              </div>
            </div>

            {/* Rendered Email Envelope */}
            <div className="rounded-lg border border-[#27272A] bg-[#09090B] p-4 space-y-3">
              <div className="space-y-1 border-b border-[#27272A] pb-3 font-mono text-[11px]">
                <div className="flex justify-between">
                  <span className="text-zinc-500">From:</span>
                  <span className="text-zinc-200">
                    &quot;Suman Debnath&quot; &lt;sumandebnath944@gmail.com&gt;
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">To:</span>
                  <span className="text-zinc-200">
                    {previewFirstName || 'Team'} &lt;recruiter@
                    {(previewCompany || 'company').toLowerCase().replace(/\s+/g, '')}.com&gt;
                  </span>
                </div>
                {sameThread && (
                  <div className="flex justify-between">
                    <span className="text-zinc-500">In-Reply-To / References:</span>
                    <span className="text-emerald-400">
                      &lt;CA+OutreachOS_Thread@mail.gmail.com&gt;
                    </span>
                  </div>
                )}
                <div className="pt-1 text-xs">
                  <span className="text-zinc-500">Subject: </span>
                  <span className="font-sans font-bold text-[#FAFAFA]">
                    {renderedPreviewSubject}
                  </span>
                </div>
              </div>

              <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-zinc-200">
                {renderedPreviewBody}
              </pre>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

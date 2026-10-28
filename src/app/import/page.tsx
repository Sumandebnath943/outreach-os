'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Papa from 'papaparse';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  UploadCloud,
} from 'lucide-react';
import CommandHeader from '@/components/CommandHeader';
import {
  GEO_REGION_META,
  GeoRegion,
  GlobalKPIs,
  ROLE_TRACK_META,
  RoleTrack,
} from '@/types/outreach';

interface NormalizedCsvRow {
  first_name: string;
  last_name: string;
  email: string;
  company_name: string;
  job_title: string;
  linkedin_url: string;
  company_website: string;
  target_role_opening: string;
  geo_region: string;
  role_track: string;
  custom_icebreaker: string;
}

const SAMPLE_CSV_CONTENT = `first_name,last_name,email,company_name,job_title,target_role_opening,geo_region,role_track,linkedin_url,company_website,custom_icebreaker
Siddharth,Rao,siddharth.rao@krutrim-example.ai,Krutrim AI,VP of Marketing & Growth,Senior Brand Marketing Manager,INDIA,BRAND,https://linkedin.com/in/siddharth-rao,https://olakrutrim.com,Impressed by how Krutrim is positioning sovereign AI infrastructure for Indian enterprises.
Claire,Bennett,claire@anthropic-example.com,Anthropic,Head of Product Marketing,AI Product Marketing Manager (AI PMM),US,AI_PMM,https://linkedin.com/in/claire-bennett,https://anthropic.com,Built my 46-agent operator OS (MIGI) and MCP-style content negotiation workflows around Claude.
Arjun,Kapoor,arjun@cred-example.club,CRED,Head of Brand & Storytelling,Senior Brand Marketing Manager,INDIA,BRAND,https://linkedin.com/in/arjun-kapoor,https://cred.club,Long-time admirer of CRED's high-craft brand systems and category-defining GTM campaigns.
Devon,Brooks,devon@cursor-example.com,Anysphere (Cursor),Product Lead,AI Product Manager (AI PM),US,AI_PM,https://linkedin.com/in/devon-brooks,https://cursor.com,Fine-tuned a 1.5B coding model (Qdex-1.5B) and shipped 21 AI systems solo over the last 24 months.`;

function mapHeaderRow(raw: Record<string, string>): NormalizedCsvRow {
  const getVal = (keys: string[]) => {
    for (const k of Object.keys(raw)) {
      const cleanKey = k.trim().toLowerCase().replace(/[\s_-]+/g, '_');
      if (keys.includes(cleanKey) && raw[k]) {
        return String(raw[k]).trim();
      }
    }
    return '';
  };

  return {
    first_name: getVal(['first_name', 'firstname', 'first', 'name', 'contact_name']) || 'Team',
    last_name: getVal(['last_name', 'lastname', 'last', 'surname']),
    email: getVal(['email', 'email_address', 'work_email', 'contact_email']).toLowerCase(),
    company_name: getVal(['company_name', 'company', 'organization', 'account']),
    job_title: getVal(['job_title', 'title', 'role', 'position', 'designation']),
    linkedin_url: getVal(['linkedin_url', 'linkedin', 'person_linkedin', 'profile_url']),
    company_website: getVal(['company_website', 'website', 'domain', 'company_url']),
    target_role_opening: getVal([
      'target_role_opening',
      'target_role',
      'open_role',
      'opening',
      'job_opening',
    ]),
    geo_region: getVal(['geo_region', 'geo', 'region', 'country', 'location']),
    role_track: getVal(['role_track', 'track', 'sequence_track']),
    custom_icebreaker: getVal([
      'custom_icebreaker',
      'icebreaker',
      'hook',
      'personalization',
      'first_line',
    ]),
  };
}

export default function CsvImporterPage() {
  const [rows, setRows] = useState<NormalizedCsvRow[]>([]);
  const [existingEmails, setExistingEmails] = useState<Set<string>>(new Set());
  const [kpis, setKpis] = useState<GlobalKPIs | null>(null);
  const [overrideGeo, setOverrideGeo] = useState<GeoRegion | 'AUTO'>('AUTO');
  const [overrideTrack, setOverrideTrack] = useState<RoleTrack | 'AUTO'>('AUTO');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    importedCount: number;
    skippedDuplicatesCount: number;
    invalidRowsCount: number;
  } | null>(null);

  const loadExistingLeads = useCallback(async () => {
    try {
      const res = await fetch('/api/leads', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setKpis(data.kpis || null);
      const emailSet = new Set<string>(
        (data.leads || []).map((l: { email: string }) => l.email.toLowerCase())
      );
      setExistingEmails(emailSet);
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    loadExistingLeads();
  }, [loadExistingLeads]);

  const parseCsvString = (csvText: string) => {
    setImportResult(null);
    Papa.parse<Record<string, string>>(csvText, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const mapped = (results.data || []).map(mapHeaderRow);
        setRows(mapped);
      },
    });
  };

  const handleFileUpload = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) parseCsvString(content);
    };
    reader.readAsText(file);
  };

  const handleDownloadSample = () => {
    const blob = new Blob([SAMPLE_CSV_CONTENT], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'outreach-os-sample-leads.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleLoadSampleInline = () => {
    parseCsvString(SAMPLE_CSV_CONTENT);
  };

  const handleIngestLeads = async () => {
    if (rows.length === 0 || importing) return;
    setImporting(true);
    try {
      const res = await fetch('/api/leads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows,
          overrideGeo,
          overrideTrack,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setImportResult({
          importedCount: data.importedCount,
          skippedDuplicatesCount: data.skippedDuplicatesCount,
          invalidRowsCount: data.invalidRowsCount,
        });
        if (data.kpis) setKpis(data.kpis);
        await loadExistingLeads();
      }
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#09090B]">
      <CommandHeader kpis={kpis} onRefreshData={loadExistingLeads} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 space-y-6">
        {/* Top Header Card */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[#27272A] bg-[#121215] p-5">
          <div>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-emerald-400" />
              <h1 className="text-base font-bold uppercase tracking-wider text-[#FAFAFA]">
                Bulk CSV Lead Importer & Track Classifier
              </h1>
            </div>
            <p className="mt-1 text-xs text-zinc-400">
              Upload recruiter, founder, or hiring manager CSV lists. Automatically validates email syntax, deduplicates against active & archived leads, and assigns Role Tracks.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleLoadSampleInline}
              className="rounded border border-[#27272A] bg-[#18181C] px-3 py-2 text-xs font-medium text-zinc-200 hover:border-zinc-600"
            >
              Load Sample Leads Preview
            </button>
            <button
              onClick={handleDownloadSample}
              className="flex items-center gap-1.5 rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download Sample CSV</span>
            </button>
          </div>
        </div>

        {/* Drag and Drop Upload Box + Bulk Override Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0] || null;
              handleFileUpload(file);
            }}
            className="lg:col-span-2 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-[#27272A] bg-[#121215] p-8 text-center hover:border-emerald-500/50 hover:bg-[#16161A] transition-colors"
          >
            <UploadCloud className="h-8 w-8 text-emerald-400 mb-2" />
            <p className="text-sm font-semibold text-[#FAFAFA]">
              Drop your `.csv` lead list here, or click to browse
            </p>
            <p className="mt-1 font-mono text-[11px] text-zinc-500">
              Supported columns: first_name, last_name, email, company_name, job_title, target_role_opening, geo_region, role_track, custom_icebreaker
            </p>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => handleFileUpload(e.target.files?.[0] || null)}
              className="hidden"
            />
          </label>

          {/* Bulk Override Controls */}
          <div className="rounded-lg border border-[#27272A] bg-[#121215] p-5 space-y-4">
            <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-zinc-300">
              Import Assignment Rules
            </h3>

            <div>
              <label className="block font-mono text-[10px] uppercase text-zinc-400 mb-1">
                Role Track Assignment
              </label>
              <select
                value={overrideTrack}
                onChange={(e) => setOverrideTrack(e.target.value as RoleTrack | 'AUTO')}
                className="w-full rounded border border-[#27272A] bg-[#09090B] px-3 py-2 text-xs text-[#FAFAFA] focus:border-emerald-500 focus:outline-none"
              >
                <option value="AUTO">AUTO-DETECT (from CSV column or Job Title)</option>
                <option value="HYBRID_DEFAULT">Force All → HYBRID_DEFAULT</option>
                <option value="BRAND">Force All → BRAND (Sr. Brand Marketing)</option>
                <option value="AI_PMM">Force All → AI_PMM (AI Product Marketing)</option>
                <option value="AI_PM">Force All → AI_PM (AI Product Manager)</option>
              </select>
            </div>

            <div>
              <label className="block font-mono text-[10px] uppercase text-zinc-400 mb-1">
                Geo Region / Timezone Window
              </label>
              <select
                value={overrideGeo}
                onChange={(e) => setOverrideGeo(e.target.value as GeoRegion | 'AUTO')}
                className="w-full rounded border border-[#27272A] bg-[#09090B] px-3 py-2 text-xs text-[#FAFAFA] focus:border-emerald-500 focus:outline-none"
              >
                <option value="AUTO">AUTO-DETECT (from CSV column or .in/.com)</option>
                <option value="INDIA">Force All → INDIA (IST 10:00–18:00)</option>
                <option value="US">Force All → US (EST 09:00–17:00)</option>
                <option value="GLOBAL">Force All → GLOBAL (UTC 09:00–18:00)</option>
              </select>
            </div>

            <button
              onClick={handleIngestLeads}
              disabled={rows.length === 0 || importing}
              className="w-full rounded bg-emerald-500 py-2.5 text-xs font-bold uppercase tracking-wider text-[#09090B] hover:bg-emerald-400 disabled:opacity-40 transition-colors"
            >
              {importing
                ? 'Ingesting & Scheduling Touch 1...'
                : `Ingest ${rows.length} Leads into Funnel`}
            </button>
          </div>
        </div>

        {/* Import Result Summary Banner */}
        {importResult && (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 font-mono text-xs">
            <div className="flex items-center gap-2 text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>
                Import Complete: <strong>{importResult.importedCount}</strong> new leads queued for Touch 1 ·{' '}
                <strong>{importResult.skippedDuplicatesCount}</strong> duplicates skipped ·{' '}
                <strong>{importResult.invalidRowsCount}</strong> invalid rows rejected.
              </span>
            </div>
          </div>
        )}

        {/* Parsed Preview Table */}
        {rows.length > 0 && (
          <div className="rounded-lg border border-[#27272A] bg-[#121215] overflow-hidden">
            <div className="flex items-center justify-between border-b border-[#27272A] px-4 py-3">
              <span className="font-mono text-xs font-bold uppercase text-[#FAFAFA]">
                Parsed CSV Preview ({rows.length} Rows)
              </span>
              <button
                onClick={() => setRows([])}
                className="font-mono text-xs text-zinc-400 hover:text-white"
              >
                Clear Preview
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#27272A] bg-[#09090B] font-mono text-[10px] uppercase text-zinc-400">
                  <tr>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Company</th>
                    <th className="px-4 py-2.5">Contact</th>
                    <th className="px-4 py-2.5">Email</th>
                    <th className="px-4 py-2.5">Target Opening / Title</th>
                    <th className="px-4 py-2.5">Geo</th>
                    <th className="px-4 py-2.5">Track</th>
                    <th className="px-4 py-2.5">Custom Icebreaker</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#27272A]">
                  {rows.map((r, idx) => {
                    const isDup = existingEmails.has(r.email);
                    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email);
                    const displayGeo =
                      overrideGeo !== 'AUTO'
                        ? overrideGeo
                        : (r.geo_region?.toUpperCase() as GeoRegion) || 'INDIA';
                    const displayTrack =
                      overrideTrack !== 'AUTO'
                        ? overrideTrack
                        : (r.role_track?.toUpperCase() as RoleTrack) || 'HYBRID_DEFAULT';

                    return (
                      <tr key={idx} className="hover:bg-[#18181C]">
                        <td className="px-4 py-2.5 font-mono text-[11px]">
                          {!isValidEmail || !r.company_name ? (
                            <span className="flex items-center gap-1 text-rose-400">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              Invalid
                            </span>
                          ) : isDup ? (
                            <span className="text-amber-400">Duplicate</span>
                          ) : (
                            <span className="text-emerald-400">Ready</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-mono font-semibold text-[#FAFAFA]">
                          {r.company_name || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-zinc-200">
                          {r.first_name} {r.last_name}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-zinc-300">
                          {r.email || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-zinc-400">
                          {r.target_role_opening || r.job_title || '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
                            {GEO_REGION_META[displayGeo]?.code || displayGeo}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">
                            {ROLE_TRACK_META[displayTrack]?.shortLabel || displayTrack}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 max-w-xs truncate text-zinc-400">
                          {r.custom_icebreaker || <span className="text-zinc-600">(none)</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

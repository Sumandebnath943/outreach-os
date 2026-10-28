'use client';

import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { GeoRegion, RoleTrack } from '@/types/outreach';

interface NewLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export default function NewLeadModal({ isOpen, onClose, onCreated }: NewLeadModalProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [targetRoleOpening, setTargetRoleOpening] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [companyWebsite, setCompanyWebsite] = useState('');
  const [geoRegion, setGeoRegion] = useState<GeoRegion>('INDIA');
  const [roleTrack, setRoleTrack] = useState<RoleTrack>('HYBRID_DEFAULT');
  const [customIcebreaker, setCustomIcebreaker] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName || 'Team',
          last_name: lastName || null,
          email,
          company_name: companyName,
          job_title: jobTitle || null,
          target_role_opening: targetRoleOpening || null,
          linkedin_url: linkedinUrl || null,
          company_website: companyWebsite || null,
          geo_region: geoRegion,
          role_track: roleTrack,
          custom_icebreaker: customIcebreaker || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to add lead');
        return;
      }
      onCreated();
      onClose();
      setFirstName('');
      setLastName('');
      setEmail('');
      setCompanyName('');
      setJobTitle('');
      setTargetRoleOpening('');
      setLinkedinUrl('');
      setCompanyWebsite('');
      setCustomIcebreaker('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-lg border border-[#27272A] bg-[#121215] p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#27272A] pb-3">
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-emerald-400" />
            <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[#FAFAFA]">
              Add Target Executive / Hiring Manager Lead
            </h3>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="mt-3 rounded border border-rose-500/40 bg-rose-500/10 p-2.5 font-mono text-xs text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-mono text-[10px] uppercase text-zinc-400 mb-1">
                First Name (Defaults to &quot;Team&quot;)
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Ananya"
                className="w-full rounded border border-[#27272A] bg-[#09090B] px-3 py-2 text-[#FAFAFA] focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase text-zinc-400 mb-1">
                Last Name
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Sharma"
                className="w-full rounded border border-[#27272A] bg-[#09090B] px-3 py-2 text-[#FAFAFA] focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-mono text-[10px] uppercase text-zinc-400 mb-1">
                Work Email *
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ananya@company.com"
                className="w-full rounded border border-[#27272A] bg-[#09090B] px-3 py-2 text-[#FAFAFA] focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase text-zinc-400 mb-1">
                Company Name *
              </label>
              <input
                type="text"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Sarvam AI"
                className="w-full rounded border border-[#27272A] bg-[#09090B] px-3 py-2 text-[#FAFAFA] focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-mono text-[10px] uppercase text-zinc-400 mb-1">
                Contact&apos;s Job Title
              </label>
              <input
                type="text"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="VP of Marketing / Co-Founder"
                className="w-full rounded border border-[#27272A] bg-[#09090B] px-3 py-2 text-[#FAFAFA] focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase text-zinc-400 mb-1">
                Target Role Opening
              </label>
              <input
                type="text"
                value={targetRoleOpening}
                onChange={(e) => setTargetRoleOpening(e.target.value)}
                placeholder="AI Product Marketing Manager"
                className="w-full rounded border border-[#27272A] bg-[#09090B] px-3 py-2 text-[#FAFAFA] focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-mono text-[10px] uppercase text-zinc-400 mb-1">
                Role Track Sequence
              </label>
              <select
                value={roleTrack}
                onChange={(e) => setRoleTrack(e.target.value as RoleTrack)}
                className="w-full rounded border border-[#27272A] bg-[#09090B] px-3 py-2 text-[#FAFAFA] focus:border-emerald-500 focus:outline-none"
              >
                <option value="HYBRID_DEFAULT">HYBRID_DEFAULT (Brand + 21 AI Systems)</option>
                <option value="BRAND">BRAND (Senior Brand Marketing Manager)</option>
                <option value="AI_PMM">AI_PMM (AI Product Marketing Manager)</option>
                <option value="AI_PM">AI_PM (AI Product Manager)</option>
              </select>
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase text-zinc-400 mb-1">
                Geo Region & Sending Window
              </label>
              <select
                value={geoRegion}
                onChange={(e) => setGeoRegion(e.target.value as GeoRegion)}
                className="w-full rounded border border-[#27272A] bg-[#09090B] px-3 py-2 text-[#FAFAFA] focus:border-emerald-500 focus:outline-none"
              >
                <option value="INDIA">INDIA (10:00 AM – 6:00 PM IST)</option>
                <option value="US">US (9:00 AM – 5:00 PM EST)</option>
                <option value="GLOBAL">GLOBAL (9:00 AM – 6:00 PM UTC)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-mono text-[10px] uppercase text-zinc-400 mb-1">
                LinkedIn URL
              </label>
              <input
                type="url"
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
                placeholder="https://linkedin.com/in/..."
                className="w-full rounded border border-[#27272A] bg-[#09090B] px-3 py-2 text-[#FAFAFA] focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase text-zinc-400 mb-1">
                Company Website
              </label>
              <input
                type="url"
                value={companyWebsite}
                onChange={(e) => setCompanyWebsite(e.target.value)}
                placeholder="https://..."
                className="w-full rounded border border-[#27272A] bg-[#09090B] px-3 py-2 text-[#FAFAFA] focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block font-mono text-[10px] uppercase text-zinc-400 mb-1">
              Custom 1-Sentence Icebreaker (Optional)
            </label>
            <textarea
              rows={2}
              value={customIcebreaker}
              onChange={(e) => setCustomIcebreaker(e.target.value)}
              placeholder="Optional personalized hook..."
              className="w-full rounded border border-[#27272A] bg-[#09090B] p-2.5 text-[#FAFAFA] focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-[#27272A] bg-[#18181C] px-4 py-2 text-zinc-300 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-emerald-500 px-4 py-2 font-semibold text-[#09090B] hover:bg-emerald-400 disabled:opacity-50"
            >
              {submitting ? 'Queuing Lead...' : 'Queue Lead for Touch 1'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

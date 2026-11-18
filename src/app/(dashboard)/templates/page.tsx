"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Save, Trash2 } from "lucide-react";
import { api, usePoll } from "@/lib/client";
import { TEMPLATE_VARIABLES, TOUCH_SLOTS } from "@/lib/meta";
import { findUnresolved, mergeVars, previewLinks, toHtml } from "@/lib/render";
import { ROLE_TRACKS, type BranchVariant, type Lead, type RoleTrack, type SequenceTemplate, type SystemSettings } from "@/lib/types";
import { cn } from "@/lib/utils";
import { TRACK_TONE, TOUCH_TONE } from "@/lib/theme";
import { Badge, Button, Card, Input, Label, Textarea, toast } from "@/components/ui";

const SAMPLE_ID = "00000000-0000-4000-8000-000000000000";

export default function TemplatesPage() {
  const { data, reload, error } = usePoll<{ templates: SequenceTemplate[] }>("/api/templates", 0);
  const { data: s } = usePoll<{ settings: SystemSettings }>("/api/settings", 0);
  const [track, setTrack] = useState<RoleTrack>("HYBRID_DEFAULT");
  const [slot, setSlot] = useState(0);
  const [form, setForm] = useState({ subject_template: "", body_template: "", wait_business_days: 0, same_thread: true });
  const [saving, setSaving] = useState(false);
  const [sample, setSample] = useState({
    first_name: "Priya",
    company_name: "Acme AI",
    target_role_opening: "AI Product Marketing Manager",
    custom_icebreaker: "Loved Acme’s launch film for the GenAI suite last week.",
  });
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const templates = useMemo(() => data?.templates ?? [], [data]);
  const { touch, variant } = TOUCH_SLOTS[slot];
  const find = (t: RoleTrack, v: BranchVariant = variant as BranchVariant) =>
    templates.find((x) => x.role_track === t && x.touch_number === touch && x.branch_variant === v);
  const own = find(track);
  const inherited = !own && track !== "HYBRID_DEFAULT" ? find("HYBRID_DEFAULT") : undefined;
  const active = own ?? inherited;

  useEffect(() => {
    if (active)
      setForm({
        subject_template: active.subject_template,
        body_template: active.body_template,
        wait_business_days: active.wait_business_days,
        same_thread: active.same_thread,
      });
    else setForm({ subject_template: "", body_template: "", wait_business_days: touch === 1 ? 0 : 3, same_thread: touch !== 1 });
  }, [active?.id, active?.subject_template, active?.body_template, active?.wait_business_days, active?.same_thread, touch, track, variant]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty =
    !active ||
    form.subject_template !== active.subject_template ||
    form.body_template !== active.body_template ||
    form.wait_business_days !== active.wait_business_days ||
    form.same_thread !== active.same_thread;

  async function save() {
    setSaving(true);
    try {
      await api("/api/templates", { method: "PUT", json: { role_track: track, touch_number: touch, branch_variant: variant, ...form } });
      toast(`${track} · ${TOUCH_SLOTS[slot].label} saved`);
      reload();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setSaving(false);
    }
  }

  async function removeOverride() {
    if (!own || !confirm(`Delete the ${track} override? Leads on this track will fall back to HYBRID_DEFAULT.`)) return;
    try {
      await api(`/api/templates?id=${own.id}`, { method: "DELETE" });
      toast("Override removed");
      reload();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }

  function insertVar(v: string) {
    const el = bodyRef.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const next = form.body_template.slice(0, a) + v + form.body_template.slice(b);
    setForm({ ...form, body_template: next });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + v.length, a + v.length);
    });
  }

  function switchView(change: () => void) {
    if (dirty && (form.subject_template.trim() || form.body_template.trim()) && !confirm("Discard unsaved template edits?")) return;
    change();
  }

  const preview = useMemo(() => {
    const lead = { ...sample, last_name: null, job_title: null } as unknown as Lead;
    const t1 = templates.find((x) => x.role_track === track && x.touch_number === 1) ?? templates.find((x) => x.role_track === "HYBRID_DEFAULT" && x.touch_number === 1);
    const originalSubject = t1 ? mergeVars(t1.subject_template, lead) : "Original subject";
    const subject = mergeVars(form.subject_template, lead, { originalSubject });
    const merged = mergeVars(form.body_template, lead, { originalSubject, signature: s?.settings.email_signature });
    const links = previewLinks(
      SAMPLE_ID,
      s?.settings.portfolio_base_url ?? "https://sumandebnath.houseofnamus.com",
      s?.settings.resume_url ?? "https://sumandebnath.houseofnamus.com/resume",
      s?.settings.linkedin_url,
    );
    return { subject, html: toHtml(merged, links), unresolved: findUnresolved(`${subject}\n${merged}`) };
  }, [form, sample, s, templates, track]);

  if (!data) return <div className="mx-auto max-w-7xl p-5">{error ? <p role="alert" className="text-danger">Could not load templates: {error}</p> : <p className="text-muted">Loading templates…</p>}</div>;

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-5 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-xl font-semibold tracking-tight">Templates</h1><p className="mt-1 text-sm text-muted">Choose a role track and a touch. Edit one message, with its preview alongside.</p></div>
        <Badge tone={dirty ? "warning" : "success"}>{!active ? "New template" : dirty ? "Unsaved changes" : "Saved template"}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" role="group" aria-label="Role tracks">
        {ROLE_TRACKS.map(t => <button key={t} aria-label={`Role track ${t}`} aria-pressed={track === t} data-tone={TRACK_TONE[t]} onClick={() => switchView(() => setTrack(t))} className={cn("template-track tone-surface", track === t && "tone-selected")}>
          <span className="tone-text text-xs font-medium">{t === "HYBRID_DEFAULT" ? "Hybrid · master" : t.replace(/_/g, " ")}</span><span className="mt-1 block text-[11px] text-muted">{templates.filter(x => x.role_track === t).length} own templates · 5 touches</span>
        </button>)}
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5" aria-label="Sequence touches">
        {TOUCH_SLOTS.map((sl, i) => {
          const ownTouch = templates.find(x => x.role_track === track && x.touch_number === sl.touch && x.branch_variant === sl.variant);
          return <button key={sl.short} data-tone={TOUCH_TONE[sl.short]} aria-current={slot === i ? "step" : undefined} onClick={() => switchView(() => setSlot(i))} className="template-touch tone-surface rounded-lg border p-3 text-left">
            <span className="tone-text text-sm font-semibold">{sl.short}</span><span className="mt-1 block text-xs text-fg">{sl.label.split(" · ")[1]}</span><span className="mt-1 block text-[11px] text-muted">{ownTouch ? track === "HYBRID_DEFAULT" ? "Master template" : "Custom override" : track === "HYBRID_DEFAULT" ? "Not configured" : "Inherits master"}</span>
          </button>;
        })}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
        <Card className="p-4 sm:p-5" tone={TRACK_TONE[track]}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-medium">Message editor</h2><Badge tone={TRACK_TONE[track]}>{TOUCH_SLOTS[slot].short} · {inherited ? "Inherited" : track === "HYBRID_DEFAULT" ? "Master" : "Override"}</Badge></div>
          {inherited && <p className="mb-4 text-xs text-muted">Using the master message. Saving creates a {track.replace(/_/g, " ")} override.</p>}
          <div className="space-y-4">
            <div><Label>Subject</Label><Input aria-label="Template subject" value={form.subject_template} onChange={e => setForm({ ...form, subject_template: e.target.value })} /></div>
            <div><Label>Message</Label><Textarea aria-label="Template message" ref={bodyRef} rows={14} value={form.body_template} onChange={e => setForm({ ...form, body_template: e.target.value })} className="font-mono text-xs" /></div>
            <details className="theme-details rounded-md border border-line bg-bg/40 p-3"><summary>Insert a personalization variable</summary><div className="flex flex-wrap gap-1.5">{TEMPLATE_VARIABLES.map(v => <button key={v} onClick={() => insertVar(v)} className="tone-chip rounded border px-2 py-1 font-mono text-[11px]" data-tone="info">{v}</button>)}</div></details>
            <details className="theme-details rounded-md border border-line bg-bg/40 p-3"><summary>Timing &amp; threading · {touch === 1 ? "First email" : `+${form.wait_business_days} business days`}</summary><div className="grid gap-3 sm:grid-cols-2">
              <div><Label hint={touch === 2 ? "shared by T2A & T2B" : undefined}>Wait in business days</Label><Input aria-label="Wait in business days" type="number" min={0} max={60} disabled={touch === 1} value={form.wait_business_days} onChange={e => setForm({ ...form, wait_business_days: Number(e.target.value) })} /></div>
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" disabled={touch === 1} checked={form.same_thread} onChange={e => setForm({ ...form, same_thread: e.target.checked })} />Reply in the same thread</label>
            </div><p className="mt-3 text-xs text-muted">T2A follows a click, portfolio visit or two opens. T2B handles the cold path. Waits count business days.</p></details>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              {own && track !== "HYBRID_DEFAULT" ? <Button size="sm" variant="danger" onClick={removeOverride}><Trash2 className="h-3 w-3" />Remove override</Button> : <span className="text-xs text-muted">Changes apply to future messages.</span>}
              <Button variant="primary" onClick={save} loading={saving} disabled={!dirty || !form.subject_template.trim() || !form.body_template.trim()}><Save className="h-3.5 w-3.5" />{inherited ? `Fork to ${track}` : "Save template"}</Button>
            </div>
          </div>
        </Card>
        <Card className="self-start overflow-hidden" tone="info">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-4"><h2 className="text-sm font-medium">Email preview</h2><Badge tone={preview.unresolved.length ? "danger" : "success"}>{preview.unresolved.length ? "Check variables" : "Variables resolved"}</Badge></div>
          <div className="p-4"><details className="theme-details mb-4 rounded-md border border-line bg-bg/40 p-3"><summary>Adjust sample personalization</summary><div className="grid gap-3 sm:grid-cols-2">{(Object.keys(sample) as (keyof typeof sample)[]).map(k => <div key={k} className={k === "custom_icebreaker" ? "sm:col-span-2" : ""}><Label>{k.replace(/_/g, " ")}</Label><Input aria-label={`Sample ${k.replace(/_/g, " ")}`} value={sample[k]} onChange={e => setSample({ ...sample, [k]: e.target.value })} /></div>)}</div></details>
            {preview.unresolved.length > 0 && <div className="mb-3 flex flex-wrap gap-1">{preview.unresolved.map(u => <Badge key={u} tone="danger">Unknown {u}</Badge>)}</div>}
            <div className="light-surface rounded-lg p-5"><div className="mb-2 text-[11px] text-muted">Subject</div><div className="mb-5 border-b border-line pb-4 text-sm font-semibold">{preview.subject || "—"}</div><div className="email-body text-sm" dangerouslySetInnerHTML={{ __html: preview.html }} /></div>
            <p className="mt-3 text-[11px] text-muted">Sample content only. Links are previews; no email is sent here.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GitFork, Save, Trash2 } from "lucide-react";
import { api, usePoll } from "@/lib/client";
import { TEMPLATE_VARIABLES, TOUCH_SLOTS } from "@/lib/meta";
import { findUnresolved, mergeVars, previewLinks, toHtml } from "@/lib/render";
import { ROLE_TRACKS, type BranchVariant, type Lead, type RoleTrack, type SequenceTemplate, type SystemSettings } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge, Button, Card, Input, Label, Textarea, toast } from "@/components/ui";

const SAMPLE_ID = "00000000-0000-4000-8000-000000000000";

export default function TemplatesPage() {
  const { data, reload } = usePoll<{ templates: SequenceTemplate[] }>("/api/templates", 0);
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
  }, [active?.id, active?.subject_template, active?.body_template, touch]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const preview = useMemo(() => {
    const lead = { ...sample, last_name: null, job_title: null } as unknown as Lead;
    const t1 = templates.find((x) => x.role_track === track && x.touch_number === 1) ?? templates.find((x) => x.role_track === "HYBRID_DEFAULT" && x.touch_number === 1);
    const originalSubject = t1 ? mergeVars(t1.subject_template, lead) : "Original subject";
    const subject = mergeVars(form.subject_template, lead, { originalSubject });
    const merged = mergeVars(form.body_template, lead, { originalSubject });
    const links = previewLinks(SAMPLE_ID, s?.settings.portfolio_base_url ?? "https://sumandebnath.houseofnamus.com", s?.settings.resume_url ?? "https://sumandebnath.houseofnamus.com/resume");
    return { subject, html: toHtml(merged, links), unresolved: findUnresolved(`${subject}\n${merged}`) };
  }, [form, sample, s, templates, track]);

  return (
    <div className="mx-auto max-w-7xl px-5 py-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">Sequence &amp; Template Studio</h1>
        <p className="mt-1 text-sm text-dim">
          HYBRID_DEFAULT is the master sequence. Fork any touch into a role track to tailor it — un-forked touches inherit the master.
        </p>
      </div>

      <div className="mb-4 flex gap-1 border-b border-line">
        {ROLE_TRACKS.map((t) => {
          const count = templates.filter((x) => x.role_track === t).length;
          return (
            <button
              key={t}
              onClick={() => setTrack(t)}
              className={cn("-mb-px border-b px-3 py-2 font-mono text-xs", track === t ? "border-fg text-fg" : "border-transparent text-dim hover:text-fg")}
            >
              {t} <span className="text-dim">· {count}/5</span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[230px_1fr_1fr]">
        <div className="space-y-1">
          {TOUCH_SLOTS.map((sl, i) => {
            const t = templates.find((x) => x.role_track === track && x.touch_number === sl.touch && x.branch_variant === sl.variant);
            return (
              <button
                key={sl.label}
                onClick={() => setSlot(i)}
                className={cn(
                  "w-full rounded-md border px-3 py-2.5 text-left transition-colors",
                  slot === i ? "border-line-strong bg-raised" : "border-transparent hover:bg-card",
                )}
              >
                <div className="text-[13px]">{sl.label}</div>
                <div className="mt-0.5 font-mono text-[10px] text-dim">
                  {t ? (track === "HYBRID_DEFAULT" ? "master" : "override") : track === "HYBRID_DEFAULT" ? "missing" : "inherits master"}
                  {t && sl.touch > 1 ? ` · +${t.wait_business_days} bd` : ""}
                </div>
              </button>
            );
          })}
          <div className="mt-4 rounded-md border border-line p-3 text-[11px] leading-relaxed text-dim">
            T2A (warm) fires when the lead clicked, visited the portfolio, or opened 2+ times; otherwise T2B (cold). Waits are business days after the previous touch.
          </div>
        </div>

        <Card className="p-4">
          {inherited && (
            <div className="mb-4 flex items-center justify-between rounded-md border border-line bg-bg px-3 py-2 text-xs text-muted">
              Showing the HYBRID_DEFAULT master. Saving creates a {track} override.
              <GitFork className="h-3.5 w-3.5" />
            </div>
          )}
          <div className="grid gap-3">
            <div>
              <Label>Subject</Label>
              <Input value={form.subject_template} onChange={(e) => setForm({ ...form, subject_template: e.target.value })} className="font-mono text-[12.5px]" />
            </div>
            <div>
              <Label hint="blank line = paragraph · “- ” = bullet">Body</Label>
              <Textarea
                ref={bodyRef}
                rows={24}
                value={form.body_template}
                onChange={(e) => setForm({ ...form, body_template: e.target.value })}
                className="font-mono text-[12.5px]"
              />
              <div className="mt-2 flex flex-wrap gap-1">
                {TEMPLATE_VARIABLES.map((v) => (
                  <button key={v} onClick={() => insertVar(v)} className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-muted hover:border-line-strong hover:text-fg">
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label hint={touch === 2 ? "shared by T2A & T2B" : undefined}>Wait (business days)</Label>
                <Input
                  type="number"
                  min={0}
                  max={60}
                  disabled={touch === 1}
                  value={form.wait_business_days}
                  onChange={(e) => setForm({ ...form, wait_business_days: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Threading</Label>
                <label className={cn("flex h-9 items-center gap-2 text-sm", touch === 1 && "opacity-40")}>
                  <input
                    type="checkbox"
                    disabled={touch === 1}
                    checked={form.same_thread}
                    onChange={(e) => setForm({ ...form, same_thread: e.target.checked })}
                    className="accent-zinc-100"
                  />
                  Reply in same thread
                </label>
              </div>
            </div>
            <div className="flex items-center justify-between pt-1">
              {own && track !== "HYBRID_DEFAULT" ? (
                <Button size="sm" variant="danger" onClick={removeOverride}>
                  <Trash2 className="h-3 w-3" /> Remove override
                </Button>
              ) : (
                <span />
              )}
              <Button variant="primary" onClick={save} loading={saving} disabled={!dirty || !form.subject_template.trim() || !form.body_template.trim()}>
                <Save className="h-3.5 w-3.5" /> {inherited ? `Fork to ${track}` : "Save template"}
              </Button>
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-line p-4">
            <div className="mb-3 text-sm font-medium">Live preview</div>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(sample) as (keyof typeof sample)[]).map((k) => (
                <div key={k} className={k === "custom_icebreaker" ? "col-span-2" : ""}>
                  <Label>{k.replace(/_/g, " ")}</Label>
                  <Input className="h-8 text-xs" value={sample[k]} onChange={(e) => setSample({ ...sample, [k]: e.target.value })} />
                </div>
              ))}
            </div>
          </div>
          <div className="p-4">
            {preview.unresolved.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1">
                {preview.unresolved.map((u) => (
                  <Badge key={u} tone="rose">
                    unknown {u}
                  </Badge>
                ))}
              </div>
            )}
            <div className="mb-1 font-mono text-[10px] tracking-widest text-dim uppercase">Subject</div>
            <div className="mb-4 text-sm font-medium">{preview.subject || "—"}</div>
            <div className="rounded-md bg-white p-5 text-[#202124]">
              <div dangerouslySetInnerHTML={{ __html: preview.html }} />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

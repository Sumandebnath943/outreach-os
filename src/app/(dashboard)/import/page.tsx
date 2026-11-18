"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Papa from "papaparse";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { api, broadcastRefresh, usePoll } from "@/lib/client";
import { autoMapHeaders, LEAD_FIELDS, SAMPLE_CSV, type LeadField } from "@/lib/ingest";
import { GEO_REGIONS, ROLE_TRACKS, type ImportResponse } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge, Button, Card, Label, Select, toast } from "@/components/ui";

type Mapping = Record<string, LeadField | "full_name" | "">;

const FIELD_OPTIONS: (LeadField | "full_name")[] = [...LEAD_FIELDS, "full_name"];

export default function ImportPage() {
  const { data: history } = usePoll<{ batches: { id: string; name: string; status: string; summary: Record<string, number>; created_at: string }[]; total: number }>("/api/imports", 0);
  const [previewPage, setPreviewPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const historyPoll = usePoll<typeof history>(`/api/imports?page=${historyPage}`, 0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [geo, setGeo] = useState("AUTO");
  const [track, setTrack] = useState("AUTO");
  const [preview, setPreview] = useState<ImportResponse | null>(null);
  const [checking, setChecking] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const parse = (file: File) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
      complete: (res) => {
        const hs = (res.meta.fields ?? []).filter(Boolean);
        setFileName(file.name);
        setHeaders(hs);
        setMapping(autoMapHeaders(hs));
        setRawRows(res.data);
        setPreview(null); setPreviewPage(1);
        if (res.errors.length) toast(`${res.errors.length} CSV parse warning(s): ${res.errors[0].message}`, "info");
      },
      error: (err) => toast(err.message, "err"),
    });
  };

  const mappedRows = useMemo(
    () =>
      rawRows.map((r) => {
        const out: Record<string, string> = {};
        for (const h of headers) {
          const f = mapping[h];
          if (f && r[h] !== undefined && r[h] !== "") out[f] = r[h];
        }
        return out;
      }),
    [rawRows, headers, mapping],
  );

  const overrides = useMemo(() => ({ geo_region: geo, role_track: track }), [geo, track]);

  const check = useCallback(async () => {
    if (!mappedRows.length) return;
    setChecking(true);
    try {
      setPreview(await api<ImportResponse>("/api/leads/import", { method: "POST", json: { rows: mappedRows, overrides, dryRun: true } }));
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setChecking(false);
    }
  }, [mappedRows, overrides]);

  useEffect(() => {
    const t = setTimeout(check, 400);
    return () => clearTimeout(t);
  }, [check]);

  async function doImport() {
    setImporting(true);
    try {
      const r = await api<ImportResponse>("/api/leads/import", { method: "POST", json: { rows: mappedRows, overrides, name: fileName } });
      toast(`Imported ${r.summary.inserted} lead(s) · Touch 1 queued`);
      broadcastRefresh();
      setPreview(r);

    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setImporting(false);
    }
  }

  function downloadSample() {
    const url = URL.createObjectURL(new Blob([SAMPLE_CSV], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "outreach-os-sample.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const hasEmail = Object.values(mapping).includes("email");

  return (
    <div className="mx-auto max-w-6xl px-5 py-6">
      <div className="mb-5 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Bulk CSV Importer</h1>
          <p className="mt-1 text-sm text-dim">Headers are auto-mapped. Emails are deduplicated against the file and every existing lead (archived addresses stay locked).</p>
        </div>
        <Button size="sm" onClick={downloadSample}>
          <Download className="h-3.5 w-3.5" /> Sample CSV
        </Button>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files[0];
          if (f) parse(f);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-line bg-card px-6 py-10 text-center transition-colors hover:border-line-strong",
          dragOver && "border-zinc-400 bg-raised",
        )}
      >
        {fileName ? <FileSpreadsheet className="h-7 w-7 text-success" /> : <Upload className="h-7 w-7 text-dim" />}
        <div className="mt-3 text-sm">{fileName ? `${fileName} · ${rawRows.length} rows` : "Drop a CSV here or click to browse"}</div>
        <div className="mt-1 text-xs text-dim">Apollo, LinkedIn Sales Navigator, Clay or hand-built exports all work</div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) parse(f);
            e.target.value = "";
          }}
        />
      </div>

      {headers.length > 0 && (
        <div className="mt-6 grid gap-4 lg:grid-cols-[320px_1fr]">
          <Card className="h-fit p-4">
            <div className="mb-3 text-sm font-medium">Column mapping</div>
            <div className="space-y-2">
              {headers.map((h) => (
                <div key={h} className="grid grid-cols-[1fr_150px] items-center gap-2">
                  <span className="truncate font-mono text-[11px] text-muted" title={h}>
                    {h}
                  </span>
                  <Select
                    className="h-8 text-xs"
                    value={mapping[h] ?? ""}
                    onChange={(e) => setMapping({ ...mapping, [h]: e.target.value as Mapping[string] })}
                  >
                    <option value="">— ignore —</option>
                    {FIELD_OPTIONS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>
            {!hasEmail && <div className="mt-3 text-xs text-danger">Map a column to “email” to continue.</div>}

            <div className="mt-5 border-t border-line pt-4">
              <div className="mb-3 text-sm font-medium">Bulk overrides</div>
              <Label>Geo region</Label>
              <Select value={geo} onChange={(e) => setGeo(e.target.value)} className="mb-3">
                <option value="AUTO">Auto (from CSV / location / domain)</option>
                {GEO_REGIONS.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </Select>
              <Label>Role track</Label>
              <Select value={track} onChange={(e) => setTrack(e.target.value)}>
                <option value="AUTO">Auto (from target role opening)</option>
                {ROLE_TRACKS.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </Select>
            </div>
          </Card>

          <Card className="min-w-0 overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                {preview ? (
                  <>
                    <Badge tone="emerald">{preview.summary.new} NEW</Badge>
                    <Badge tone="amber">{preview.summary.duplicateExisting} ALREADY IN CRM</Badge>
                    <Badge>{preview.summary.duplicateInFile} DUP IN FILE</Badge>
                    <Badge tone="rose">{preview.summary.invalid} INVALID</Badge>
                  </>
                ) : (
                  <span className="text-dim">{checking ? "Checking duplicates…" : "Preview"}</span>
                )}
              </div>
              <Button variant="primary" size="sm" onClick={doImport} loading={importing} disabled={!hasEmail || !preview?.summary.new || preview.dryRun === false}>
                Import {preview?.summary.new ?? 0} lead(s)
              </Button>
            </div>
            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-card font-mono text-[10px] tracking-wider text-dim uppercase">
                  <tr className="border-b border-line">
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Company</th>
                    <th className="px-3 py-2">Geo</th>
                    <th className="px-3 py-2">Track</th>
                  </tr>
                </thead>
                <tbody>
                  {(preview?.results ?? []).slice((previewPage - 1) * 50, previewPage * 50).map((r) => {
                    const src = mappedRows[r.row - 1] ?? {};
                    return (
                      <tr key={r.row} className="border-b border-line/60">
                        <td className="px-3 py-1.5 font-mono text-dim">{r.row}</td>
                        <td className="px-3 py-1.5">
                          {r.status === "NEW" && <Badge tone="emerald">{preview?.dryRun ? "NEW" : "IMPORTED"}</Badge>}
                          {r.status === "INVALID" && <Badge tone="rose" title={r.error}>INVALID</Badge>}
                          {r.status === "DUPLICATE_IN_FILE" && <Badge>DUP · FILE</Badge>}
                          {r.status === "DUPLICATE_EXISTING" && (
                            <Badge tone="amber" title={r.stage}>
                              {r.locked ? "LOCKED" : "EXISTS"} · {r.stage}
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-1.5 font-mono">{r.status === "NEW" ? r.lead.email : r.status === "INVALID" ? <span className="text-danger">{r.error}</span> : r.email}</td>
                        <td className="px-3 py-1.5 text-muted">{r.status === "NEW" ? `${r.lead.first_name} ${r.lead.last_name ?? ""}` : src.first_name ?? src.full_name ?? ""}</td>
                        <td className="px-3 py-1.5 text-muted">{r.status === "INVALID" && preview?.dryRun ? <input aria-label={`Company for row ${r.row}`} className="rounded border border-line bg-bg p-1" defaultValue={src.company_name ?? ""} onBlur={e => { const h = headers.find(h => mapping[h] === "company_name"); if (h) setRawRows(rs => rs.map((v, idx) => idx === r.row - 1 ? { ...v, [h]: e.target.value } : v)); else toast("Map a Company column first", "info"); }} /> : r.status === "NEW" ? r.lead.company_name : src.company_name ?? ""}</td>
                        <td className="px-3 py-1.5 font-mono">{r.status === "NEW" ? r.lead.geo_region : ""}</td>
                        <td className="px-3 py-1.5 font-mono">{r.status === "NEW" ? r.lead.role_track : ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="flex items-center justify-between p-3"><Button size="sm" disabled={previewPage === 1} onClick={() => setPreviewPage(p => p - 1)}>Previous rows</Button><span>Page {previewPage} · {preview?.results.length ?? 0} rows</span><Button size="sm" disabled={previewPage * 50 >= (preview?.results.length ?? 0)} onClick={() => setPreviewPage(p => p + 1)}>Next rows</Button></div>
            </div>
          </Card>
        </div>
      )}

      {preview && <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted">
        <Button onClick={() => { const rows = preview.results.filter(r => r.status !== "NEW").map(r => ({ ...mappedRows[r.row - 1], row: r.row, reason: r.status === "INVALID" ? r.error : r.status })); const url = URL.createObjectURL(new Blob([Papa.unparse(rows, { escapeFormulae: true })], { type: "text/csv" })); const a = document.createElement("a"); a.href = url; a.download = "import-exceptions.csv"; a.click(); URL.revokeObjectURL(url); }}>Download excluded rows</Button>
        <span>{mappedRows.filter(r => !r.target_role_opening).length} without a target role · {mappedRows.filter(r => !r.custom_icebreaker).length} without an icebreaker · {mappedRows.filter(r => !r.geo_region).length} defaulted regions. Mailbox existence is not checked.</span>
      </div>}
      <section className="mt-8"><h2 className="mb-3 text-lg font-medium">Import history</h2><p className="mb-3 text-xs text-muted">Reports begin with imports made in this version. Earlier contacts remain available in Leads.</p><div className="space-y-2">{(historyPoll.data?.batches ?? history?.batches ?? []).map(b => <div key={b.id} className="flex flex-wrap items-center gap-3 rounded border border-line p-3 text-sm"><Link className="text-info" href={`/leads?batch=${b.id}`}>{b.name}</Link><span className="text-xs text-muted">{b.status} · {b.summary.total} rows · {b.summary.inserted ?? 0} imported · {new Date(b.created_at).toLocaleString()}</span><a className="ml-auto text-xs underline" href={`/api/imports?id=${b.id}`}>Excluded rows</a></div>)}</div><div className="mt-3 flex gap-2"><Button size="sm" disabled={historyPage === 1} onClick={() => setHistoryPage(p => p - 1)}>Previous imports</Button><Button size="sm" disabled={historyPage * 25 >= (historyPoll.data?.total ?? history?.total ?? 0)} onClick={() => setHistoryPage(p => p + 1)}>Next imports</Button></div></section>
      {preview && !preview.dryRun && (
        <div className="mt-4 text-sm text-success">
          Done — {preview.summary.inserted} lead(s) queued.{" "}
          <Link href="/approvals" className="underline">
            Review in the Approval Queue →
          </Link>
        </div>
      )}
    </div>
  );
}

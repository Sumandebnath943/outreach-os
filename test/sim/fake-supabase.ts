/**
 * In-memory stand-in for the parts of supabase-js / PostgREST that OutreachOS uses.
 * It enforces the schema rules the app relies on (defaults, CHECK enums, unique email,
 * foreign keys, updated_at trigger, single-row semantics) so simulations exercise the
 * real server code against realistic database behaviour.
 */
import { randomUUID } from "node:crypto";

type Row = Record<string, unknown>;
export type PgError = { message: string; code: string };
export interface PgResult {
  data: unknown;
  error: PgError | null;
  count: number | null;
  status: number;
}

const clone = <T>(v: T): T => structuredClone(v);
const nowIso = () => new Date().toISOString();

const ENUMS: Record<string, Record<string, readonly unknown[]>> = {
  leads: {
    funnel_stage: ["LEAD_QUEUED", "OUTREACH_ACTIVE", "WARM_ENGAGED", "REPLIED_TRIAGE", "INTERVIEWING", "OFFER_STAGE", "NURTURE_LATER", "CLOSED_ARCHIVE"],
    geo_region: ["INDIA", "US", "GLOBAL"],
    role_track: ["HYBRID_DEFAULT", "BRAND", "AI_PMM", "AI_PM"],
    approval_status: ["PENDING", "APPROVED", "PAUSED"],
  },
  email_logs: { status: ["QUEUED_FOR_APPROVAL", "SENT", "BOUNCED", "FAILED"] },
  tracking_events: { event_type: ["EMAIL_OPEN", "LINK_CLICK", "PORTFOLIO_VIEW", "REPLY_RECEIVED", "STAGE_CHANGE"] },
  sequence_templates: { branch_variant: ["STANDARD", "WARM", "COLD"], role_track: ["HYBRID_DEFAULT", "BRAND", "AI_PMM", "AI_PM"] },
  system_settings: { send_provider: ["GMAIL", "RESEND"], execution_mode: ["AUTO_PILOT", "APPROVAL_GATE"] },
};

const NOT_NULL: Record<string, string[]> = {
  leads: ["email", "company_name"],
  email_logs: ["lead_id", "touch_number", "subject", "body_html", "provider"],
  tracking_events: ["lead_id", "event_type"],
  sequence_templates: ["role_track", "touch_number", "subject_template", "body_template"],
};

const HAS_UPDATED_AT = new Set(["leads", "system_settings"]);

function defaults(table: string): Row {
  const now = nowIso();
  switch (table) {
    case "leads":
      return {
        id: randomUUID(), deleted_at: null, last_reply_checked_at: null, is_test: false, import_batch_id: null,
        first_name: "Team",
        last_name: null,
        job_title: null,
        linkedin_url: null,
        company_website: null,
        target_role_opening: null,
        geo_region: "INDIA",
        role_track: "HYBRID_DEFAULT",
        custom_icebreaker: null,
        funnel_stage: "LEAD_QUEUED",
        sub_stage: null,
        sequence_active: true,
        current_touch: 0,
        next_touch_due_at: null,
        approval_status: "PENDING",
        gmail_thread_id: null,
        last_message_id_header: null,
        references_header: null,
        original_subject: null,
        open_count: 0,
        click_count: 0,
        portfolio_visit_count: 0,
        portfolio_pages_viewed: [],
        last_engaged_at: null,
        replied_at: null,
        reply_snippet: null,
        reply_sentiment: null,
        reengage_at: null,
        archived_at: null,
        notes: null,
        created_at: now,
        updated_at: now,
      };
    case "import_batches":
      return { id: randomUUID(), created_at: now, summary: {}, exceptions: [], status: "IMPORTING" };
    case "email_logs":
      return {
        id: randomUUID(),
        branch_variant: "STANDARD",
        provider_message_id: null,
        rfc_message_id: null,
        gmail_thread_id: null,
        status: "SENT",
        sent_at: now,
        error: null,
      };
    case "tracking_events":
      return { id: randomUUID(), email_log_id: null, metadata: {}, created_at: now };
    case "sequence_templates":
      return { id: randomUUID(), branch_variant: "STANDARD", wait_business_days: 0, same_thread: true, created_at: now };
    default:
      return {};
  }
}

/** Value of `col`, supporting PostgREST JSON text paths like `metadata->>path`. */
function get(r: Row, col: string): unknown {
  if (col.includes("->>")) {
    const [base, key] = col.split("->>");
    const v = (r[base] as Row | null)?.[key];
    return v === undefined || v === null ? null : String(v);
  }
  return r[col];
}

function cmp(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

const isNull = (v: unknown) => v === null || v === undefined;

export class FakeSupabase {
  tables: Record<string, Row[]> = {
    import_batches: [],
    suppressed_addresses: [],
    system_settings: [],
    sequence_templates: [],
    leads: [],
    email_logs: [],
    tracking_events: [],
  };
  private failures: { table: string; op: string; times: number; message: string }[] = [];
  private seed = 20261118;

  /** Deterministic PRNG so jitter (and therefore every timeline) is reproducible. */
  random(): number {
    let t = (this.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Makes the next `times` operations of `op` on `table` fail like a dropped connection. */
  failNext(table: string, op: string, times = 1, message = "fetch failed: connection reset") {
    this.failures.push({ table, op, times, message });
  }

  takeFailure(table: string, op: string): PgError | null {
    const f = this.failures.find((x) => x.table === table && x.op === op && x.times > 0);
    if (!f) return null;
    f.times--;
    return { message: f.message, code: "08006" };
  }

  from(table: string) {
    return new FakeQuery(this, table);
  }

  validate(table: string, row: Row, self: Row | null): PgError | null {
    for (const [col, allowed] of Object.entries(ENUMS[table] ?? {})) {
      if (!isNull(row[col]) && !allowed.includes(row[col]))
        return { code: "23514", message: `new row for relation "${table}" violates check constraint "${table}_${col}_check"` };
    }
    for (const col of NOT_NULL[table] ?? []) {
      if (isNull(row[col])) return { code: "23502", message: `null value in column "${col}" of relation "${table}" violates not-null constraint` };
    }
    const others = this.tables[table].filter((r) => r !== self);
    if (table === "leads" && others.some((r) => r.email === row.email))
      return { code: "23505", message: 'duplicate key value violates unique constraint "leads_email_key"' };
    if (
      table === "sequence_templates" &&
      others.some((r) => r.role_track === row.role_track && r.touch_number === row.touch_number && r.branch_variant === row.branch_variant)
    )
      return { code: "23505", message: "duplicate key value violates unique constraint" };
    const fk = (col: string, target: string) =>
      !isNull(row[col]) && !this.tables[target].some((r) => r.id === row[col])
        ? { code: "23503", message: `insert or update on table "${table}" violates foreign key constraint "${table}_${col}_fkey"` }
        : null;
    if (table === "email_logs") return fk("lead_id", "leads");
    if (table === "tracking_events") return fk("lead_id", "leads") ?? fk("email_log_id", "email_logs");
    return null;
  }

  /** ON DELETE CASCADE / SET NULL as declared in the migrations. */
  cascade(table: string, removed: Row[]) {
    const ids = new Set(removed.map((r) => r.id));
    if (table === "leads") {
      this.tables.email_logs = this.tables.email_logs.filter((r) => !ids.has(r.lead_id));
      this.tables.tracking_events = this.tables.tracking_events.filter((r) => !ids.has(r.lead_id));
    }
    if (table === "email_logs") for (const ev of this.tables.tracking_events) if (ids.has(ev.email_log_id)) ev.email_log_id = null;
  }

  async rpc(name: string, args: Record<string, unknown>): Promise<PgResult> {
    if (name === "oos_bump_engagement") {
      const lead = this.tables.leads.find((r) => r.id === args.p_lead);
      if (!lead) return { data: [], error: null, count: null, status: 200 };
      lead.open_count = (lead.open_count as number) + Number(args.p_opens ?? 0);
      lead.click_count = (lead.click_count as number) + Number(args.p_clicks ?? 0);
      lead.portfolio_visit_count = (lead.portfolio_visit_count as number) + Number(args.p_visits ?? 0);
      const pages = (lead.portfolio_pages_viewed as string[] | null) ?? [];
      const page = args.p_page as string | null;
      if (page && !pages.includes(page) && pages.length < 100) lead.portfolio_pages_viewed = [...pages, page.slice(0, 300)];
      lead.last_engaged_at = nowIso();
      lead.updated_at = nowIso();
      return { data: [clone(lead)], error: null, count: null, status: 200 };
    }
    if (name === "oos_claim_dispatch_slot") {
      const s = this.tables.system_settings[0];
      const now = Date.now();
      if (s.next_dispatch_at && new Date(s.next_dispatch_at as string).getTime() > now) return { data: [], error: null, count: null, status: 200 };
      const min = Number(args.p_min);
      const max = Number(args.p_max);
      s.next_dispatch_at = new Date(now + (min + this.random() * Math.max(max - min, 0)) * 60_000).toISOString();
      return { data: [{ next_dispatch_at: s.next_dispatch_at }], error: null, count: null, status: 200 };
    }
    return { data: null, error: { code: "42883", message: `function ${name} does not exist` }, count: null, status: 404 };
  }
}

type Op = "select" | "insert" | "upsert" | "update" | "delete";

class FakeQuery implements PromiseLike<PgResult> {
  private op: Op = "select";
  private returning = false;
  private payload: Row | Row[] | null = null;
  private filters: ((r: Row) => boolean)[] = [];
  private orders: { col: string; asc: boolean; nullsFirst: boolean }[] = [];
  private limitN: number | null = null;
  private rangeN: [number, number] | null = null;
  private countMode = false;
  private head = false;
  private singleMode: "single" | "maybe" | null = null;
  private upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } = {};

  constructor(
    private db: FakeSupabase,
    private table: string,
  ) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.op === "select") {
      this.countMode = opts?.count === "exact";
      this.head = Boolean(opts?.head);
    } else this.returning = true;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.op = "insert";
    this.payload = rows;
    return this;
  }
  upsert(rows: Row | Row[], opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.op = "upsert";
    this.payload = rows;
    this.upsertOpts = opts;
    return this;
  }
  update(patch: Row) {
    this.op = "update";
    this.payload = patch;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }

  eq(col: string, v: unknown) {
    this.filters.push((r) => !isNull(get(r, col)) && get(r, col) === v);
    return this;
  }
  is(col: string, v: unknown) { this.filters.push(r => v === null ? isNull(get(r,col)) : get(r,col) === v); return this; }
  not(col: string, op: string, v: unknown) { this.filters.push(r => op === "is" && v === null ? !isNull(get(r,col)) : get(r,col) !== v); return this; }
  neq(col: string, v: unknown) {
    this.filters.push((r) => !isNull(get(r, col)) && get(r, col) !== v);
    return this;
  }
  in(col: string, vs: unknown[]) {
    this.filters.push((r) => vs.includes(get(r, col)));
    return this;
  }
  lt(col: string, v: unknown) {
    this.filters.push((r) => !isNull(get(r, col)) && cmp(get(r, col), v) < 0);
    return this;
  }
  lte(col: string, v: unknown) {
    this.filters.push((r) => !isNull(get(r, col)) && cmp(get(r, col), v) <= 0);
    return this;
  }
  gt(col: string, v: unknown) {
    this.filters.push((r) => !isNull(get(r, col)) && cmp(get(r, col), v) > 0);
    return this;
  }
  gte(col: string, v: unknown) {
    this.filters.push((r) => !isNull(get(r, col)) && cmp(get(r, col), v) >= 0);
    return this;
  }
  /** Only the `col.ilike.%x%` form used by the lead search. */
  or(expr: string) {
    const parts = expr.split(",").map((p) => p.match(/^(\w+)\.ilike\.%(.*)%$/));
    this.filters.push((r) => parts.some((m) => !!m && String(r[m[1]] ?? "").toLowerCase().includes(m[2].toLowerCase())));
    return this;
  }
  order(col: string, opts: { ascending?: boolean; nullsFirst?: boolean } = {}) {
    const asc = opts.ascending !== false;
    this.orders.push({ col, asc, nullsFirst: opts.nullsFirst ?? !asc });
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  range(from: number, to: number) {
    this.rangeN = [from, to];
    return this;
  }
  single() {
    this.singleMode = "single";
    return this;
  }
  maybeSingle() {
    this.singleMode = "maybe";
    return this;
  }

  then<A = PgResult, B = never>(onOk?: ((v: PgResult) => A | PromiseLike<A>) | null, onErr?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve()
      .then(() => this.exec())
      .then(onOk, onErr);
  }

  private match = (r: Row) => this.filters.every((f) => f(r));

  private sort(rows: Row[]): Row[] {
    return [...rows].sort((a, b) => {
      for (const o of this.orders) {
        const va = get(a, o.col);
        const vb = get(b, o.col);
        if (isNull(va) || isNull(vb)) {
          if (isNull(va) && isNull(vb)) continue;
          return isNull(va) === o.nullsFirst ? -1 : 1;
        }
        const c = cmp(va, vb);
        if (c !== 0) return o.asc ? c : -c;
      }
      return 0;
    });
  }

  private result(rows: Row[] | null, count: number | null = null): PgResult {
    if (this.singleMode) {
      const list = rows ?? [];
      if (list.length > 1 || (this.singleMode === "single" && list.length === 0))
        return { data: null, error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" }, count: null, status: 406 };
      return { data: list[0] ? clone(list[0]) : null, error: null, count, status: 200 };
    }
    return { data: rows ? clone(rows) : null, error: null, count, status: 200 };
  }

  private fail(error: PgError): PgResult {
    return { data: null, error, count: null, status: 400 };
  }

  private exec(): PgResult {
    const injected = this.db.takeFailure(this.table, this.op);
    if (injected) return this.fail(injected);
    const t = this.db.tables[this.table];
    if (!t) return this.fail({ code: "42P01", message: `relation "public.${this.table}" does not exist` });

    switch (this.op) {
      case "select": {
        let rows = this.sort(t.filter(this.match));
        const count = rows.length;
        if (this.rangeN) rows = rows.slice(this.rangeN[0], this.rangeN[1] + 1);
        if (this.limitN !== null) rows = rows.slice(0, this.limitN);
        rows = rows.slice(0, 1000); // PostgREST max-rows
        return this.head ? { data: null, error: null, count, status: 200 } : this.result(rows, this.countMode ? count : null);
      }
      case "insert": {
        const input = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
        const full = input.map((r) => ({ ...defaults(this.table), ...clone(r) }));
        for (let i = 0; i < full.length; i++) {
          const err = this.db.validate(this.table, full[i], null) ?? (full.slice(0, i).some((x) => this.table === "leads" && x.email === full[i].email) ? { code: "23505", message: "duplicate key" } : null);
          if (err) return this.fail(err);
        }
        t.push(...full);
        return this.result(this.returning ? full : null);
      }
      case "upsert": {
        const input = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
        const keys = (this.upsertOpts.onConflict ?? "id").split(",").map((s) => s.trim());
        const out: Row[] = [];
        for (const r of input) {
          const existing = t.find((x) => keys.every((k) => x[k] === r[k]));
          if (existing) {
            if (this.upsertOpts.ignoreDuplicates) continue;
            const next = { ...existing, ...clone(r), ...(HAS_UPDATED_AT.has(this.table) ? { updated_at: nowIso() } : {}) };
            const err = this.db.validate(this.table, next, existing);
            if (err) return this.fail(err);
            Object.assign(existing, next);
            out.push(existing);
          } else {
            const row = { ...defaults(this.table), ...clone(r) };
            const err = this.db.validate(this.table, row, null);
            if (err) return this.fail(err);
            t.push(row);
            out.push(row);
          }
        }
        return this.result(this.returning ? out : null);
      }
      case "update": {
        const matched = t.filter(this.match);
        const patch = clone(this.payload as Row);
        const nexts = matched.map((r) => ({ ...r, ...patch, ...(HAS_UPDATED_AT.has(this.table) ? { updated_at: nowIso() } : {}) }));
        for (let i = 0; i < matched.length; i++) {
          const err = this.db.validate(this.table, nexts[i], matched[i]);
          if (err) return this.fail(err);
        }
        matched.forEach((r, i) => Object.assign(r, nexts[i]));
        return this.result(this.returning ? matched : null);
      }
      case "delete": {
        const matched = t.filter(this.match);
        this.db.tables[this.table] = t.filter((r) => !matched.includes(r));
        this.db.cascade(this.table, matched);
        return this.result(this.returning ? matched : null);
      }
    }
  }
}

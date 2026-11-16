/**
 * CSV / manual lead normalisation — isomorphic so the importer can preview
 * exactly what the server will store.
 */
import { EMAIL_RE } from "./utils";
import { GEO_REGIONS, ROLE_TRACKS, type GeoRegion, type RoleTrack } from "./types";

export const LEAD_FIELDS = [
  "first_name",
  "last_name",
  "email",
  "company_name",
  "job_title",
  "linkedin_url",
  "company_website",
  "target_role_opening",
  "geo_region",
  "role_track",
  "custom_icebreaker",
  "notes",
] as const;
export type LeadField = (typeof LEAD_FIELDS)[number];

const ALIASES: Record<LeadField | "full_name", string[]> = {
  first_name: ["first name", "firstname", "first", "given name", "fname"],
  last_name: ["last name", "lastname", "last", "surname", "family name", "lname"],
  full_name: ["name", "full name", "fullname", "contact name", "contact", "person"],
  email: ["email", "email address", "work email", "e-mail", "business email", "mail", "contact email"],
  company_name: ["company", "company name", "organization", "organisation", "account", "account name", "employer"],
  job_title: ["title", "job title", "position", "designation", "role title", "headline"],
  linkedin_url: ["linkedin", "linkedin url", "linkedin profile", "person linkedin url", "profile url", "li url"],
  company_website: ["website", "company website", "domain", "company domain", "url", "company url"],
  target_role_opening: ["target role", "role opening", "open role", "opening", "role", "job opening", "target role opening", "position open"],
  geo_region: ["geo", "geo region", "region", "country", "location", "market"],
  role_track: ["track", "role track", "sequence", "persona"],
  custom_icebreaker: ["icebreaker", "custom icebreaker", "personalization", "personalisation", "first line", "opener", "hook"],
  notes: ["notes", "note", "comments"],
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Maps CSV headers → lead fields (or "full_name" for a single name column). */
export function autoMapHeaders(headers: string[]): Record<string, LeadField | "full_name" | ""> {
  const mapping: Record<string, LeadField | "full_name" | ""> = {};
  const used = new Set<string>();
  for (const h of headers) {
    const n = norm(h);
    let match: LeadField | "full_name" | "" = "";
    for (const [field, aliases] of Object.entries(ALIASES)) {
      if (used.has(field)) continue;
      if (n === norm(field) || aliases.some((a) => norm(a) === n)) {
        match = field as LeadField | "full_name";
        break;
      }
    }
    if (match) used.add(match);
    mapping[h] = match;
  }
  return mapping;
}

export function inferRoleTrack(...texts: (string | null | undefined)[]): RoleTrack {
  const t = texts.filter(Boolean).join(" ").toLowerCase();
  if (!t) return "HYBRID_DEFAULT";
  if (/product marketing|\bpmm\b|go[- ]to[- ]market|\bgtm\b/.test(t)) return "AI_PMM";
  if (/product manager|product management|\bapm\b|\bpm\b|product lead|head of product|\bcpo\b/.test(t)) return "AI_PM";
  if (/brand|marketing|growth|cmo|communications|creative/.test(t)) return "BRAND";
  return "HYBRID_DEFAULT";
}

const US_RE = /\b(us|usa|u\.s\.a?|united states|america|new york|nyc|san francisco|bay area|seattle|austin|boston|chicago|los angeles|california|texas|denver|atlanta|miami|silicon valley)\b/;
const INDIA_RE = /\b(india|bharat|bangalore|bengaluru|mumbai|delhi|new delhi|ncr|gurgaon|gurugram|noida|hyderabad|pune|chennai|kolkata|ahmedabad)\b/;

export function inferGeo(raw: string | null | undefined, email?: string, website?: string | null): GeoRegion {
  const v = (raw ?? "").trim().toUpperCase();
  if ((GEO_REGIONS as readonly string[]).includes(v)) return v as GeoRegion;
  if (v === "IN" || v === "IND" || v === "IST") return "INDIA";
  if (v === "US" || v === "USA" || v === "EST") return "US";
  const t = (raw ?? "").toLowerCase();
  if (t) {
    if (INDIA_RE.test(t)) return "INDIA";
    if (US_RE.test(t)) return "US";
    return "GLOBAL";
  }
  const domain = `${email?.split("@")[1] ?? ""} ${website ?? ""}`.toLowerCase();
  if (/\.in\b|\.co\.in\b/.test(domain)) return "INDIA";
  return "INDIA"; // schema default — primary market
}

export interface NormalizedLead {
  first_name: string;
  last_name: string | null;
  email: string;
  company_name: string;
  job_title: string | null;
  linkedin_url: string | null;
  company_website: string | null;
  target_role_opening: string | null;
  geo_region: GeoRegion;
  role_track: RoleTrack;
  custom_icebreaker: string | null;
  notes: string | null;
}

export interface NormalizeOverrides {
  geo_region?: GeoRegion | "AUTO";
  role_track?: RoleTrack | "AUTO";
}

/** Max stored length per field — keeps a malformed CSV from bloating rows or emails. */
export const FIELD_LIMITS: Record<LeadField | "full_name", number> = {
  first_name: 80,
  last_name: 80,
  full_name: 160,
  email: 254,
  company_name: 160,
  job_title: 160,
  linkedin_url: 500,
  company_website: 500,
  target_role_opening: 160,
  geo_region: 80,
  role_track: 40,
  custom_icebreaker: 600,
  notes: 5000,
};

const clean = (v: unknown, max = 500): string | null => {
  if (v === undefined || v === null) return null;
  const s = String(v).replace(/\s+/g, " ").trim().slice(0, max).trim();
  return s ? s : null;
};

/** Multi-line free text (notes): keeps line breaks, trims and caps length. */
export function cleanMultiline(v: unknown, max: number): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).replace(/\r\n/g, "\n").trim().slice(0, max).trim();
  return s ? s : null;
}

/**
 * Accepts only http(s) URLs (bare domains get https://). Anything else — including
 * `javascript:` and `data:` — is dropped, because these values are rendered as links.
 */
export function sanitizeUrl(v: unknown): string | null {
  const s = clean(v, 500);
  if (!s) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s.replace(/^\/+/, "")}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function companyFromEmail(email: string): string | null {
  const domain = email.split("@")[1];
  if (!domain || /gmail|yahoo|outlook|hotmail|icloud|proton|rediff/.test(domain)) return null;
  const root = domain.split(".")[0];
  return root.charAt(0).toUpperCase() + root.slice(1);
}

/** Returns a normalised lead or an error string. Input keys are lead field names (already mapped). */
export function normalizeLead(
  input: Partial<Record<LeadField | "full_name", unknown>>,
  overrides: NormalizeOverrides = {},
): { ok: true; lead: NormalizedLead } | { ok: false; error: string } {
  const L = FIELD_LIMITS;
  const email = clean(input.email, L.email)?.toLowerCase().replace(/^mailto:/, "") ?? "";
  if (!email) return { ok: false, error: "Missing email" };
  if (!EMAIL_RE.test(email)) return { ok: false, error: `Invalid email "${email}"` };

  let first = clean(input.first_name, L.first_name);
  let last = clean(input.last_name, L.last_name);
  const full = clean(input.full_name, L.full_name);
  if (!first && full) {
    const parts = full.split(" ");
    first = parts.shift()?.slice(0, L.first_name) ?? null;
    last = last ?? (parts.join(" ").slice(0, L.last_name) || null);
  }

  const company = clean(input.company_name, L.company_name) ?? companyFromEmail(email);
  if (!company) return { ok: false, error: "Missing company name" };

  const jobTitle = clean(input.job_title, L.job_title);
  const roleOpening = clean(input.target_role_opening, L.target_role_opening);
  const website = sanitizeUrl(input.company_website);

  const rawTrack = clean(input.role_track, L.role_track)?.toUpperCase().replace(/[\s-]+/g, "_");
  let track: RoleTrack =
    rawTrack && (ROLE_TRACKS as readonly string[]).includes(rawTrack) ? (rawTrack as RoleTrack) : inferRoleTrack(roleOpening);
  if (overrides.role_track && (ROLE_TRACKS as readonly string[]).includes(overrides.role_track)) track = overrides.role_track as RoleTrack;

  let geo = inferGeo(clean(input.geo_region, L.geo_region), email, website);
  if (overrides.geo_region && (GEO_REGIONS as readonly string[]).includes(overrides.geo_region)) geo = overrides.geo_region as GeoRegion;

  return {
    ok: true,
    lead: {
      first_name: first ? first.charAt(0).toUpperCase() + first.slice(1) : "Team",
      last_name: last,
      email,
      company_name: company,
      job_title: jobTitle,
      linkedin_url: sanitizeUrl(input.linkedin_url),
      company_website: website,
      target_role_opening: roleOpening,
      geo_region: geo,
      role_track: track,
      custom_icebreaker: clean(input.custom_icebreaker, L.custom_icebreaker),
      notes: cleanMultiline(input.notes, L.notes),
    },
  };
}

export const SAMPLE_CSV = `first_name,last_name,email,company_name,job_title,linkedin_url,company_website,target_role_opening,geo_region,role_track,custom_icebreaker
Priya,Sharma,priya.sharma@example.in,Acme AI,Head of Talent,https://linkedin.com/in/priyasharma,https://acme.ai,Senior Brand Marketing Manager,INDIA,BRAND,Loved Acme's recent launch film for the GenAI suite.
Jordan,Lee,jordan@example.com,Nimbus Labs,VP Product,https://linkedin.com/in/jordanlee,https://nimbus.dev,AI Product Manager,US,AI_PM,
Alex,,alex@example.co,Orbit,Recruiter,,,AI Product Marketing Manager,London,,
`;

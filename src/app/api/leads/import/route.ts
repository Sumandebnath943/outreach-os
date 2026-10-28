import { NextRequest, NextResponse } from 'next/server';
import {
  createLead,
  getGlobalKPIs,
  getLeads,
  inferGeoRegion,
  inferRoleTrack,
} from '@/lib/db';
import { GeoRegion, Lead, RoleTrack } from '@/types/outreach';

interface RawCsvRow {
  first_name?: string;
  last_name?: string;
  email?: string;
  company_name?: string;
  job_title?: string;
  linkedin_url?: string;
  company_website?: string;
  target_role_opening?: string;
  geo_region?: string;
  role_track?: string;
  custom_icebreaker?: string;
  notes?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rows: RawCsvRow[] = Array.isArray(body.rows) ? body.rows : [];
    const overrideGeo: GeoRegion | 'AUTO' = body.overrideGeo || 'AUTO';
    const overrideTrack: RoleTrack | 'AUTO' = body.overrideTrack || 'AUTO';

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'No CSV rows provided for import.' },
        { status: 400 }
      );
    }

    const existingLeads = await getLeads();
    const existingEmailSet = new Set(
      existingLeads.map((l) => l.email.trim().toLowerCase())
    );
    const seenInBatch = new Set<string>();

    const imported: Lead[] = [];
    const skippedDuplicates: { email: string; company: string; reason: string }[] = [];
    const invalidRows: { rowNumber: number; email: string; reason: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rawEmail = (r.email || '').trim().toLowerCase();
      const companyName = (r.company_name || '').trim();

      if (!rawEmail || !EMAIL_REGEX.test(rawEmail)) {
        invalidRows.push({
          rowNumber: i + 1,
          email: rawEmail || '(empty)',
          reason: 'Invalid or missing email syntax',
        });
        continue;
      }

      if (!companyName) {
        invalidRows.push({
          rowNumber: i + 1,
          email: rawEmail,
          reason: 'Missing company_name',
        });
        continue;
      }

      if (existingEmailSet.has(rawEmail)) {
        skippedDuplicates.push({
          email: rawEmail,
          company: companyName,
          reason: 'Already exists in OutreachOS database (or locked in Archive)',
        });
        continue;
      }

      if (seenInBatch.has(rawEmail)) {
        skippedDuplicates.push({
          email: rawEmail,
          company: companyName,
          reason: 'Duplicate email within uploaded CSV file',
        });
        continue;
      }

      seenInBatch.add(rawEmail);

      const resolvedGeo: GeoRegion =
        overrideGeo !== 'AUTO'
          ? overrideGeo
          : inferGeoRegion(r.geo_region, rawEmail, r.company_website);

      const resolvedTrack: RoleTrack =
        overrideTrack !== 'AUTO'
          ? overrideTrack
          : inferRoleTrack(r.role_track, r.target_role_opening, r.job_title);

      try {
        const created = await createLead({
          first_name: (r.first_name || '').trim() || 'Team',
          last_name: r.last_name?.trim() || null,
          email: rawEmail,
          company_name: companyName,
          job_title: r.job_title?.trim() || null,
          linkedin_url: r.linkedin_url?.trim() || null,
          company_website: r.company_website?.trim() || null,
          target_role_opening: r.target_role_opening?.trim() || null,
          geo_region: resolvedGeo,
          role_track: resolvedTrack,
          custom_icebreaker: r.custom_icebreaker?.trim() || null,
          notes: r.notes?.trim() || null,
        });
        imported.push(created);
        existingEmailSet.add(rawEmail);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Database insert error';
        invalidRows.push({
          rowNumber: i + 1,
          email: rawEmail,
          reason: msg,
        });
      }
    }

    const kpis = await getGlobalKPIs();

    return NextResponse.json({
      importedCount: imported.length,
      skippedDuplicatesCount: skippedDuplicates.length,
      invalidRowsCount: invalidRows.length,
      imported,
      skippedDuplicates,
      invalidRows,
      kpis,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Bulk CSV import failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

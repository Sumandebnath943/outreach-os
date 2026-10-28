import { NextRequest, NextResponse } from 'next/server';
import {
  createLead,
  deleteLead,
  getGlobalKPIs,
  getLeads,
  updateLead,
} from '@/lib/db';
import { FunnelStage, GeoRegion, RoleTrack } from '@/types/outreach';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const stage = (searchParams.get('stage') || 'ALL') as FunnelStage | 'ALL';
    const geo_region = (searchParams.get('geo_region') || 'ALL') as GeoRegion | 'ALL';
    const role_track = (searchParams.get('role_track') || 'ALL') as RoleTrack | 'ALL';
    const search = searchParams.get('search') || '';

    const [leads, kpis] = await Promise.all([
      getLeads({ stage, geo_region, role_track, search }),
      getGlobalKPIs(),
    ]);

    return NextResponse.json({ leads, kpis });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch leads';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.email || !body.company_name) {
      return NextResponse.json(
        { error: 'Email and Company Name are required.' },
        { status: 400 }
      );
    }

    const lead = await createLead({
      first_name: body.first_name,
      last_name: body.last_name,
      email: body.email,
      company_name: body.company_name,
      job_title: body.job_title,
      linkedin_url: body.linkedin_url,
      company_website: body.company_website,
      target_role_opening: body.target_role_opening,
      geo_region: body.geo_region,
      role_track: body.role_track,
      custom_icebreaker: body.custom_icebreaker,
      notes: body.notes,
    });

    const kpis = await getGlobalKPIs();
    return NextResponse.json({ lead, kpis }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create lead';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...patch } = body;

    if (!id) {
      return NextResponse.json({ error: 'Lead id is required' }, { status: 400 });
    }

    const updated = await updateLead(id, patch);
    const kpis = await getGlobalKPIs();
    return NextResponse.json({ lead: updated, kpis });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update lead';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Lead id is required' }, { status: 400 });
    }
    await deleteLead(id);
    const kpis = await getGlobalKPIs();
    return NextResponse.json({ deleted: true, kpis });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete lead';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

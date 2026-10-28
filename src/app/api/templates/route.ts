import { NextRequest, NextResponse } from 'next/server';
import { getSequenceTemplates, upsertSequenceTemplate } from '@/lib/db';
import { SEED_SEQUENCE_TEMPLATES } from '@/lib/seed-templates';

export async function GET() {
  try {
    const templates = await getSequenceTemplates();
    return NextResponse.json({ templates });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load templates';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();

    // Support resetting a single template or all templates to verified PRD defaults
    if (body.action === 'RESET_DEFAULT') {
      const seedMatch = SEED_SEQUENCE_TEMPLATES.find(
        (t) =>
          t.role_track === body.role_track &&
          t.touch_number === body.touch_number &&
          t.branch_variant === body.branch_variant
      );
      if (!seedMatch) {
        return NextResponse.json({ error: 'Default seed template not found' }, { status: 404 });
      }
      const saved = await upsertSequenceTemplate(seedMatch);
      const templates = await getSequenceTemplates();
      return NextResponse.json({ template: saved, templates });
    }

    const saved = await upsertSequenceTemplate({
      role_track: body.role_track,
      touch_number: body.touch_number,
      branch_variant: body.branch_variant || 'STANDARD',
      subject_template: body.subject_template,
      body_template: body.body_template,
      wait_business_days: Number(body.wait_business_days ?? 0),
      same_thread: Boolean(body.same_thread ?? body.touch_number > 1),
    });

    const templates = await getSequenceTemplates();
    return NextResponse.json({ template: saved, templates });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update template';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

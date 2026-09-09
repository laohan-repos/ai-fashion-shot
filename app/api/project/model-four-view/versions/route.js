import { NextResponse } from 'next/server';
import { listProjectModelViewVersions } from '../../../../../lib/assets-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const projectKey = new URL(request.url).searchParams.get('projectKey') || 'autumn-commute';
  const versions = listProjectModelViewVersions(projectKey);
  if (!versions) return NextResponse.json({ error: '四视图合成图不存在' }, { status: 404 });
  return NextResponse.json({ versions });
}


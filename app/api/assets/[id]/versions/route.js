import { NextResponse } from 'next/server';
import { listAssetVersions } from '../../../../../lib/assets-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const versions = listAssetVersions(Number(params.id));
  if (!versions) return NextResponse.json({ error: '素材不存在' }, { status: 404 });
  return NextResponse.json({ versions });
}


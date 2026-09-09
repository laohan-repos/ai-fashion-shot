import { NextResponse } from 'next/server';
import { deleteProjectModelViewVersion } from '../../../../../../lib/assets-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(request, { params }) {
  const projectKey = new URL(request.url).searchParams.get('projectKey') || 'autumn-commute';
  const versionId = Number(params.versionId);
  if (!Number.isInteger(versionId) || versionId <= 0) {
    return NextResponse.json({ error: '无效的版本编号' }, { status: 400 });
  }
  if (!deleteProjectModelViewVersion(projectKey, versionId)) {
    return NextResponse.json({ error: '版本不存在或已被删除' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}

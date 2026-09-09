import { NextResponse } from 'next/server';
import { createAsset, deleteAsset, listAssets } from '../../../lib/assets-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const validTypes = new Set(['模特', '服装']);

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const groupId = Number(params.get('groupId'));
  const assetType = params.get('type');
  if (!groupId || !validTypes.has(assetType)) return NextResponse.json({ error: '素材查询参数无效' }, { status: 400 });
  return NextResponse.json({ assets: listAssets(groupId, assetType) });
}

export async function POST(request) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    const groupId = Number(form.get('groupId'));
    const assetType = form.get('assetType');
    if (!(file instanceof File) || !groupId || !validTypes.has(assetType)) return NextResponse.json({ error: '上传信息不完整' }, { status: 400 });
    if (!file.type.startsWith('image/')) return NextResponse.json({ error: '只支持图片文件' }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: '单张图片不能超过 10MB' }, { status: 413 });
    const asset = createAsset({ groupId, assetType, name: file.name.replace(/\.[^.]+$/, ''), mimeType: file.type, imageData: Buffer.from(await file.arrayBuffer()) });
    return NextResponse.json({ asset });
  } catch (error) {
    return NextResponse.json({ error: error.message === 'GROUP_NOT_FOUND' ? '素材分组不存在' : '图片上传失败' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: '素材 ID 无效' }, { status: 400 });
  return NextResponse.json({ deleted: deleteAsset(Number(id)) });
}


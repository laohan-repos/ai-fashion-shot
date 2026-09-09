import { NextResponse } from 'next/server';
import { createGroup, deleteGroup, listGroups, renameGroup } from '../../../../lib/assets-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const validTypes = new Set(['搭配']);

export async function GET(request) {
  const assetType = new URL(request.url).searchParams.get('type');
  if (!validTypes.has(assetType)) return NextResponse.json({ error: '无效的素材类型' }, { status: 400 });
  return NextResponse.json({ groups: listGroups(assetType) });
}

export async function POST(request) {
  try {
    const { assetType, name } = await request.json();
    if (!validTypes.has(assetType) || !name?.trim()) return NextResponse.json({ error: '分组信息不完整' }, { status: 400 });
    return NextResponse.json({ group: createGroup(assetType, name.trim()) });
  } catch (error) {
    const duplicate = String(error).includes('UNIQUE constraint failed');
    return NextResponse.json({ error: duplicate ? '该分组名称已存在' : '创建分组失败' }, { status: duplicate ? 409 : 500 });
  }
}

export async function PATCH(request) {
  try {
    const { id, assetType, name } = await request.json();
    if (!id || !validTypes.has(assetType) || !name?.trim()) return NextResponse.json({ error: '分组信息不完整' }, { status: 400 });
    return NextResponse.json({ group: renameGroup(Number(id), assetType, name.trim()) });
  } catch (error) {
    const duplicate = String(error).includes('UNIQUE constraint failed');
    return NextResponse.json({ error: duplicate ? '该分组名称已存在' : '修改分组失败' }, { status: duplicate ? 409 : 500 });
  }
}

export async function DELETE(request) {
  const body = await request.json();
  if (!body.id || !validTypes.has(body.assetType)) return NextResponse.json({ error: '分组信息不完整' }, { status: 400 });
  return NextResponse.json({ deleted: deleteGroup(Number(body.id), body.assetType) });
}

import { NextResponse } from 'next/server';
import { createProject, deleteProject, getProject, listProjects, setProjectGroup, updateProject } from '../../../lib/projects-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const id = new URL(request.url).searchParams.get('id');
  if (id) {
    const project = getProject(id);
    if (!project) return NextResponse.json({ error: '项目不存在' }, { status: 404 });
    return NextResponse.json({ project });
  }
  return NextResponse.json({ projects: listProjects() });
}

export async function POST(request) {
  try {
    const { name, description = '', groupId = null } = await request.json();
    if (!name?.trim()) return NextResponse.json({ error: '请输入项目名称' }, { status: 400 });
    return NextResponse.json({ project: createProject(name.trim().slice(0, 40), description.trim().slice(0, 120), groupId) }, { status: 201 });
  } catch {
    return NextResponse.json({ error: '新建项目失败' }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const { id, name, description = '', groupId } = await request.json();
    if (id && groupId !== undefined && !name) {
      const project = setProjectGroup(id, groupId);
      if (!project) return NextResponse.json({ error: '作品或素材组不存在' }, { status: 404 });
      return NextResponse.json({ project });
    }
    if (!id || !name?.trim()) return NextResponse.json({ error: '项目名称不能为空' }, { status: 400 });
    const project = updateProject(id, name.trim().slice(0, 40), description.trim().slice(0, 120));
    if (!project) return NextResponse.json({ error: '项目不存在' }, { status: 404 });
    return NextResponse.json({ project });
  } catch {
    return NextResponse.json({ error: '修改项目失败' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: '缺少项目 ID' }, { status: 400 });
    if (!deleteProject(id)) return NextResponse.json({ error: '项目不存在' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: '删除项目失败' }, { status: 500 });
  }
}

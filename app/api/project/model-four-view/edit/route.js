import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createProjectModelViewVersion, getProjectModelViewForEdit } from '../../../../../lib/assets-db';
import { getModelConnection } from '../../../../../lib/model-config-db';
import { touchProject } from '../../../../../lib/projects-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function editEndpoint(configuredUrl) {
  const url = new URL(configuredUrl);
  if (/\/images\/edits\/?$/.test(url.pathname)) return url.toString();
  url.pathname = `${url.pathname.replace(/\/$/, '')}/images/edits`;
  return url.toString();
}

async function imageBuffer(result, apiKey) {
  if (result.b64_json) return Buffer.from(result.b64_json, 'base64');
  if (result.url) {
    const response = await fetch(result.url, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error('编辑成功，但图片下载失败');
    return Buffer.from(await response.arrayBuffer());
  }
  throw new Error('模型没有返回图片数据');
}

export async function POST(request) {
  try {
    const { projectKey = 'autumn-commute', prompt, sourceVersionId = 'original' } = await request.json();
    if (!prompt?.trim()) return NextResponse.json({ error: '请输入四视图修改提示词' }, { status: 400 });
    const selectedSource = sourceVersionId === 'original' ? 'original' : Number(sourceVersionId);
    const source = getProjectModelViewForEdit(projectKey, selectedSource);
    if (!source) return NextResponse.json({ error: '四视图合成图不存在' }, { status: 404 });
    const config = getModelConnection('gpt-image-2');
    if (!config?.enabled || !config.apiKey) return NextResponse.json({ error: '请先完成并启用 GPT Image 2 图生图配置' }, { status: 400 });

    const fullPrompt = `编辑这张模特四视图合成图。必须保持一张横向四联图的结构，从左到右仍然是正面、左侧面、右侧面、背面；保持四个面板中的人物身份、脸型、发型、体型、人物大小、脚底基线和摄影棚背景一致。只修改用户明确要求的内容，其他部分保持不变。用户要求：${prompt.trim()}`;
    const form = new FormData();
    form.append('model', config.modelName);
    form.append('prompt', fullPrompt);
    form.append('size', '1536x1024');
    form.append('quality', 'high');
    form.append('n', '1');
    form.append('image[]', new Blob([source.imageData], { type: source.mimeType }), 'model-four-view.png');
    const response = await fetch(editEndpoint(config.baseUrl), { method: 'POST', headers: { Authorization: `Bearer ${config.apiKey}` }, body: form, signal: AbortSignal.timeout(180000) });
    let payload;
    try { payload = await response.json(); } catch { payload = null; }
    if (!response.ok || !payload?.data?.[0]) throw new Error(`四视图编辑失败：${payload?.error?.message || payload?.message || `HTTP ${response.status}`}`);
    const imageData = await imageBuffer(payload.data[0], config.apiKey);
    const version = createProjectModelViewVersion({ projectKey, prompt: prompt.trim(), mimeType: 'image/png', imageData });
    touchProject(projectKey);

    const archiveDirectory = path.join(process.cwd(), 'data', 'gpt-image2-results', `${new Date().toISOString().replace(/[:.]/g, '-')}-four-view-edit`);
    mkdirSync(archiveDirectory, { recursive: true });
    writeFileSync(path.join(archiveDirectory, 'request.json'), JSON.stringify({ model: config.modelName, prompt: fullPrompt, sourceVersionId, size: '1536x1024', quality: 'high' }, null, 2));
    writeFileSync(path.join(archiveDirectory, 'response-raw.json'), JSON.stringify(payload, null, 2));
    writeFileSync(path.join(archiveDirectory, 'edited-output.png'), imageData);
    writeFileSync(path.join(archiveDirectory, 'response-summary.json'), JSON.stringify({ model: payload.model || config.modelName, revisedPrompt: payload.data[0]?.revised_prompt || '', usage: payload.usage || null }, null, 2));
    writeFileSync(path.join(archiveDirectory, 'metadata.json'), JSON.stringify({ bytes: imageData.length, sha256: createHash('sha256').update(imageData).digest('hex') }, null, 2));
    return NextResponse.json({ version, revisedPrompt: payload.data[0]?.revised_prompt || '', usage: payload.usage || null });
  } catch (error) {
    const message = error?.name === 'TimeoutError' ? '四视图编辑超时，请稍后重试' : (error.message || '四视图编辑失败');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

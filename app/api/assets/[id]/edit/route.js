import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createAssetVersion, getAssetForEdit } from '../../../../../lib/assets-db';
import { getModelConnection } from '../../../../../lib/model-config-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function editEndpoint(configuredUrl) {
  const url = new URL(configuredUrl);
  if (/\/images\/edits\/?$/.test(url.pathname)) return url.toString();
  url.pathname = `${url.pathname.replace(/\/$/, '')}/images/edits`;
  return url.toString();
}

async function outputBuffer(result, apiKey) {
  if (result.b64_json) return Buffer.from(result.b64_json, 'base64');
  if (result.url) {
    const response = await fetch(result.url, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error('编辑成功，但图片下载失败');
    return Buffer.from(await response.arrayBuffer());
  }
  throw new Error('模型没有返回图片数据');
}

function pngDimensions(buffer) {
  if (buffer.length >= 24 && buffer.subarray(1, 4).toString() === 'PNG') {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  return { width: null, height: null };
}

export async function POST(request, { params }) {
  try {
    const { prompt, size = '1024x1536', sourceVersionId = null } = await request.json();
    const selectedSource = sourceVersionId === 'original' ? 'original' : sourceVersionId ? Number(sourceVersionId) : null;
    const source = getAssetForEdit(Number(params.id), selectedSource);
    if (!source || !['模特', '服装'].includes(source.assetType)) return NextResponse.json({ error: '未找到可编辑的素材图片' }, { status: 404 });
    if (!prompt?.trim()) return NextResponse.json({ error: '请输入图片修改提示词' }, { status: 400 });
    const config = getModelConnection('gpt-image-2');
    if (!config?.enabled) return NextResponse.json({ error: 'GPT Image 2 图生图当前未启用' }, { status: 400 });
    if (!config.apiKey || !config.baseUrl || !config.modelName) return NextResponse.json({ error: '请先完成 GPT Image 2 图生图连接配置' }, { status: 400 });

    const form = new FormData();
    form.append('model', config.modelName);
    form.append('prompt', prompt.trim());
    form.append('size', size);
    form.append('quality', 'high');
    form.append('n', '1');
    form.append('image[]', new Blob([source.imageData], { type: source.mimeType }), `${source.name}.png`);

    const response = await fetch(editEndpoint(config.baseUrl), { method: 'POST', headers: { Authorization: `Bearer ${config.apiKey}` }, body: form, signal: AbortSignal.timeout(180000) });
    let payload;
    try { payload = await response.json(); } catch { payload = null; }
    if (!response.ok) {
      const detail = payload?.error?.message || payload?.message || `HTTP ${response.status}`;
      return NextResponse.json({ error: `编辑失败：${detail}` }, { status: 502 });
    }
    if (!payload?.data?.[0]) return NextResponse.json({ error: '模型未返回编辑图片' }, { status: 502 });

    const imageData = await outputBuffer(payload.data[0], config.apiKey);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const version = createAssetVersion({ assetId: source.id, prompt: prompt.trim(), mimeType: 'image/png', imageData });

    const archiveDirectory = path.join(process.cwd(), 'data', 'gpt-image2-results', `${timestamp}-asset-${source.id}`);
    mkdirSync(archiveDirectory, { recursive: true });
    const outputPath = path.join(archiveDirectory, 'edited-output.png');
    writeFileSync(path.join(archiveDirectory, 'request.json'), JSON.stringify({ model: config.modelName, prompt: prompt.trim(), sourceAssetId: source.id, size, quality: 'high', n: 1 }, null, 2));
    writeFileSync(path.join(archiveDirectory, 'response-raw.json'), JSON.stringify(payload, null, 2));
    writeFileSync(outputPath, imageData);
    const dimensions = pngDimensions(imageData);
    writeFileSync(path.join(archiveDirectory, 'response-summary.json'), JSON.stringify({ created: payload.created, model: payload.model || config.modelName, revisedPrompt: payload.data[0]?.revised_prompt || '', usage: payload.usage || null, outputPath }, null, 2));
    writeFileSync(path.join(archiveDirectory, 'metadata.json'), JSON.stringify({ ...dimensions, bytes: imageData.length, sha256: createHash('sha256').update(imageData).digest('hex'), sourceAssetId: source.id }, null, 2));

    return NextResponse.json({ version, revisedPrompt: payload.data[0]?.revised_prompt || '', usage: payload.usage || null });
  } catch (error) {
    const message = error?.name === 'TimeoutError' ? '编辑超时，请稍后重试' : (error.message || '图片编辑失败');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

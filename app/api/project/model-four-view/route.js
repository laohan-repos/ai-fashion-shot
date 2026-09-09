import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getAssetForEdit, listProjectModelViews, replaceProjectModelSheet } from '../../../../lib/assets-db';
import { getModelConnection } from '../../../../lib/model-config-db';
import { touchProject } from '../../../../lib/projects-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const builtInPrompt = '根据全部参考图片提取并锁定同一个人物身份，生成一张横向四视图合成图。画面必须划分为四个等宽竖向面板，从左到右依次为：正面、左侧面、右侧面、背面。四个面板中必须是同一个人，严格保持五官、脸型、发型、发色、肤色、年龄感、身高比例、肩宽、腰臀比例和腿型一致。参考图片只用于确认人物身份与体型，忽略背景、光线和服装差异。模特统一穿无图案的纯黑色贴身短袖上衣、纯黑色贴身及膝短裤和简洁白色平底鞋，不佩戴首饰，不携带包袋。四个视图都自然站立、双手自然下垂、双脚平行、表情自然放松；相机高度、焦距、人物尺寸、脚底基线和头顶高度完全一致。纯白无缝摄影棚背景，均匀柔和布光，每个视图都从头顶到鞋底完整入镜，不裁切身体。只输出这一张四联视图合成图，不要额外人物、文字、标题、水印或装饰边框。';

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
    if (!response.ok) throw new Error('生成成功，但四视图图片下载失败');
    return Buffer.from(await response.arrayBuffer());
  }
  throw new Error('模型没有返回图片数据');
}

export async function GET(request) {
  const projectKey = new URL(request.url).searchParams.get('projectKey') || 'autumn-commute';
  return NextResponse.json({ views: listProjectModelViews(projectKey) });
}

export async function POST(request) {
  try {
    const { projectKey = 'autumn-commute', assetIds = [], customPrompt = '' } = await request.json();
    const selectedIds = [...new Set(assetIds.map(Number).filter(Boolean))].slice(0, 4);
    if (selectedIds.length === 0) return NextResponse.json({ error: '请至少选择一张模特参考图' }, { status: 400 });
    const sources = selectedIds.map(id => getAssetForEdit(id)).filter(source => source?.assetType === '模特');
    if (sources.length !== selectedIds.length) return NextResponse.json({ error: '部分模特参考图不存在' }, { status: 400 });
    const config = getModelConnection('gpt-image-2');
    if (!config?.enabled || !config.apiKey) return NextResponse.json({ error: '请先完成并启用 GPT Image 2 图生图配置' }, { status: 400 });

    const archiveRoot = path.join(process.cwd(), 'data', 'gpt-image2-results', `${new Date().toISOString().replace(/[:.]/g, '-')}-four-view-sheet`);
    const sharedPrompt = customPrompt.trim() || builtInPrompt;
    const form = new FormData();
    form.append('model', config.modelName);
    form.append('prompt', sharedPrompt);
    form.append('size', '1536x1024');
    form.append('quality', 'high');
    form.append('n', '1');
    sources.forEach(source => form.append('image[]', new Blob([source.imageData], { type: source.mimeType }), `${source.name}.png`));
    const response = await fetch(editEndpoint(config.baseUrl), { method: 'POST', headers: { Authorization: `Bearer ${config.apiKey}` }, body: form, signal: AbortSignal.timeout(180000) });
    let payload;
    try { payload = await response.json(); } catch { payload = null; }
    if (!response.ok || !payload?.data?.[0]) throw new Error(`四视图生成失败：${payload?.error?.message || payload?.message || `HTTP ${response.status}`}`);
    const imageData = await imageBuffer(payload.data[0], config.apiKey);
    const saved = replaceProjectModelSheet({ projectKey, prompt: sharedPrompt, sourceAssetIds: selectedIds, mimeType: 'image/png', imageData });
    touchProject(projectKey);
    mkdirSync(archiveRoot, { recursive: true });
    writeFileSync(path.join(archiveRoot, 'request.json'), JSON.stringify({ model: config.modelName, prompt: sharedPrompt, sourceAssetIds: selectedIds, size: '1536x1024', quality: 'high' }, null, 2));
    writeFileSync(path.join(archiveRoot, 'response-raw.json'), JSON.stringify(payload, null, 2));
    writeFileSync(path.join(archiveRoot, 'edited-output.png'), imageData);
    writeFileSync(path.join(archiveRoot, 'metadata.json'), JSON.stringify({ bytes: imageData.length, sha256: createHash('sha256').update(imageData).digest('hex') }, null, 2));
    return NextResponse.json({ views: [saved] });
  } catch (error) {
    const message = error?.name === 'TimeoutError' ? '四视图生成超时，请稍后重试' : (error.message || '生成模特四视图失败');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { getAssetForEdit, listProjectClothingWhiteImages, replaceProjectClothingWhiteImage } from '../../../../lib/assets-db';
import { getModelConnection } from '../../../../lib/model-config-db';
import { touchProject } from '../../../../lib/projects-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const builtInPrompt = '根据全部参考图片生成一张 3:4 竖版的完整服装搭配白底图。每张参考图中的主体服装或时尚单品都必须在最终图片中出现一次，不能遗漏、重复，也不能把不同服装融合成新款。严格保持每件单品原有的品类、版型、长度、比例、颜色、面料纹理、图案、领型、袖型、纽扣、拉链、口袋、缝线和装饰细节，不得改款或增加不存在的设计。去除原图中的人物、皮肤、手、衣架、模特轮廓、原背景和无关物品。将所有单品按照一套完整穿搭自然排列：上衣位于上方，下装位于下方，鞋子位于底部，配饰放在侧边；各单品相互独立、间距均匀、不得遮挡，整体居中且全部完整入镜。使用纯白无缝背景（#FFFFFF）、均匀柔和的商业摄影光线和轻微自然阴影，边缘清晰，颜色准确。只输出这一张服装搭配白底图，不要模特、人体、文字、标题、尺寸线、水印或装饰边框。';

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
    if (!response.ok) throw new Error('生成成功，但白底图下载失败');
    return Buffer.from(await response.arrayBuffer());
  }
  throw new Error('模型没有返回图片数据');
}

export async function GET(request) {
  const projectKey = new URL(request.url).searchParams.get('projectKey') || 'autumn-commute';
  return NextResponse.json({ images: listProjectClothingWhiteImages(projectKey) });
}

export async function POST(request) {
  try {
    const { projectKey = 'autumn-commute', assetIds = [], customPrompt = '' } = await request.json();
    const selectedIds = [...new Set(assetIds.map(Number).filter(Boolean))].slice(0, 6);
    if (selectedIds.length === 0) return NextResponse.json({ error: '请至少选择一张服装参考图' }, { status: 400 });
    const sources = selectedIds.map(id => getAssetForEdit(id)).filter(source => source?.assetType === '服装');
    if (sources.length !== selectedIds.length) return NextResponse.json({ error: '部分服装参考图不存在' }, { status: 400 });
    const config = getModelConnection('gpt-image-2');
    if (!config?.enabled || !config.apiKey) return NextResponse.json({ error: '请先完成并启用 GPT Image 2 图生图配置' }, { status: 400 });

    const prompt = customPrompt.trim() || builtInPrompt;
    const sourceAssetNames = sources.map(source => source.name);
    const archiveDirectory = path.join(process.cwd(), 'data', 'gpt-image2-results', `${new Date().toISOString().replace(/[:.]/g, '-')}-clothing-white-sheet`);
    mkdirSync(archiveDirectory, { recursive: true });
    writeFileSync(path.join(archiveDirectory, 'request.json'), JSON.stringify({ model: config.modelName, prompt, sourceAssetIds: selectedIds, sourceAssetNames, requestedSize: '1024x1536', finalSize: '1152x1536', finalRatio: '3:4', quality: 'high', n: 1 }, null, 2));

    const form = new FormData();
    form.append('model', config.modelName);
    form.append('prompt', prompt);
    form.append('size', '1024x1536');
    form.append('quality', 'high');
    form.append('n', '1');
    sources.forEach(source => form.append('image[]', new Blob([source.imageData], { type: source.mimeType }), `${source.name}.png`));
    const response = await fetch(editEndpoint(config.baseUrl), { method: 'POST', headers: { Authorization: `Bearer ${config.apiKey}` }, body: form, signal: AbortSignal.timeout(180000) });
    let payload;
    try { payload = await response.json(); } catch { payload = null; }
    if (!response.ok || !payload?.data?.[0]) throw new Error(`服装搭配白底图生成失败：${payload?.error?.message || payload?.message || `HTTP ${response.status}`}`);
    const modelImageData = await imageBuffer(payload.data[0], config.apiKey);
    const modelOutputPath = path.join(archiveDirectory, 'model-output.png');
    const finalOutputPath = path.join(archiveDirectory, 'edited-output.png');
    writeFileSync(modelOutputPath, modelImageData);
    execFileSync('magick', [modelOutputPath, '-background', '#FFFFFF', '-gravity', 'center', '-extent', '1152x1536', finalOutputPath], { timeout: 30000, stdio: 'pipe' });
    const imageData = readFileSync(finalOutputPath);
    const saved = replaceProjectClothingWhiteImage({ projectKey, sourceAssetIds: selectedIds, sourceAssetNames, prompt, mimeType: 'image/png', imageData });
    touchProject(projectKey);
    writeFileSync(path.join(archiveDirectory, 'response-raw.json'), JSON.stringify(payload, null, 2));
    writeFileSync(path.join(archiveDirectory, 'response-summary.json'), JSON.stringify({ model: payload.model || config.modelName, revisedPrompt: payload.data[0]?.revised_prompt || '', usage: payload.usage || null, finalSize: '1152x1536', finalRatio: '3:4' }, null, 2));
    writeFileSync(path.join(archiveDirectory, 'metadata.json'), JSON.stringify({ width: 1152, height: 1536, bytes: imageData.length, sha256: createHash('sha256').update(imageData).digest('hex'), sourceAssetIds: selectedIds }, null, 2));
    return NextResponse.json({ images: listProjectClothingWhiteImages(projectKey), generated: saved });
  } catch (error) {
    const message = error?.name === 'TimeoutError' ? '服装白底图生成超时，请稍后重试' : (error.message || '服装白底图生成失败');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

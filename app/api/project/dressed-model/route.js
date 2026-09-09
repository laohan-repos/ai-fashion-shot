import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getProjectClothingWhiteImage, getProjectDressedModel, getProjectModelViewForEdit, listProjectDressedModels, saveProjectDressedModelImage } from '../../../../lib/assets-db';
import { getModelConnection } from '../../../../lib/model-config-db';
import { touchProject } from '../../../../lib/projects-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const builtInPrompt = '使用第一张参考图中的模特作为唯一人物身份参考，使用第二张参考图中的整套服装作为唯一穿搭参考，生成一张 3:4 竖版的全身模特穿衣图。必须严格保持模特原有的五官、脸型、发型、发色、肤色、年龄感、身高和身体比例，不得更换人物。让模特准确穿上服装参考图中的全部单品，严格还原每件服装的品类、版型、长度、颜色、面料纹理、图案、领型、袖型、纽扣、拉链、口袋、缝线和装饰细节，不得遗漏、改款、融合或增加其他服装。只生成一位模特，正面自然站立，双脚完整可见，从头顶到鞋底完整入镜。硬性构图要求：模特必须一只手拿着一部竖屏智能手机并举到面部前方，手机只遮挡约 20% 的面部面积，脸部其余约 80% 必须可见，不能遮住整张脸；手机、手掌和手臂不能遮挡服装主体、领口、胸前设计和腰线。只允许出现一部手机，手指结构自然清晰，人物姿势稳定，肢体轮廓明确，便于后续 Seedance 视频生成。人物必须真实融入指定场景，环境光线、人物受光、阴影、透视和景深保持一致，画面呈现高质量时尚摄影效果。不要四联图，不要重复人物，不要服装平铺，不要衣架、文字、水印、标题或边框。';
const sceneDescriptions = {
  '高级室内': '现代轻奢室内空间，浅色石材与木质陈设，落地窗自然光，环境干净高级。',
  '城市街拍': '现代城市街道与建筑背景，自然日光，真实街拍氛围，背景轻微虚化。',
  '精品咖啡馆': '有设计感的精品咖啡馆室内，暖色自然光，简洁桌椅与柔和背景景深。',
  '商场橱窗': '高端商场橱窗和精品店环境，精致商业灯光，时尚而不过度繁杂。',
  '极简展厅': '现代极简艺术展厅，大面积中性色墙面，柔和侧光和清晰空间层次。',
};

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
    if (!response.ok) throw new Error('生成成功，但模特穿衣图下载失败');
    return Buffer.from(await response.arrayBuffer());
  }
  throw new Error('模型没有返回图片数据');
}

export async function GET(request) {
  const projectKey = new URL(request.url).searchParams.get('projectKey') || 'autumn-commute';
  return NextResponse.json({ images: listProjectDressedModels(projectKey), image: getProjectDressedModel(projectKey) });
}

export async function POST(request) {
  try {
    const { projectKey = 'autumn-commute', sourceModelVersionId = 'original', clothingImageId, scene = '高级室内', customScene = '', customPrompt = '' } = await request.json();
    const selectedModelVersion = sourceModelVersionId === 'original' ? 'original' : Number(sourceModelVersionId);
    if (selectedModelVersion !== 'original' && (!Number.isInteger(selectedModelVersion) || selectedModelVersion <= 0)) return NextResponse.json({ error: '请选择有效的模特四视图版本' }, { status: 400 });
    const modelImage = getProjectModelViewForEdit(projectKey, selectedModelVersion);
    if (!modelImage) return NextResponse.json({ error: '请先生成模特四视图' }, { status: 400 });
    const clothingImage = getProjectClothingWhiteImage(projectKey, Number(clothingImageId));
    if (!clothingImage) return NextResponse.json({ error: '请先生成服装白底合成图' }, { status: 400 });
    const config = getModelConnection('gpt-image-2');
    if (!config?.enabled || !config.apiKey) return NextResponse.json({ error: '请先完成并启用 GPT Image 2 图生图配置' }, { status: 400 });

    if (scene === '自定义场景' && !customScene.trim()) return NextResponse.json({ error: '请输入自定义场景描述' }, { status: 400 });
    const scenePrompt = scene === '自定义场景' ? customScene.trim() : (sceneDescriptions[scene] || sceneDescriptions['高级室内']);
    const prompt = `${customPrompt.trim() || builtInPrompt}\n场景要求：${scenePrompt}`;
    const generationStamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archiveDirectory = path.join(process.cwd(), 'data', 'gpt-image2-results', `${generationStamp}-dressed-model`);
    mkdirSync(archiveDirectory, { recursive: true });
    writeFileSync(path.join(archiveDirectory, 'request.json'), JSON.stringify({ model: config.modelName, prompt, scene, scenePrompt, sourceModelVersionId, clothingImageId: Number(clothingImageId), requestedSize: '1024x1536', finalSize: '1152x1536', finalRatio: '3:4', quality: 'high', n: 1 }, null, 2));

    const form = new FormData();
    form.append('model', config.modelName);
    form.append('prompt', prompt);
    form.append('size', '1024x1536');
    form.append('quality', 'high');
    form.append('n', '1');
    form.append('image[]', new Blob([modelImage.imageData], { type: modelImage.mimeType }), 'model-four-view.png');
    form.append('image[]', new Blob([clothingImage.imageData], { type: clothingImage.mimeType }), 'clothing-white-sheet.png');
    const response = await fetch(editEndpoint(config.baseUrl), { method: 'POST', headers: { Authorization: `Bearer ${config.apiKey}` }, body: form, signal: AbortSignal.timeout(180000) });
    let payload;
    try { payload = await response.json(); } catch { payload = null; }
    if (!response.ok || !payload?.data?.[0]) throw new Error(`模特穿衣图生成失败：${payload?.error?.message || payload?.message || `HTTP ${response.status}`}`);
    const modelOutput = await imageBuffer(payload.data[0], config.apiKey);
    const modelOutputPath = path.join(archiveDirectory, 'model-output.png');
    const finalOutputPath = path.join(archiveDirectory, 'edited-output.png');
    writeFileSync(modelOutputPath, modelOutput);
    execFileSync('magick', [modelOutputPath, '-background', '#FFFFFF', '-gravity', 'center', '-extent', '1152x1536', finalOutputPath], { timeout: 30000, stdio: 'pipe' });
    const imageData = readFileSync(finalOutputPath);
    const dressedOutputDirectory = path.join(process.cwd(), '模特穿搭图');
    const dressedOutputPath = path.join(dressedOutputDirectory, `模特穿搭图-${generationStamp}.png`);
    mkdirSync(dressedOutputDirectory, { recursive: true });
    writeFileSync(dressedOutputPath, imageData);
    const saved = saveProjectDressedModelImage({ projectKey, sourceModelVersionId, sourceClothingImageId: Number(clothingImageId), scene: scene === '自定义场景' ? customScene.trim() : scene, outputPath: dressedOutputPath, prompt, mimeType: 'image/png', imageData });
    touchProject(projectKey);
    writeFileSync(path.join(archiveDirectory, 'response-raw.json'), JSON.stringify(payload, null, 2));
    writeFileSync(path.join(archiveDirectory, 'response-summary.json'), JSON.stringify({ model: payload.model || config.modelName, revisedPrompt: payload.data[0]?.revised_prompt || '', usage: payload.usage || null, outputPath: dressedOutputPath, finalSize: '1152x1536', finalRatio: '3:4' }, null, 2));
    writeFileSync(path.join(archiveDirectory, 'metadata.json'), JSON.stringify({ width: 1152, height: 1536, bytes: imageData.length, sha256: createHash('sha256').update(imageData).digest('hex'), outputPath: dressedOutputPath, sourceModelVersionId, sourceClothingImageId: Number(clothingImageId) }, null, 2));
    return NextResponse.json({ image: saved, revisedPrompt: payload.data[0]?.revised_prompt || '', usage: payload.usage || null });
  } catch (error) {
    const message = error?.name === 'TimeoutError' ? '模特穿衣图生成超时，请稍后重试' : (error.message || '模特穿衣图生成失败');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

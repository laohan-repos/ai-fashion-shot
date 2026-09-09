import { NextResponse } from 'next/server';
import { createAsset } from '../../../../lib/assets-db';
import { getModelConnection } from '../../../../lib/model-config-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ratioSizes = { '9:16': '1024x1536', '1:1': '1024x1024', '16:9': '1536x1024' };
function imageEndpoint(configuredUrl) {
  const url = new URL(configuredUrl);
  if (/\/images\/generations\/?$/.test(url.pathname)) return url.toString();
  url.pathname = `${url.pathname.replace(/\/$/, '')}/images/generations`;
  return url.toString();
}

async function resultBuffer(result, apiKey) {
  if (result.b64_json) return Buffer.from(result.b64_json, 'base64');
  if (result.url) {
    const response = await fetch(result.url, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error('生成成功，但图片下载失败');
    return Buffer.from(await response.arrayBuffer());
  }
  throw new Error('模型没有返回图片数据');
}

export async function POST(request) {
  try {
    const { groupId, assetType = '模特', prompt, ratio = '9:16', count = 1 } = await request.json();
    if (!['模特', '服装'].includes(assetType)) return NextResponse.json({ error: '不支持的素材类型' }, { status: 400 });
    if (!groupId || !prompt?.trim()) return NextResponse.json({ error: `请选择搭配并输入${assetType}描述` }, { status: 400 });
    const config = getModelConnection('gpt-image-2-text');
    if (!config?.enabled) return NextResponse.json({ error: 'GPT Image 2 文生图当前未启用' }, { status: 400 });
    if (!config.apiKey || !config.baseUrl || !config.modelName) return NextResponse.json({ error: '请先在模型配置中完成 GPT Image 2 文生图连接配置' }, { status: 400 });

    const imageCount = Math.min(Math.max(Number(count) || 1, 1), 4);
    const response = await fetch(imageEndpoint(config.baseUrl), {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.modelName, prompt: prompt.trim(), size: ratioSizes[ratio] || ratioSizes['9:16'], quality: 'high', n: imageCount }),
      signal: AbortSignal.timeout(180000),
    });
    let payload;
    try { payload = await response.json(); } catch { payload = null; }
    if (!response.ok) {
      const detail = payload?.error?.message || payload?.message || `HTTP ${response.status}`;
      return NextResponse.json({ error: `生成失败：${detail}` }, { status: 502 });
    }
    if (!Array.isArray(payload?.data) || payload.data.length === 0) {
      return NextResponse.json({ error: '模型未返回生成图片' }, { status: 502 });
    }

    const timestamp = new Date().toLocaleString('zh-CN', { hour12: false }).replace(/[\s/:]/g, '-');
    const assets = [];
    for (let index = 0; index < payload.data.length; index += 1) {
      const imageData = await resultBuffer(payload.data[index], config.apiKey);
      assets.push(createAsset({ groupId: Number(groupId), assetType, name: `AI${assetType}-${timestamp}-${index + 1}`, mimeType: 'image/png', imageData }));
    }
    return NextResponse.json({ assets, revisedPrompt: payload.data[0]?.revised_prompt || '', usage: payload.usage || null });
  } catch (error) {
    const message = error?.name === 'TimeoutError' ? '生成超时，请稍后重试' : (error.message || '生成图片失败');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

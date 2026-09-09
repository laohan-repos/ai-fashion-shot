import { NextResponse } from 'next/server';
import { getModelConfig, saveModelConfig } from '../../../lib/model-config-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const allowedTypes = new Set(['multimodal', 'gpt-image-2', 'gpt-image-2-text', 'seedance']);

export async function GET(request) {
  const modelType = new URL(request.url).searchParams.get('type');
  if (!allowedTypes.has(modelType)) {
    return NextResponse.json({ error: '无效的模型类型' }, { status: 400 });
  }
  return NextResponse.json({ config: getModelConfig(modelType) });
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (!allowedTypes.has(body.modelType)) {
      return NextResponse.json({ error: '无效的模型类型' }, { status: 400 });
    }
    if (!body.baseUrl?.trim() || !body.modelName?.trim()) {
      return NextResponse.json({ error: 'API 地址和模型名称不能为空' }, { status: 400 });
    }
    const config = saveModelConfig({
      modelType: body.modelType,
      baseUrl: body.baseUrl.trim(),
      modelName: body.modelName.trim(),
      apiKey: body.apiKey?.trim() || '',
      enabled: Boolean(body.enabled),
    });
    return NextResponse.json({ config });
  } catch {
    return NextResponse.json({ error: '保存模型配置失败' }, { status: 500 });
  }
}

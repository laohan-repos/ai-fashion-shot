import { NextResponse } from 'next/server';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createProjectVideoTask, getProjectDressedModelImage, listProjectVideoTasks } from '../../../../lib/assets-db';
import { getModelConnection } from '../../../../lib/model-config-db';
import { touchProject } from '../../../../lib/projects-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const defaultScripts = [
  ['高级室内展示', '模特在高级室内自然站立，整理袖口后从容向前走一步并缓慢侧身。'],
  ['城市街拍漫步', '模特沿当前城市街道自然向前走两步，停留侧身后回望镜头。'],
  ['咖啡馆随拍', '模特在当前咖啡馆内调整站姿，轻触桌沿或椅背后看向镜头。'],
  ['橱窗时尚展示', '模特在当前商场橱窗前走近，观察橱窗后自然回望镜头。'],
  ['极简展厅定格', '模特在当前极简展厅缓慢转身并调整姿态，最后正面定格。'],
];

function tasksEndpoint(configuredUrl, taskId = '') {
  const url = new URL(configuredUrl);
  const suffix = `/contents/generations/tasks${taskId ? `/${encodeURIComponent(taskId)}` : ''}`;
  if (!url.pathname.includes('/contents/generations/tasks')) url.pathname = `${url.pathname.replace(/\/$/, '')}${suffix}`;
  else if (taskId && !url.pathname.endsWith(taskId)) url.pathname = `${url.pathname.replace(/\/$/, '')}/${encodeURIComponent(taskId)}`;
  return url.toString();
}

export async function GET(request) {
  const projectKey = new URL(request.url).searchParams.get('projectKey') || 'autumn-commute';
  return NextResponse.json({ tasks: listProjectVideoTasks(projectKey) });
}

export async function POST(request) {
  try {
    const { projectKey = 'autumn-commute', dressedModelImageId, scene = '', shotIndex, shotName, prompt = '', ratio = '9:16', camerafixed = false, watermark = false } = await request.json();
    const index = Number(shotIndex);
    if (!Number.isInteger(index) || index < 0 || index >= defaultScripts.length) return NextResponse.json({ error: '无效的视频脚本编号' }, { status: 400 });
    const dressedModel = getProjectDressedModelImage(projectKey, Number(dressedModelImageId) || null);
    if (!dressedModel) return NextResponse.json({ error: '请先生成模特穿衣图' }, { status: 400 });
    const config = getModelConnection('seedance');
    if (!config?.enabled || !config.apiKey) return NextResponse.json({ error: '请先完成并启用 Seedance 视频模型配置' }, { status: 400 });
    const finalPrompt = `使用这张模特穿搭图作为唯一首帧和人物参考。拍摄场景锁定为“${scene || '原图场景'}”，必须严格延续首帧中的环境、陈设、光线、透视和背景，整个视频不得切换、替换或重新设计场景。${prompt.trim() || defaultScripts[index][1]} 硬性要求：保持同一模特、同一套服装、同一场景和同一画面比例；模特必须手持一部竖屏手机，手机始终只遮挡约 20% 面部，不能遮住整张脸或服装主体；手机位置稳定，不消失、不变形，不增加第二部手机；手指、脸部、服装纹理和身体比例保持稳定。动作自然缓慢，避免快速切换、肢体扭曲和服装变形。输出一个完整的 5 秒、${ratio} 画幅、${camerafixed ? '固定' : '平稳跟随'}机位、480p、无声视频。`;
    const archiveDirectory = path.join(process.cwd(), 'data', 'seedance-results', `${new Date().toISOString().replace(/[:.]/g, '-')}-shot-${index + 1}`);
    mkdirSync(archiveDirectory, { recursive: true });
    const imageUrl = `data:${dressedModel.mimeType};base64,${Buffer.from(dressedModel.imageData).toString('base64')}`;
    const payload = {
      model: config.modelName,
      content: [
        { type: 'text', text: finalPrompt },
        { type: 'image_url', role: 'first_frame', image_url: { url: imageUrl } },
      ],
      resolution: '480p',
      duration: 5,
      ratio,
      watermark,
      generate_audio: false,
    };
    writeFileSync(path.join(archiveDirectory, 'request.json'), JSON.stringify({ ...payload, content: payload.content.map(item => item.type === 'image_url' ? { ...item, image_url: { url: '[embedded dressed model image]' } } : item) }, null, 2));
    const response = await fetch(tasksEndpoint(config.baseUrl), { method: 'POST', headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(30000) });
    let responsePayload;
    try { responsePayload = await response.json(); } catch { responsePayload = null; }
    if (!response.ok || !responsePayload?.id) throw new Error(`Seedance 任务提交失败：${responsePayload?.error?.message || responsePayload?.message || `HTTP ${response.status}`}`);
    writeFileSync(path.join(archiveDirectory, 'submit-response.json'), JSON.stringify(responsePayload, null, 2));
    const task = createProjectVideoTask({ projectKey, dressedModelImageId: dressedModel.id, shotIndex: index, shotName: shotName || defaultScripts[index][0], prompt: finalPrompt, remoteTaskId: responsePayload.id, archivePath: archiveDirectory });
    touchProject(projectKey);
    return NextResponse.json({ task });
  } catch (error) {
    const message = error?.name === 'TimeoutError' ? 'Seedance 任务提交超时' : (error.message || 'Seedance 视频任务提交失败');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

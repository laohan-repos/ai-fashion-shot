import { getProjectDressedModelImage } from '../../../../../lib/assets-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const projectKey = params.get('projectKey') || 'autumn-commute';
  const imageId = Number(params.get('imageId')) || null;
  const image = getProjectDressedModelImage(projectKey, imageId);
  if (!image) return new Response('Not found', { status: 404 });
  return new Response(image.imageData, { headers: { 'Content-Type': image.mimeType, 'Cache-Control': 'private, no-store' } });
}

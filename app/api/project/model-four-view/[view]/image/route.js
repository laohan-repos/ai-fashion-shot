import { getProjectModelViewImage } from '../../../../../../lib/assets-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const projectKey = new URL(request.url).searchParams.get('projectKey') || 'autumn-commute';
  const image = getProjectModelViewImage(projectKey, params.view);
  if (!image) return new Response('Not found', { status: 404 });
  return new Response(image.imageData, { headers: { 'Content-Type': image.mimeType, 'Cache-Control': 'private, max-age=300' } });
}


import { apiFetch } from '@/lib/api';

export async function GET(_: Request, { params }: { params: Promise<{ claimId: string; documentId: string }> }) {
  const { claimId, documentId } = await params;
  const res = await apiFetch(`/staff/claims/${claimId}/documents/${documentId}/file`);
  if (!res.ok) return new Response('Document not available', { status: res.status });
  return new Response(res.body, {
    headers: {
      'Content-Type': res.headers.get('Content-Type') ?? 'application/octet-stream',
      'Cache-Control': 'private, max-age=300',
    },
  });
}

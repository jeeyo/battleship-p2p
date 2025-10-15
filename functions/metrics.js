// Cloudflare Pages Function: /metrics
// Receives lightweight client telemetry. For now, it logs and returns 200.
export async function onRequestPost(context) {
  try {
    const { request } = context;
    const payload = await request.json().catch(() => ({}));

    // Intentionally minimal: rely on request logs for observability.
    // In production you might persist to Durable Object, KV, or Analytics Engine.
    const response = {
      success: true,
      receivedAt: new Date().toISOString(),
    };

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'unknown' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

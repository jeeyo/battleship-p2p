// Cloudflare Pages Function: /metrics
// Receives lightweight client telemetry. For now, it logs and returns 200.
export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const payload = await request.json().catch(() => ({}));

    // Optionally sample-store in KV for quick dashboards (rolling window)
    const key = `_metrics_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const sampled = Math.random() < Number(env.METRICS_SAMPLE_RATE || 0.1);
    if (sampled) {
      const value = JSON.stringify({ ...payload, receivedAt: Date.now() });
      await env.MESSAGES.put(key, value, { expirationTtl: 3600 });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'unknown' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

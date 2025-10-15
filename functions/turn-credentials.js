// Cloudflare Pages Function: /turn-credentials
// Returns ICE server configuration. Includes TURN if configured via env.
export async function onRequestGet(context) {
  const { env } = context;

  try {
    // Default STUN servers
    const stunServers = [
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: 'stun:stun.l.google.com:19302' },
    ];

    // Optional extra STUN list via comma-separated env.EXTRA_STUNS
    if (env.EXTRA_STUNS) {
      const extra = env.EXTRA_STUNS.split(',').map((u) => u.trim()).filter(Boolean);
      for (const url of extra) {
        stunServers.push({ urls: url });
      }
    }

    const iceServers = [...stunServers];

    // Optional TURN configuration via env vars
    // TURN_URLS can be a comma-separated list, or JSON array
    const rawTurnUrls = env.TURN_URLS;
    const turnUsername = env.TURN_USERNAME;
    const turnCredential = env.TURN_CREDENTIAL;

    if (rawTurnUrls && turnUsername && turnCredential) {
      let turnUrls = [];
      try {
        turnUrls = JSON.parse(rawTurnUrls);
        if (!Array.isArray(turnUrls)) throw new Error('TURN_URLS JSON must be array');
      } catch {
        turnUrls = rawTurnUrls.split(',').map((u) => u.trim()).filter(Boolean);
      }

      for (const url of turnUrls) {
        iceServers.push({ urls: url, username: turnUsername, credential: turnCredential });
      }
    }

    const ttlSeconds = Number(env.ICE_TTL_SECONDS || 300);
    const now = Date.now();

    return new Response(
      JSON.stringify({
        success: true,
        iceServers,
        expiresAt: new Date(now + ttlSeconds * 1000).toISOString(),
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'unknown' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

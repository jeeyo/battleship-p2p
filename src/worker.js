export class RoomDurable {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sockets = new Map(); // clientId -> WebSocket
    this.roles = new Map();   // clientId -> role (initiator|joiner)
  }

  // Handle WebSocket connections inside the Durable Object for a given room
  async fetch(request) {
    const url = new URL(request.url);
    const upgradeHeader = request.headers.get('Upgrade');

    if (upgradeHeader && upgradeHeader.toLowerCase() === 'websocket') {
      const clientId = url.searchParams.get('clientId') || `client_${Math.random().toString(36).slice(2)}`;
      const role = url.searchParams.get('role') || 'guest';

      // Enforce max 2 distinct clients (replace existing same-client reconnects)
      const distinctIds = [...this.sockets.keys()].filter((id) => id !== clientId);
      if (distinctIds.length >= 2) {
        return new Response('Room full', { status: 403 });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      server.accept();
      try {
        // Replace any previous connection for this clientId
        const existing = this.sockets.get(clientId);
        if (existing) {
          try { existing.close(1012, 'Replaced by new connection'); } catch {}
          this.sockets.delete(clientId);
        }

        this.sockets.set(clientId, server);
        this.roles.set(clientId, role);

        // If another peer is already connected, notify peer joined
        if (this.sockets.size >= 2) {
          this.broadcast({ type: 'peer-joined' });
        }

        server.addEventListener('message', (evt) => {
          try {
            const data = typeof evt.data === 'string' ? JSON.parse(evt.data) : evt.data;
            // Simple pass-through broadcast to other peer(s)
            this.broadcast(data, clientId);
          } catch (err) {
            // Ignore malformed messages
          }
        });

        server.addEventListener('close', () => {
          this.sockets.delete(clientId);
          this.roles.delete(clientId);
          // Optionally notify remaining peer
          this.broadcast({ type: 'peer-left', clientId });
        });

        server.addEventListener('error', () => {
          try { server.close(1011, 'WebSocket error'); } catch {}
          this.sockets.delete(clientId);
          this.roles.delete(clientId);
        });
      } catch (e) {
        try { server.close(1011, 'Internal error'); } catch {}
        this.sockets.delete(clientId);
        this.roles.delete(clientId);
        return new Response('Internal error', { status: 101 });
      }

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('Durable Object endpoint only supports WebSocket', { status: 400 });
  }

  broadcast(message, excludeClientId = null) {
    const payload = typeof message === 'string' ? message : JSON.stringify(message);
    for (const [id, ws] of this.sockets.entries()) {
      if (excludeClientId && id === excludeClientId) continue;
      try { ws.send(payload); } catch {}
    }
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (pathname === '/turn-credentials') {
      // Provide ICE servers; prefer TURN if configured via env
      const iceServers = [];
      if (env.TURN_URL && env.TURN_USERNAME && env.TURN_PASSWORD) {
        iceServers.push({
          urls: env.TURN_URL.split(',').map((u) => u.trim()).filter(Boolean),
          username: env.TURN_USERNAME,
          credential: env.TURN_PASSWORD,
        });
      }
      // Always include public STUN fallback
      iceServers.push(
        { urls: 'stun:stun.cloudflare.com:3478' },
        { urls: 'stun:stun.l.google.com:19302' },
      );
      return new Response(JSON.stringify({ iceServers }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (pathname === '/metrics' && request.method === 'POST') {
      // Intentionally minimal: rely on request logs for observability.
      try { await request.text(); } catch {}
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // WebSocket signaling endpoint: /ws/:roomCode
    if (pathname.startsWith('/ws/')) {
      const roomCode = pathname.split('/').pop();
      if (!roomCode || roomCode.length !== 6) {
        return new Response('Invalid room code', { status: 400 });
      }
      const id = env.ROOM_DO.idFromName(roomCode);
      const stub = env.ROOM_DO.get(id);
      return stub.fetch(request);
    }

    // Serve static assets by default if configured
    if (env.STATIC_ASSETS) {
      return env.STATIC_ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  }
};

// Cloudflare Pages Function: /metrics-summary
// Returns aggregated metrics for a given date range (last N days).
export async function onRequestGet(context) {
  const { env, request } = context;
  try {
    const url = new URL(request.url);
    const days = Math.max(1, Math.min(14, Number(url.searchParams.get('days') || 1)));

    const today = new Date();
    const keys = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setUTCDate(today.getUTCDate() - i);
      const key = `metrics:${d.toISOString().slice(0, 10)}`;
      keys.push(key);
    }

    // Fetch daily lists
    const lists = [];
    for (const key of keys) {
      const content = await env.MESSAGES.get(key);
      if (!content) continue;
      try { lists.push(JSON.parse(content)); } catch {}
    }

    const events = {};
    const icePairs = {
      candidateType: {}, // host/srflx/prflx/relay
      protocol: {},      // udp/tcp
      networkType: {},   // wifi/cellular/...
    };

    let total = 0;
    for (const list of lists) {
      for (const rec of list) {
        total += 1;
        const e = rec.e || 'unknown_event';
        events[e] = (events[e] || 0) + 1;
        // Try to aggregate ICE selected-pair metadata if present
        const d = rec.d || {};
        if (d.selectedCandidatePair) {
          const p = d.selectedCandidatePair;
          if (p.localCandidateType) icePairs.candidateType[p.localCandidateType] = (icePairs.candidateType[p.localCandidateType] || 0) + 1;
          if (p.remoteCandidateType) icePairs.candidateType[p.remoteCandidateType] = (icePairs.candidateType[p.remoteCandidateType] || 0) + 1;
          if (p.protocol) icePairs.protocol[p.protocol] = (icePairs.protocol[p.protocol] || 0) + 1;
          if (p.networkType) icePairs.networkType[p.networkType] = (icePairs.networkType[p.networkType] || 0) + 1;
        }
      }
    }

    return new Response(JSON.stringify({ total, events, icePairs }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'unknown' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

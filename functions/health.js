// Cloudflare Pages Function: /health
export async function onRequestGet(context) {
    const { env } = context;
    
    try {
        // Test KV connectivity
        const testKey = '_health_check';
        const testValue = Date.now().toString();
        
        await env.ROOMS.put(testKey, testValue, { expirationTtl: 60 });
        const retrieved = await env.ROOMS.get(testKey);
        
        const isHealthy = retrieved === testValue;
        
        // Clean up test key
        await env.ROOMS.delete(testKey);
        
        return new Response(JSON.stringify({ 
            status: isHealthy ? 'healthy' : 'degraded',
            timestamp: new Date().toISOString(),
            services: {
                kv: isHealthy ? 'operational' : 'error'
            }
        }), {
            status: isHealthy ? 200 : 500,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        return new Response(JSON.stringify({ 
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: error.message
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
} 
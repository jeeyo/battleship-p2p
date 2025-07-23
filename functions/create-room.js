// Cloudflare Pages Function: /create-room
export async function onRequestPost(context) {
    const { request, env } = context;
    
    try {
        const body = await request.json();
        const roomCode = body.roomCode;
        
        if (!roomCode || roomCode.length !== 6) {
            return new Response(JSON.stringify({ error: 'Invalid room code' }), { 
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        // Check if room already exists in KV
        const existingRoom = await env.ROOMS.get(roomCode);
        if (existingRoom) {
            return new Response(JSON.stringify({ error: 'Room already exists' }), { 
                status: 409,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        // Create new room
        const room = {
            id: roomCode,
            creator: request.headers.get('cf-connecting-ip') || 'unknown',
            participants: 1,
            createdAt: Date.now(),
            status: 'waiting'
        };
        
        // Store room in KV with 2 hour expiration
        await env.ROOMS.put(roomCode, JSON.stringify(room), {
            expirationTtl: 2 * 60 * 60 // 2 hours
        });
        
        // Initialize empty message queue for room
        await env.MESSAGES.put(roomCode, JSON.stringify([]), {
            expirationTtl: 2 * 60 * 60 // 2 hours
        });
        
        return new Response(JSON.stringify({
            success: true,
            roomCode: roomCode,
            message: 'Room created successfully'
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        return new Response(JSON.stringify({ code: error.code,error: error.message }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }
} 
// Cloudflare Pages Function: /join-room
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
        
        // Get room from KV
        const roomData = await env.ROOMS.get(roomCode);
        if (!roomData) {
            return new Response(JSON.stringify({ error: 'Room not found' }), { 
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        const room = JSON.parse(roomData);
        if (room.participants >= 2) {
            return new Response(JSON.stringify({ error: 'Room is full' }), { 
                status: 409,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        // Update room
        room.participants = 2;
        room.status = 'full';
        
        // Save updated room to KV
        await env.ROOMS.put(roomCode, JSON.stringify(room), {
            expirationTtl: 2 * 60 * 60 // 2 hours
        });
        
        // Add peer-joined message with proper sequencing
        const messagesData = await env.MESSAGES.get(roomCode);
        const messages = messagesData ? JSON.parse(messagesData) : [];
        
        const timestamp = Date.now();
        const lastSequence = messages.length > 0 ? 
            Math.max(...messages.map(m => m.sequence || 0)) : 0;
        
        const peerJoinedMessage = {
            type: 'peer-joined',
            timestamp: timestamp,
            sequence: lastSequence + 1,
            messageId: `system_${timestamp}_${Math.random().toString(36).substr(2, 5)}`,
            senderId: 'system'
        };
        
        messages.push(peerJoinedMessage);
        
        // Clean up old messages by both count and age
        const oneHourAgo = timestamp - (60 * 60 * 1000);
        let filteredMessages = messages.filter(msg => msg.timestamp > oneHourAgo);
        
        // Also limit by count as a fallback
        if (filteredMessages.length > 100) {
            filteredMessages = filteredMessages.slice(-50); // Keep last 50
        }
        
        await env.MESSAGES.put(roomCode, JSON.stringify(filteredMessages), {
            expirationTtl: 2 * 60 * 60 // 2 hours
        });
        
        return new Response(JSON.stringify({
            success: true,
            message: 'Joined room successfully'
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
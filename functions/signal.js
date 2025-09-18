// Cloudflare Pages Function: /signal
export async function onRequestPost(context) {
    const { request, env } = context;
    
    try {
        const body = await request.json();
        const roomCode = body.roomCode;
        const senderId = body.senderId;
        const messageId = body.messageId; // Client should provide unique message ID
        const isInitiator = body.isInitiator; // Whether sender is the room initiator
        
        if (!roomCode) {
            return new Response(JSON.stringify({ error: 'Room code required' }), { 
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (!senderId) {
            return new Response(JSON.stringify({ error: 'Sender ID required' }), { 
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (typeof isInitiator !== 'boolean') {
            return new Response(JSON.stringify({ error: 'isInitiator flag required' }), { 
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        // Verify room exists
        const roomData = await env.ROOMS.get(roomCode);
        if (!roomData) {
            return new Response(JSON.stringify({ error: 'Room not found' }), { 
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Retry mechanism for concurrent access
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount < maxRetries) {
            try {
                // Determine message queue key based on sender role
                const messageKey = isInitiator ? `${roomCode}_initiator` : `${roomCode}_joiner`;
                
                // Get existing messages from the appropriate queue
                const messagesData = await env.MESSAGES.get(messageKey);
                const messages = messagesData ? JSON.parse(messagesData) : [];
                
                // Check for duplicate message (deduplication)
                if (messageId && messages.some(msg => msg.messageId === messageId)) {
                    return new Response(JSON.stringify({
                        success: true,
                        message: 'Message already processed (duplicate)',
                        isDuplicate: true
                    }), {
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
                
                const timestamp = Date.now();
                
                // Get sequence number (increment from last message)
                const lastSequence = messages.length > 0 ? 
                    Math.max(...messages.map(m => m.sequence || 0)) : 0;
                
                // Add the signaling message with enhanced metadata
                const newMessage = {
                    ...body,
                    messageId: messageId || `${senderId}_${timestamp}_${Math.random().toString(36).substr(2, 5)}`,
                    senderId: senderId,
                    timestamp: timestamp,
                    sequence: lastSequence + 1
                };
                
                messages.push(newMessage);
                
                // Clean up old messages by both count and age
                const oneHourAgo = timestamp - (60 * 60 * 1000);
                let filteredMessages = messages.filter(msg => msg.timestamp > oneHourAgo);
                
                // Also limit by count as a fallback
                if (filteredMessages.length > 100) {
                    filteredMessages = filteredMessages.slice(-50); // Keep last 50
                }
                
                // Store back to KV with optimistic locking approach
                await env.MESSAGES.put(messageKey, JSON.stringify(filteredMessages), {
                    expirationTtl: 2 * 60 * 60 // 2 hours
                });
                
                return new Response(JSON.stringify({
                    success: true,
                    message: 'Signal sent successfully',
                    sequence: newMessage.sequence,
                    messageId: newMessage.messageId
                }), {
                    headers: { 'Content-Type': 'application/json' }
                });
                
            } catch (kvError) {
                retryCount++;
                if (retryCount >= maxRetries) {
                    throw kvError;
                }
                // Small delay before retry to reduce contention
                await new Promise(resolve => setTimeout(resolve, 50 * retryCount));
            }
        }
        
    } catch (error) {
        return new Response(JSON.stringify({ 
            code: error.code || 'UNKNOWN_ERROR',
            error: error.message 
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
class WebRTCManager {
    constructor() {
        this.peerConnection = null;
        this.dataChannel = null;
        this.isInitiator = false;
        this.roomCode = null;
        
        // Generate unique client ID for this session
        this.clientId = this.generateClientId();

        // Configure signaling URL based on environment
        this.signalingUrl = this.getSignalingUrl();

        this.callbacks = {
            onConnectionStateChange: null,
            onDataReceived: null,
            onRoomCreated: null,
            onRoomJoined: null,
            onPeerJoined: null,
            onError: null
        };

        this.configuration = {
            "iceServers": [
                {
                    "urls": [
                        "stun:stun.cloudflare.com:3478",
                        "stun:stun.cloudflare.com:53"
                    ]
                },
                {
                    "urls": [
                        "turn:turn.cloudflare.com:3478?transport=udp",
                        "turn:turn.cloudflare.com:3478?transport=tcp",
                        "turns:turn.cloudflare.com:5349?transport=tcp",
                        "turn:turn.cloudflare.com:53?transport=udp",
                        "turn:turn.cloudflare.com:80?transport=tcp",
                        "turns:turn.cloudflare.com:443?transport=tcp"
                    ],
                    "username": "g05c5829edffd5e767d7fb9efcc2029c3b2e951460b137955cfb742521e2f567",
                    "credential": "63d1215c40dabd664ae127608fa7692f4cb0b19c76171d677c439899461c9e39"
                }
            ]
        };

        this.lastPollTimestamp = 0;
        this.pollInterval = null;

        // Message queue system
        this.messageQueue = [];
        this.isProcessingQueue = false;
        this.queueProcessingInterval = 1500; // Process every 1.5s due to Cloudflare KV limits (https://developers.cloudflare.com/kv/platform/limits/)
        this.maxQueueSize = 50; // Prevent memory issues
    }

    // Queue management methods

    // Add message to queue
    queueSignalingMessage(message) {
        // Prevent queue from growing too large
        if (this.messageQueue.length >= this.maxQueueSize) {
            console.warn('Signaling message queue full, dropping oldest message');
            this.messageQueue.shift();
        }

        // Add timestamp for processing order
        const queuedMessage = {
            ...message,
            queueTimestamp: Date.now()
        };

        this.messageQueue.push(queuedMessage);

        // Start processing if not already running
        if (!this.isProcessingQueue) {
            this.startQueueProcessing();
        }
    }

    // Start processing the message queue
    startQueueProcessing() {
        if (this.isProcessingQueue) return;

        this.isProcessingQueue = true;
        this.processNextMessage();
    }

    // Process the next message in the queue
    async processNextMessage() {
        if (this.messageQueue.length === 0) {
            this.isProcessingQueue = false;
            return;
        }

        const message = this.messageQueue.shift();

        try {
            await this.sendSignalingMessageDirect(message);
        } catch (error) {
            console.error('Error processing queued signaling message:', error);
            if (this.callbacks.onError) {
                this.callbacks.onError('Failed to send signaling message: ' + error.message);
            }
        }

        // Schedule next message processing
        setTimeout(() => {
            this.processNextMessage();
        }, this.queueProcessingInterval);
    }

    // Stop queue processing
    stopQueueProcessing() {
        this.isProcessingQueue = false;
        this.messageQueue = []; // Clear remaining messages
    }

    // Determine signaling URL based on environment
    getSignalingUrl() {
        // Check if running in development
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return `http://${window.location.hostname}:8788`; // Local Wrangler dev server
        }

        // Production - replace with your actual worker URL
        return `https://${window.location.hostname}`;
    }

    // Initialize peer connection
    initializePeerConnection() {
        this.peerConnection = new RTCPeerConnection(this.configuration);

        // Handle ICE candidates
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendSignalingMessage({
                    type: 'ice-candidate',
                    candidate: event.candidate,
                    roomCode: this.roomCode
                });
            } else if (event.candidate) {
                console.log('Ignoring additional ICE candidate');
            }
        };

        // Handle connection state changes
        this.peerConnection.onconnectionstatechange = () => {
            console.log('Connection state:', this.peerConnection.connectionState);
            if (this.callbacks.onConnectionStateChange) {
                this.callbacks.onConnectionStateChange(this.peerConnection.connectionState);
            }

            // Stop polling if connection is closed or failed
            if (['closed', 'failed'].includes(this.peerConnection.connectionState)) {
                this.stopPolling();
            }
        };

        // Handle incoming data channel
        this.peerConnection.ondatachannel = (event) => {
            const channel = event.channel;
            this.setupDataChannel(channel);
        };

        // Handle ICE connection state
        this.peerConnection.oniceconnectionstatechange = () => {
            console.log('ICE connection state:', this.peerConnection.iceConnectionState);

            if (this.peerConnection.iceConnectionState === 'connected') {
                this.stopPolling(); // Stop polling once P2P connection is established
            }
        };
    }

    // Setup data channel
    setupDataChannel(channel) {
        this.dataChannel = channel;

        this.dataChannel.onopen = () => {
            console.log('Data channel opened');
            this.stopPolling(); // Stop polling once data channel is open
            if (this.callbacks.onConnectionStateChange) {
                this.callbacks.onConnectionStateChange('connected');
            }
        };

        this.dataChannel.onclose = () => {
            console.log('Data channel closed');
            if (this.callbacks.onConnectionStateChange) {
                this.callbacks.onConnectionStateChange('disconnected');
            }
        };

        this.dataChannel.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('Received data:', data);
                if (this.callbacks.onDataReceived) {
                    this.callbacks.onDataReceived(data);
                }
            } catch (error) {
                console.error('Error parsing received data:', error);
            }
        };

        this.dataChannel.onerror = (error) => {
            console.error('Data channel error:', error);
            if (this.callbacks.onError) {
                this.callbacks.onError('Data channel error: ' + error);
            }
        };
    }

    // Create a new game room
    async createRoom() {
        try {
            this.isInitiator = true;
            this.roomCode = this.generateRoomCode();

            this.initializePeerConnection();

            // Create data channel
            this.dataChannel = this.peerConnection.createDataChannel('gameData', {
                ordered: true
            });
            this.setupDataChannel(this.dataChannel);

            // Test signaling server connection
            await this.testSignalingServer();

            // Register room with signaling server
            const response = await fetch(`${this.signalingUrl}/create-room`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    roomCode: this.roomCode
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP ${response.status}: Failed to create room`);
            }

            // Start listening for signaling messages
            this.startSignalingListener();

            if (this.callbacks.onRoomCreated) {
                this.callbacks.onRoomCreated(this.roomCode);
            }

            return this.roomCode;
        } catch (error) {
            console.error('Error creating room:', error);
            if (this.callbacks.onError) {
                this.callbacks.onError('Failed to create room: ' + error.message);
            }
            throw error;
        }
    }

    // Test signaling server connectivity
    async testSignalingServer() {
        try {
            const response = await fetch(`${this.signalingUrl}/health`);
            if (!response.ok) {
                throw new Error(`Signaling server health check failed: ${response.status}`);
            }
            console.log('Signaling server is healthy');
        } catch (error) {
            console.warn('Signaling server health check failed:', error);
            // Don't throw - allow the app to continue and potentially fail later with better error messages
        }
    }

    // Join an existing game room
    async joinRoom(roomCode) {
        try {
            this.isInitiator = false;
            this.roomCode = roomCode;

            this.initializePeerConnection();

            // Test signaling server connection
            await this.testSignalingServer();

            // Join room
            const response = await fetch(`${this.signalingUrl}/join-room`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    roomCode: this.roomCode
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP ${response.status}: Failed to join room`);
            }

            // Start listening for signaling messages
            this.startSignalingListener();

            if (this.callbacks.onRoomJoined) {
                this.callbacks.onRoomJoined(this.roomCode);
            }

            if (this.callbacks.onPeerJoined) {
                this.callbacks.onPeerJoined();
            }

            return true;
        } catch (error) {
            console.error('Error joining room:', error);
            if (this.callbacks.onError) {
                this.callbacks.onError('Failed to join room: ' + error.message);
            }
            throw error;
        }
    }

    // Send signaling message to server (queued)
    sendSignalingMessage(message) {
        this.queueSignalingMessage(message);
    }

    // Send signaling message directly to server (internal use)
    async sendSignalingMessageDirect(message) {
        try {
            // Add senderId to the message
            const messageWithSender = {
                ...message,
                senderId: this.clientId
            };

            const response = await fetch(`${this.signalingUrl}/signal`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(messageWithSender)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error('Failed to send signaling message:', errorData);
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }
        } catch (error) {
            console.error('Error sending signaling message:', error);
            throw error;
        }
    }

    // Start listening for signaling messages
    startSignalingListener() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
        }

        const pollForMessages = async () => {
            try {
                const url = new URL(`${this.signalingUrl}/poll`);
                url.searchParams.set('roomCode', this.roomCode);
                url.searchParams.set('lastTimestamp', this.lastPollTimestamp.toString());
                url.searchParams.set('requesterId', this.clientId);

                const response = await fetch(url);
                if (response.ok) {
                    const messages = await response.json();
                    for (const message of messages) {
                        this.lastPollTimestamp = Math.max(this.lastPollTimestamp, message.timestamp);
                        await this.handleSignalingMessage(message);
                    }
                }
            } catch (error) {
                console.error('Error polling for messages:', error);
            }
        };

        // Poll immediately and then set interval
        pollForMessages();
        this.pollInterval = setInterval(pollForMessages, 1000);
    }

    // Stop polling for signaling messages
    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
            console.log('Stopped signaling message polling');
        }
    }

    // Handle incoming signaling messages
    async handleSignalingMessage(message) {
        try {
            switch (message.type) {
                case 'offer':
                    await this.handleOffer(message.offer);
                    break;
                case 'answer':
                    await this.handleAnswer(message.answer);
                    break;
                case 'ice-candidate':
                    await this.handleIceCandidate(message.candidate);
                    break;
                case 'peer-joined':
                    await this.handlePeerJoined();
                    break;
            }
        } catch (error) {
            console.error('Error handling signaling message:', error);
        }
    }

    // Handle offer from peer
    async handleOffer(offer) {
        await this.peerConnection.setRemoteDescription(offer);
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);

        this.sendSignalingMessage({
            type: 'answer',
            answer: answer,
            roomCode: this.roomCode
        });
    }

    // Handle answer from peer
    async handleAnswer(answer) {
        await this.peerConnection.setRemoteDescription(answer);
    }

    // Handle ICE candidate from peer
    async handleIceCandidate(candidate) {
        await this.peerConnection.addIceCandidate(candidate);
    }

    // Handle peer joined event
    async handlePeerJoined() {
        if (this.isInitiator) {
            // Create and send offer
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);

            this.sendSignalingMessage({
                type: 'offer',
                offer: offer,
                roomCode: this.roomCode
            });
        }
    }

    // Send game data to peer
    sendGameData(data) {
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(JSON.stringify(data));
            return true;
        }
        console.warn('Cannot send game data: data channel not ready');
        return false;
    }

    // Generate a random room code
    generateRoomCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    // Generate a unique client ID
    generateClientId() {
        return 'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    }

    // Close connection
    close() {
        this.stopPolling();
        this.stopQueueProcessing();

        if (this.dataChannel) {
            this.dataChannel.close();
        }

        if (this.peerConnection) {
            this.peerConnection.close();
        }

        this.dataChannel = null;
        this.peerConnection = null;
        this.roomCode = null;
    }

    // Get connection status
    getConnectionState() {
        if (!this.peerConnection) return 'disconnected';
        return this.peerConnection.connectionState;
    }

    // Check if connected
    isConnected() {
        return this.dataChannel && this.dataChannel.readyState === 'open';
    }

    // Get queue status for debugging
    getQueueStatus() {
        return {
            queueSize: this.messageQueue.length,
            isProcessing: this.isProcessingQueue,
            maxQueueSize: this.maxQueueSize,
        };
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WebRTCManager;
} else {
    window.WebRTCManager = WebRTCManager;
}

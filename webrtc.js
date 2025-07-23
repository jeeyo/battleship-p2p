class WebRTCManager {
    constructor() {
        this.peerConnection = null;
        this.dataChannel = null;
        this.isInitiator = false;
        this.roomCode = null;
        this.signalingUrl = 'https://battleship-p2p.your-subdomain.workers.dev'; // Replace with your worker URL
        
        this.callbacks = {
            onConnectionStateChange: null,
            onDataReceived: null,
            onRoomCreated: null,
            onPeerJoined: null,
            onError: null
        };
        
        this.configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };
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
            }
        };
        
        // Handle connection state changes
        this.peerConnection.onconnectionstatechange = () => {
            console.log('Connection state:', this.peerConnection.connectionState);
            if (this.callbacks.onConnectionStateChange) {
                this.callbacks.onConnectionStateChange(this.peerConnection.connectionState);
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
        };
    }
    
    // Setup data channel
    setupDataChannel(channel) {
        this.dataChannel = channel;
        
        this.dataChannel.onopen = () => {
            console.log('Data channel opened');
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
                throw new Error('Failed to create room');
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
    
    // Join an existing game room
    async joinRoom(roomCode) {
        try {
            this.isInitiator = false;
            this.roomCode = roomCode;
            
            this.initializePeerConnection();
            
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
                throw new Error('Failed to join room');
            }
            
            // Start listening for signaling messages
            this.startSignalingListener();
            
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
    
    // Send signaling message to server
    async sendSignalingMessage(message) {
        try {
            await fetch(`${this.signalingUrl}/signal`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(message)
            });
        } catch (error) {
            console.error('Error sending signaling message:', error);
        }
    }
    
    // Start listening for signaling messages
    startSignalingListener() {
        const pollForMessages = async () => {
            try {
                const response = await fetch(`${this.signalingUrl}/poll?roomCode=${this.roomCode}`);
                if (response.ok) {
                    const messages = await response.json();
                    for (const message of messages) {
                        await this.handleSignalingMessage(message);
                    }
                }
            } catch (error) {
                console.error('Error polling for messages:', error);
            }
            
            // Continue polling if connection is not established
            if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
                setTimeout(pollForMessages, 1000);
            }
        };
        
        pollForMessages();
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
    
    // Close connection
    close() {
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
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WebRTCManager;
} else {
    window.WebRTCManager = WebRTCManager;
} 
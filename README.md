# P2P Battleship Game

A modern, web-based Battleship game that uses WebRTC for peer-to-peer gameplay. Players can create or join games using room codes, place their ships, and battle it out in real-time without the need for a central game server.

## Features

- 🚢 **Classic Battleship Gameplay**: Place 5 ships and try to sink your opponent's fleet
- 🔗 **Peer-to-Peer Multiplayer**: Direct connection between players using WebRTC
- 🎮 **Real-time Gameplay**: Instant moves and responses
- 📱 **Responsive Design**: Works on desktop and mobile devices
- 🎨 **Modern UI**: Beautiful, animated interface with visual feedback
- 🔐 **Simple Room System**: 6-character room codes for easy game sharing
- 🌊 **Interactive Ship Placement**: Drag, drop, and rotate ships with visual validation
- 📊 **Game Statistics**: Track shots fired and ships remaining

## Technology Stack

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Networking**: WebRTC for P2P communication
- **Signaling**: Cloudflare Workers
- **Styling**: CSS Grid, Flexbox, CSS Variables
- **Game Logic**: Object-oriented JavaScript

## Game Rules

1. Each player places 5 ships on a 10x10 grid:
   - Carrier (5 squares)
   - Battleship (4 squares)
   - Cruiser (3 squares)
   - Submarine (3 squares)
   - Destroyer (2 squares)

2. Ships cannot overlap or be placed adjacent to each other
3. Players take turns attacking opponent's grid coordinates
4. A hit allows the player to attack again
5. First player to sink all enemy ships wins

## Quick Start

### For Local Development

1. **Clone and Setup**:
   ```bash
   git clone <repository-url>
   cd battleship-p2p
   ```

2. **Serve the Files**:
   You need to serve the files over HTTP (not file://) for WebRTC to work:
   ```bash
   # Using Python
   python -m http.server 8000
   
   # Using Node.js
   npx serve .
   
   # Using any local web server
   ```

3. **Open in Browser**:
   Navigate to `http://localhost:8000`

### Deploying the Signaling Server

The game requires a Cloudflare Worker for WebRTC signaling:

1. **Install Wrangler CLI**:
   ```bash
   npm install -g wrangler
   ```

2. **Login to Cloudflare**:
   ```bash
   wrangler login
   ```

3. **Deploy the Worker**:
   ```bash
   wrangler deploy
   ```

4. **Update the Signaling URL**:
   In `webrtc.js`, update the `signalingUrl` with your deployed worker URL:
   ```javascript
   this.signalingUrl = 'https://battleship-p2p.your-subdomain.workers.dev';
   ```

## File Structure

```
battleship-p2p/
├── index.html          # Main HTML structure
├── styles.css          # CSS styling and animations
├── game-logic.js       # Core Battleship game logic
├── webrtc.js          # WebRTC connection management
├── app.js             # Main application controller
├── worker.js          # Cloudflare Worker signaling server
├── wrangler.toml      # Worker deployment configuration
└── README.md          # This file
```

## How to Play

1. **Start a Game**:
   - Click "Create New Game" to host a game and get a room code
   - Or enter a room code and click "Join Game"

2. **Place Your Ships**:
   - Click on a ship type to select it
   - Click on the board to place it
   - Use "Rotate Ship" to change orientation
   - Use "Random Placement" for quick setup
   - Click "Ready!" when all ships are placed

3. **Battle Phase**:
   - Click on the enemy board to attack
   - Red squares with 💥 indicate hits
   - Gray squares with 💧 indicate misses
   - Black squares with 💀 indicate sunk ships
   - First to sink all enemy ships wins!

## Development

### Adding Features

The codebase is modular and extensible:

- **Game Logic**: Modify `BattleshipGame` class in `game-logic.js`
- **UI Components**: Update HTML structure and CSS styling
- **Networking**: Extend `WebRTCManager` class in `webrtc.js`
- **Application Flow**: Modify `BattleshipApp` class in `app.js`

### Key Classes

- **`BattleshipGame`**: Core game mechanics, ship placement, attack logic
- **`WebRTCManager`**: P2P connection setup and data transmission
- **`BattleshipApp`**: UI controller and game state management

### WebRTC Flow

1. Room creation/joining via Cloudflare Worker
2. Signaling message exchange (offers, answers, ICE candidates)
3. Direct P2P data channel establishment
4. Game data transmission over data channel

## Browser Compatibility

- Chrome 70+
- Firefox 65+
- Safari 12+
- Edge 79+

WebRTC is required for P2P functionality.

## Known Limitations

1. **No Reconnection**: If connection drops, players need to start a new game
2. **Memory Storage**: Cloudflare Worker uses in-memory storage (rooms expire)
3. **No Spectators**: Only 2 players per room supported
4. **No AI**: Human opponent required

## Troubleshooting

### Common Issues

**"Failed to create/join room"**:
- Check your internet connection
- Verify the Cloudflare Worker is deployed and accessible
- Check browser console for detailed error messages

**"WebRTC connection failed"**:
- Ensure both players have modern browsers
- Check if either player is behind a restrictive firewall
- Try refreshing and creating a new room

**"Ships not placing correctly"**:
- Ships cannot overlap or be adjacent
- Ensure ship fits within the 10x10 grid
- Try using "Random Placement" if having issues

### Debug Mode

Open browser developer tools and check the console for detailed connection and game state information.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is open source and available under the [MIT License](LICENSE).

## Credits

- Game concept: Classic Battleship board game
- Icons: Emoji characters for visual feedback
- Networking: WebRTC and Cloudflare Workers

---

**Enjoy your naval battles! ⚓** 
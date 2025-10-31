# P2P Battleship Game

A modern, web-based Battleship game that uses WebRTC for peer-to-peer gameplay. Players can create or join games using room codes, place their ships, and battle it out in real-time without the need for a central game server.

Demo: https://battleship-p2p.pages.dev/

## Features

- 🚢 **Classic Battleship Gameplay**: Place 5 ships and try to sink your opponent's fleet
- 🔗 **Peer-to-Peer Multiplayer**: Direct connection between players using WebRTC
- 🎮 **Real-time Gameplay**: Instant moves and responses
- 📱 **Responsive Design**: Works on desktop and mobile devices
- 🎨 **Modern UI**: Beautiful, animated interface with visual feedback
- 🔐 **Simple Room System**: 6-character room codes for easy game sharing
- 🌊 **Interactive Ship Placement**: Click to place and rotate ships with visual validation
- 📊 **Game Statistics**: Track shots fired and ships remaining
- ⚡ **Flexible Ship Placement**: Ships can be placed adjacent to each other for strategic positioning

## Technology Stack

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Networking**: WebRTC for P2P communication
- **Signaling**: Cloudflare Workers + Durable Objects (WebSocket)
- **Styling**: CSS Grid, Flexbox, CSS Variables
- **Game Logic**: Object-oriented JavaScript

## Game Rules

1. Each player places 5 ships on a 10x10 grid:
   - Carrier (5 squares)
   - Battleship (4 squares)
   - Cruiser (3 squares)
   - Submarine (3 squares)
   - Destroyer (2 squares)

2. Ships cannot overlap but can be placed adjacent to each other
3. Players alternate turns attacking opponent's grid coordinates
4. Turns switch after every shot regardless of hit or miss
5. First player to sink all enemy ships wins

## Quick Start

### For Local Development

1. **Clone and Setup**:
   ```bash
   git clone <repository-url>
   cd battleship-p2p
   npm install
   ```

2. **Start Development Server**:
   ```bash
   # Start local Cloudflare Worker (Durable Objects + static assets)
   npm run dev:worker
   ```
   This serves the Worker on port 8787 and the static assets from `dist/`.

3. **Open in Browser**:
Navigate to `http://localhost:8787`

### Deploying to Cloudflare Workers

1. **Install Wrangler CLI** (if not already installed):
   ```bash
   npm install -g wrangler
   ```

2. **Login to Cloudflare**:
   ```bash
   wrangler login
   ```

3. **Deploy to Cloudflare Workers**:
   ```bash
   npm run deploy:worker
   ```
The Worker serves both the signaling WebSocket and the static site.

## File Structure

```
battleship-p2p/
├── dist/                    # Built game files
│   ├── index.html          # Main HTML structure
│   ├── styles.css          # CSS styling and animations
│   ├── game-logic.js       # Core Battleship game logic
│   ├── webrtc.js          # WebRTC connection management
│   └── app.js             # Main application controller
├── src/worker.js          # Cloudflare Worker entry with Durable Object
├── package.json           # Node.js dependencies
├── wrangler.toml         # Cloudflare Workers configuration
└── README.md             # This file
```

## How to Play

1. **Start a Game**:
   - Click "Create New Game" to host a game and get a room code
   - Or enter a room code and click "Join Game"

2. **Place Your Ships**:
   - Click on a ship type to select it
   - Click on the board to place it
   - Use "Rotate Ship" to change orientation between horizontal and vertical
   - Use "Random Placement" for quick automatic setup
   - Use "Clear Board" to remove all placed ships
   - Click "Ready!" when all ships are placed

3. **Battle Phase**:
   - Click on the enemy board to attack
   - Red squares with 🔥 indicate hits
   - Gray squares with 💧 indicate misses
   - Black squares with 💀 indicate sunk ships
   - Turns alternate after every shot
   - First to sink all enemy ships wins!

## Development

### Adding Features

The codebase is modular and extensible:

- **Game Logic**: Modify `BattleshipGame` class in `dist/game-logic.js`
- **UI Components**: Update HTML structure in `dist/index.html` and CSS styling in `dist/styles.css`
- **Networking**: Extend `WebRTCManager` class in `dist/webrtc.js`
- **Application Flow**: Modify `BattleshipApp` class in `dist/app.js`
- **Worker Endpoints**: Add new endpoints in `src/worker.js`

### Key Classes

- **`BattleshipGame`**: Core game mechanics, ship placement, attack logic
- **`WebRTCManager`**: P2P connection setup and data transmission
- **`BattleshipApp`**: UI controller and game state management

### WebRTC Flow

1. Room creation/joining via Cloudflare Workers (Durable Objects)
2. Signaling message exchange (offers, answers, ICE candidates)
3. Direct P2P data channel establishment
4. Game data transmission over data channel
5. Turn synchronization messages to maintain game state

### Worker Endpoints

- `GET /health` - Health check endpoint
- `GET /turn-credentials` - Returns ICE/TURN config
- `WS /ws/:roomCode` - WebSocket signaling via Durable Object

## Browser Compatibility

- Chrome 70+
- Firefox 65+
- Safari 12+
- Edge 79+

WebRTC is required for P2P functionality.

## Known Limitations

1. **No Reconnection**: If connection drops, players need to start a new game
2. **Memory Storage**: Cloudflare KV storage with 2-hour expiration
3. **No Spectators**: Only 2 players per room supported
4. **No AI**: Human opponent required

## Troubleshooting

### Common Issues

**"Failed to create/join room"**:
- Check your internet connection
- Verify the Cloudflare Workers deployment is accessible
- Check browser console for detailed error messages

**"WebRTC connection failed"**:
- Ensure both players have modern browsers
- Check if either player is behind a restrictive firewall
- Try refreshing and creating a new room

**"Ships not placing correctly"**:
- Ships cannot overlap but can be adjacent
- Ensure ship fits within the 10x10 grid boundaries
- Try using "Random Placement" if having manual placement issues

**"Turns not switching properly"**:
- Both players must have stable connections
- Check if both players are using the same deployed version
- Try refreshing if turn synchronization gets stuck

### Debug Mode

Open browser developer tools and check the console for detailed connection and game state information.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly in both development and production environments
5. Submit a pull request

## Recent Changes

- **Adjacent Ship Placement**: Ships can now be placed touching each other
- **Turn Mechanics**: Players alternate after every shot (not just misses)
- **Improved Synchronization**: Better turn state management between players
- **Board Bug Fixes**: Fixed issues with cell state management
- **Cloudflare Workers**: Migrated from Cloudflare Pages to Workers with Durable Objects

## License

This project is open source and available under the [MIT License](LICENSE).

## Credits

- Game concept: Classic Battleship board game
- Icons: Emoji characters for visual feedback
- Networking: WebRTC and Cloudflare Workers

---

**Enjoy your naval battles! ⚓** 
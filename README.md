# Chain Reaction - Word Game

A real-time multiplayer word puzzle game built with Node.js and WebSockets where players race to solve word chains.

## Overview

Chain Reaction is a chain reaction puzzle game where players must figure out the missing words in a chain. The first and last words are always visible, and players must discover the connecting words in between by revealing letters and making guesses.

**Example Chain:** `foot` → `ball` → `game` → `point`

## Features

### Game Mechanics
- **10 Rounds per Game** with varying chain lengths (4-7 words)
- **First-to-solve scoring** - First player to complete the chain wins the round
- **Letter Reveal System** - Click any unsolved word to reveal one letter (last letter cannot be revealed)
- **Word Guessing** - Click the blue guess button to attempt solving a word
- **Directional Word Pairs** - Word chains follow directional relationships from the word list

### Round Configuration
- Round 1: 5 words
- Round 2: 4 words
- Round 3: 6 words
- Round 4: 4 words
- Round 5: 7 words
- Round 6: 4 words
- Round 7: 7 words
- Round 8: 4 words
- Round 9: 7 words
- Round 10: 5 words

### Interface
- **Sticky Status Bar** - Shows current round, name input, and theme toggle
- **Play Area** - Interactive word chain display
- **Leaderboard** - Real-time player rankings sorted by score
- **Event Log** - Live feed of game events
- **Winner Modal** - Celebration with confetti animation for game winners

### User Experience
- **Auto-join** - Players join immediately as "Guest" (no authentication required)
- **Auto-save Name** - Name updates automatically as you type (saved to localStorage)
- **Light/Dark Mode** - Toggle between themes with preference saved
- **Fully Responsive** - Optimized for desktop, tablet, and mobile devices
- **Real-time Updates** - WebSocket communication for instant synchronization

## Technology Stack

### Backend
- **Node.js** with Express
- **WebSocket (ws)** for real-time communication
- **BFS Algorithm** for chain generation from word pairs

### Frontend
- **jQuery** for DOM manipulation
- **Vanilla JavaScript** for game logic
- **Canvas API** for confetti animations
- **CSS3** with custom properties for theming

### Project Structure
```
ChainReaction/
├── data/
│   └── words.json          # Word pair database
├── public/
│   ├── client.js           # Client-side game logic
│   ├── shared.js           # Shared utilities
│   ├── index.html          # Main HTML structure
│   ├── styles.css          # Responsive styling with themes
│   └── jquery-3.7.1.min.js
├── src/
│   └── server.js           # Server and WebSocket logic
└── package.json
```

## How to Play

1. **Join the Game** - Enter your name in the status bar (optional)
2. **View the Chain** - First and last words are always visible
3. **Reveal Letters** - Click on an unsolved word to reveal one letter at a time
4. **Make Guesses** - Click the blue button next to a word to guess it
5. **Complete the Chain** - First player to solve all words wins the round
6. **Win the Game** - Player with the most round wins after 10 rounds is the champion

## Gameplay Rules

- Word pairs are directional (e.g., `foot → ball` but not `ball → foot`)
- The last letter of each word cannot be revealed and must be guessed
- Incorrect guesses automatically reveal another letter
- All players compete on the same word chain each round
- Scores reset to zero after 10 rounds

## Installation & Running

```bash
# Install dependencies
npm install

# Start the server
npm start

# Access the game
http://localhost:3000
```

## Development

The game uses a shared module pattern where `shared.js` contains functions used by both client and server, ensuring consistent game logic across the stack.

### Key Components
- **Chain Generation** - BFS algorithm creates valid word chains from directional pairs
- **State Management** - Server maintains authoritative game state
- **Real-time Sync** - WebSocket broadcasts keep all clients updated
- **Player-specific State** - Each player tracks their own revealed letters

## Word Data

The game includes a curated list of compound word pairs in `data/words.json`. Each pair represents a valid connection where the second word can follow the first (e.g., `["fire", "truck"]`).

## Credits

Built with Node.js, Express, WebSockets, and modern web technologies.

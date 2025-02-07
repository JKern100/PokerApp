// server.js
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// In-memory store for game sessions
// Each session contains players, transactions, and counters.
let games = {};

// Helper to generate a random game code (6-character alphanumeric)
function generateGameCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Helper to get a game session by code
function getGameSession(gameCode) {
  return games[gameCode];
}

/** API Endpoints **/

// POST /api/newgame – Create a new game session with players.
// The request should include a players array (each with a name and optional extra info).
app.post('/api/newgame', (req, res) => {
  const { players: newPlayers } = req.body;
  if (!Array.isArray(newPlayers) || newPlayers.length < 1) {
    return res.status(400).json({ error: 'A non-empty players array is required.' });
  }
  // Generate a unique game code
  let gameCode = generateGameCode();
  while (games[gameCode]) {
    gameCode = generateGameCode();
  }

  // Initialize the game session data
  const session = {
    players: [],
    transactions: [],
    playerIdCounter: 1,
    transactionIdCounter: 1
  };

  // Add each player to the session
  newPlayers.forEach(p => {
    if (!p.name) return;
    session.players.push({ id: session.playerIdCounter++, name: p.name });
  });

  // Record any extra chip transactions for each player
  newPlayers.forEach(p => {
    if (p.extra && p.extra.amount && p.extra.amount > 0) {
      let paymentType = p.extra.paymentType;
      if (!paymentType || !['cash', 'iou'].includes(paymentType)) {
        paymentType = 'cash';
      }
      const from = (p.extra.from && p.extra.from.trim()) ? p.extra.from.trim() : 'bank';
      if (from.toLowerCase() === 'bank') {
        session.transactions.push({
          id: session.transactionIdCounter++,
          type: 'buy',
          from: 'bank',
          to: p.name,
          amount: p.extra.amount,
          paymentType: paymentType
        });
      } else {
        session.transactions.push({
          id: session.transactionIdCounter++,
          type: 'transfer',
          from: from,
          to: p.name,
          amount: p.extra.amount,
          paymentType: paymentType
        });
      }
    }
  });

  games[gameCode] = session;
  res.json({ success: true, gameCode, players: session.players });
});

// GET /api/summary – Compute chip counts, IOU summary, and bank summary for a game session.
app.get('/api/summary', (req, res) => {
  const gameCode = req.query.gameCode;
  const session = getGameSession(gameCode);
  if (!session) return res.status(400).json({ error: 'Invalid game code.' });

  // Initialize per-player summary
  let summary = {};
  session.players.forEach(player => {
    summary[player.name] = {
      chipsPurchased: 0,
      chipsReceived: 0,
      chipsGiven: 0,
      currentChips: 0
    };
  });

  // Initialize bank summary variables
  let bankIssued = 0;
  let bankCashReceived = 0;
  let bankIouAmount = 0;

  // Process transactions
  session.transactions.forEach(tx => {
    if (tx.type === 'buy') {
      if (summary[tx.to]) {
        summary[tx.to].chipsPurchased += tx.amount;
      }
      bankIssued += tx.amount;
      if (tx.paymentType === 'cash') {
        bankCashReceived += tx.amount;
      } else if (tx.paymentType === 'iou') {
        bankIouAmount += tx.amount;
      }
    } else if (tx.type === 'transfer') {
      if (summary[tx.from]) {
        summary[tx.from].chipsGiven += tx.amount;
      }
      if (summary[tx.to]) {
        summary[tx.to].chipsReceived += tx.amount;
      }
    }
  });

  // Calculate current chips for each player
  for (const name in summary) {
    summary[name].currentChips =
      summary[name].chipsPurchased + summary[name].chipsReceived - summary[name].chipsGiven;
  }

  // Compute IOU settlements between players
  let ious = {};
  session.players.forEach(player => {
    ious[player.name] = {};
  });
  session.transactions.forEach(tx => {
    if (tx.type === 'transfer' && tx.paymentType === 'iou') {
      ious[tx.from][tx.to] = (ious[tx.from][tx.to] || 0) + tx.amount;
    }
  });

  let settlements = [];
  session.players.forEach(playerA => {
    session.players.forEach(playerB => {
      if (playerA.name === playerB.name) return;
      const oweAtoB = ious[playerA.name][playerB.name] || 0;
      const oweBtoA = ious[playerB.name][playerA.name] || 0;
      const net = oweAtoB - oweBtoA;
      if (net > 0) {
        settlements.push({
          from: playerA.name,
          to: playerB.name,
          amount: net
        });
      }
    });
  });

  let bankSummary = {
    chipsIssued: bankIssued,
    cashReceived: bankCashReceived,
    iouAmount: bankIouAmount
  };

  res.json({ summary, settlements, bankSummary });
});

// POST /api/transactions – Add a transaction to a game session.
app.post('/api/transactions', (req, res) => {
  const { gameCode, type, from, to, amount, paymentType } = req.body;
  const session = getGameSession(gameCode);
  if (!session) return res.status(400).json({ error: 'Invalid game code.' });
  if (!type || !to || !amount) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }
  if (type === 'buy') {
    let pType = paymentType;
    if (!pType || !['cash', 'iou'].includes(pType)) {
      pType = 'cash';
    }
    session.transactions.push({
      id: session.transactionIdCounter++,
      type,
      from: 'bank',
      to,
      amount,
      paymentType: pType
    });
    return res.json({ success: true });
  } else if (type === 'transfer') {
    if (!from) {
      return res.status(400).json({ error: 'Transfer transactions require "from".' });
    }
    if (!paymentType || !['cash', 'iou'].includes(paymentType)) {
      return res.status(400).json({ error: 'paymentType must be either "cash" or "iou".' });
    }
    session.transactions.push({
      id: session.transactionIdCounter++,
      type,
      from,
      to,
      amount,
      paymentType
    });
    return res.json({ success: true });
  } else {
    return res.status(400).json({ error: 'Invalid transaction type.' });
  }
});

// POST /api/players – Add a player to an existing game session.
app.post('/api/players', (req, res) => {
  const { gameCode, name } = req.body;
  const session = getGameSession(gameCode);
  if (!session) return res.status(400).json({ error: 'Invalid game code.' });
  if (!name) {
    return res.status(400).json({ error: 'Name is required.' });
  }
  // Prevent duplicate player names
  if (session.players.find(p => p.name.toLowerCase() === name.toLowerCase())) {
    return res.status(400).json({ error: 'Player already exists.' });
  }
  const player = { id: session.playerIdCounter++, name };
  session.players.push(player);
  res.json(player);
});

// Fallback: Serve index.html for any other routes (for single-page applications)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

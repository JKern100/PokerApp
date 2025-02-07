// public/script.js

// Global variable to store the current game code
let currentGameCode = null;

// Helper function: Fetch JSON from an endpoint; appends gameCode if available
async function fetchJSON(url, options = {}) {
  // If method is GET and currentGameCode is set, append it as a query parameter.
  if (!options.method || options.method.toUpperCase() === 'GET') {
    if (currentGameCode) {
      const separator = url.includes('?') ? '&' : '?';
      url += `${separator}gameCode=${currentGameCode}`;
    }
  } else {
    // For POST requests, include gameCode in the JSON body if not already provided.
    if (currentGameCode) {
      const bodyData = options.body ? JSON.parse(options.body) : {};
      if (!bodyData.gameCode) {
        bodyData.gameCode = currentGameCode;
        options.body = JSON.stringify(bodyData);
      }
    }
  }
  const res = await fetch(url, options);
  return await res.json();
}

/* ----- Login Section Logic ----- */
// Show login section, hide appSection by default.
document.getElementById('loginSection').style.display = 'block';
document.getElementById('appSection').style.display = 'none';

// Handle "Start New Game" button click.
document.getElementById('startNewGameBtn').addEventListener('click', () => {
  // Hide loginSection and show new game setup form.
  document.getElementById('loginSection').style.display = 'none';
  document.getElementById('newGameSetup').style.display = 'block';
  document.getElementById('appSection').style.display = 'block';
});

// Handle join game form submission.
document.getElementById('joinGameForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = document.getElementById('joinGameCode').value.trim().toUpperCase();
  if (!code) {
    alert("Please enter a valid game code.");
    return;
  }
  currentGameCode = code;
  // Hide login section and show the app
  document.getElementById('loginSection').style.display = 'none';
  document.getElementById('appSection').style.display = 'block';
  // Display the game code
  document.getElementById('gameInfo').innerText = `Game Code: ${currentGameCode}`;
  loadSummary();
});

/* ----- New Game Setup (Sequential Player Input) ----- */
let totalPlayers = 0;
let currentPlayerIndex = 0;
let newGamePlayers = [];

// Step 1: After user enters number of players
document.getElementById('startPlayersBtn').addEventListener('click', () => {
  const num = parseInt(document.getElementById('numPlayers').value, 10);
  if (isNaN(num) || num < 1) {
    alert("Please enter a valid number of players.");
    return;
  }
  totalPlayers = num;
  currentPlayerIndex = 0;
  newGamePlayers = [];
  
  // Hide step1 and show step2 for player details input
  document.getElementById('step1').style.display = 'none';
  document.getElementById('step2').style.display = 'block';
  updatePlayerLabel();
});

// Update the label to show which player is being entered
function updatePlayerLabel() {
  document.getElementById('playerLabel').innerText = `Enter name for Player ${currentPlayerIndex + 1} of ${totalPlayers}:`;
}

// When the "Add Player" button is clicked
document.getElementById('addPlayerBtn').addEventListener('click', () => {
  const name = document.getElementById('playerNameInput').value.trim();
  if (!name) {
    alert("Please enter a player's name.");
    return;
  }
  
  // Get extra chip details (optional)
  const extraChips = parseInt(document.getElementById('extraChipsInput').value, 10) || 0;
  const extraFrom = document.getElementById('extraFromInput').value.trim() || 'bank';
  const extraPayment = document.getElementById('extraPaymentInput').value;
  
  // Build the player data object
  const playerData = { name };
  if (extraChips > 0) {
    playerData.extra = {
      amount: extraChips,
      from: extraFrom,
      paymentType: extraPayment
    };
  }
  
  // Add this player's details to the array
  newGamePlayers.push(playerData);
  
  // Update the players list display
  const list = document.getElementById('playersList');
  const li = document.createElement('li');
  li.innerText = name + (extraChips > 0 ? ` (Extra: ${extraChips} chips from ${extraFrom}, ${extraPayment})` : '');
  list.appendChild(li);
  
  // Clear the input fields for the next player
  document.getElementById('playerNameInput').value = '';
  document.getElementById('extraChipsInput').value = '';
  document.getElementById('extraFromInput').value = 'bank';
  document.getElementById('extraPaymentInput').value = 'cash';
  
  currentPlayerIndex++;
  if (currentPlayerIndex < totalPlayers) {
    updatePlayerLabel();
  } else {
    // All players have been entered—hide step2 and show finalize button
    document.getElementById('step2').style.display = 'none';
    document.getElementById('finalizeGameBtn').style.display = 'block';
  }
});

// When the New Game form is submitted, send data to the server to create a game session
document.getElementById('newGameForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (newGamePlayers.length !== totalPlayers) {
    alert("Please add all players before starting the game.");
    return;
  }
  const result = await fetchJSON('/api/newgame', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ players: newGamePlayers })
  });
  if (result.error) {
    alert(result.error);
  } else {
    currentGameCode = result.gameCode;
    alert("New game started! Share this code: " + currentGameCode);
    // Display game code
    document.getElementById('gameInfo').innerText = `Game Code: ${currentGameCode}`;
    loadSummary();
    // Optionally, reset the New Game form for future use:
    document.getElementById('newGameForm').reset();
    document.getElementById('step1').style.display = 'block';
    document.getElementById('step2').style.display = 'none';
    document.getElementById('finalizeGameBtn').style.display = 'none';
    document.getElementById('playersList').innerHTML = '';
  }
});

/* ----- Legacy: Add Player Form ----- */
document.getElementById('playerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('playerName').value.trim();
  if (!name) return;
  const result = await fetchJSON('/api/players', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  if (result.error) {
    alert(result.error);
  } else {
    alert(`Player ${result.name} added!`);
    document.getElementById('playerName').value = '';
    loadSummary();
  }
});

/* ----- Transaction Form Logic ----- */
document.getElementById('txType').addEventListener('change', (e) => {
  const type = e.target.value;
  if (type === 'transfer') {
    document.getElementById('fromGroup').style.display = 'block';
  } else {
    document.getElementById('fromGroup').style.display = 'none';
  }
});

document.getElementById('transactionForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const type = document.getElementById('txType').value;
  const to = document.getElementById('txTo').value.trim();
  const amount = parseInt(document.getElementById('txAmount').value, 10);
  const paymentType = document.getElementById('paymentType').value;
  
  let data = { type, to, amount, paymentType };
  if (type === 'transfer') {
    const from = document.getElementById('txFrom').value.trim();
    if (!from) {
      alert("Please enter a sender name for transfer.");
      return;
    }
    data.from = from;
  }
  const result = await fetchJSON('/api/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (result.error) {
    alert(result.error);
  } else {
    alert("Transaction recorded!");
    document.getElementById('transactionForm').reset();
    document.getElementById('fromGroup').style.display = 'none';
    loadSummary();
  }
});

/* ----- Summary Display Logic ----- */
async function loadSummary() {
  const data = await fetchJSON('/api/summary');
  const summaryDiv = document.getElementById('summary');
  let html = "<h5>Players</h5><ul>";
  for (const player in data.summary) {
    const s = data.summary[player];
    html += `<li><strong>${player}</strong>: Purchased: ${s.chipsPurchased}, Received: ${s.chipsReceived}, Given: ${s.chipsGiven}, Current: ${s.currentChips}</li>`;
  }
  html += "</ul>";

  // Bank Summary Section
  if (data.bankSummary) {
    html += `
      <h5>Bank Summary</h5>
      <ul>
        <li><strong>Chips Issued:</strong> ${data.bankSummary.chipsIssued}</li>
        <li><strong>Total Cash Received:</strong> ${data.bankSummary.cashReceived}</li>
        <li><strong>Total IOU Amount:</strong> ${data.bankSummary.iouAmount}</li>
      </ul>
    `;
  }

  if (data.settlements && data.settlements.length > 0) {
    html += "<h5>Settlements (IOUs)</h5><ul>";
    data.settlements.forEach(settle => {
      html += `<li>${settle.from} owes ${settle.to} ${settle.amount} chip(s)</li>`;
    });
    html += "</ul>";
  } else {
    html += "<p>No outstanding IOUs.</p>";
  }
  summaryDiv.innerHTML = html;
}

document.getElementById('refreshBtn').addEventListener('click', loadSummary);

// Initial summary load (if already logged in)
if (currentGameCode) {
  loadSummary();
}

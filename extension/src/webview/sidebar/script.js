// GitRPG Sidebar Script
// eslint-disable-next-line no-undef
const vscode = acquireVsCodeApi();

// Initialize from injected data
const data = window.__DATA__ || {};

function init() {
  if (data.character) {
    updateCharacter(data.character);
  }
  if (data.todayStats) {
    updateTodayStats(data.todayStats);
  }
  if (data.spriteUri) {
    document.getElementById('spriteImg').src = data.spriteUri;
  }
}

function updateCharacter(char) {
  document.getElementById('charName').textContent = char.name;
  document.getElementById('charClass').textContent = `Level ${char.level} ${char.class}`;

  const xpPercent = Math.round((char.xp / char.xpToNextLevel) * 100);
  document.getElementById('xpBar').style.width = `${xpPercent}%`;
  document.getElementById('xpValue').textContent = `${char.xp} / ${char.xpToNextLevel}`;
  document.getElementById('goldValue').textContent = `${char.gold}`;
}

function updateTodayStats(today) {
  document.getElementById('commits').textContent = today.commits;
  document.getElementById('xpEarned').textContent = `+${today.xpEarned}`;
}

function openDashboard() {
  vscode.postMessage({ type: 'command', command: 'gitrpg.showDashboard' });
}

function checkCommits() {
  vscode.postMessage({ type: 'command', command: 'gitrpg.checkCommits' });
}

// Listen for state updates
window.addEventListener('message', event => {
  const message = event.data;
  if (message.type === 'stateUpdate') {
    if (message.character) {
      updateCharacter(message.character);
    }
    if (message.todayStats) {
      updateTodayStats(message.todayStats);
    }
    if (message.spriteUri) {
      document.getElementById('spriteImg').src = message.spriteUri;
    }
  }
});

// Initialize on load
init();

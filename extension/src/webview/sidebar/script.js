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

/**
 * Execute callback when DOM is ready, or immediately if already loaded
 */
function onReady(fn) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn);
  } else {
    fn();
  }
}

/**
 * Safely set text content for an element by ID
 */
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/**
 * Safely set a style property for an element by ID
 */
function setStyle(id, property, value) {
  const el = document.getElementById(id);
  if (el) el.style[property] = value;
}

function updateCharacter(char) {
  setText('charName', char.name);
  setText('charClass', `Level ${char.level} ${char.class}`);

  const xpPercent = Math.round((char.xp / char.xpToNextLevel) * 100);
  setStyle('xpBar', 'width', `${xpPercent}%`);
  setText('xpValue', `${char.xp} / ${char.xpToNextLevel}`);
  setText('goldValue', `${char.gold}`);
}

function updateTodayStats(today) {
  setText('commits', today.commits);
  setText('xpEarned', `+${today.xpEarned}`);
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

// Initialize on load and attach event listeners
// (CSP blocks inline onclick handlers, so we use addEventListener)
onReady(function() {
  // Initialize UI with data
  init();

  // Attach button event listeners
  const openDashboardBtn = document.getElementById('openDashboardBtn');
  const checkCommitsBtn = document.getElementById('checkCommitsBtn');

  if (openDashboardBtn) openDashboardBtn.addEventListener('click', openDashboard);
  if (checkCommitsBtn) checkCommitsBtn.addEventListener('click', checkCommits);
});

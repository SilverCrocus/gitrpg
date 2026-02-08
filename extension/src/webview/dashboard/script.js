// Dashboard Webview Script
// Data is available as window.__DATA__

const vscode = acquireVsCodeApi();

// Get initial data from injected window.__DATA__
const initialData = window.__DATA__ || {};
const spriteUris = initialData.spriteUris || {};

// Initialize the UI with initial data if present
if (initialData.character) {
  updateCharacterUI(initialData.character);
}
if (initialData.todayStats) {
  updateTodayStatsUI(initialData.todayStats);
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

/**
 * Send a message to the extension
 */
function sendMessage(type, data) {
  vscode.postMessage({ type, ...data });
}

/**
 * Escape HTML special characters to prevent XSS
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return String(str);
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return str.replace(/[&<>"']/g, function(c) { return map[c]; });
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
 * Update character UI elements
 */
function updateCharacterUI(char) {
  setText('charName', char.name);
  setText('level', char.level);
  setText('class', char.class);
  setText('xp', char.xp);
  setText('xpNext', char.xpToNextLevel);
  setStyle('xpBar', 'width', (char.xp / char.xpToNextLevel * 100) + '%');
  setText('gold', char.gold);

  const spriteImgEl = document.getElementById('spriteImg');
  if (spriteImgEl && spriteUris[char.class.toLowerCase()]) {
    spriteImgEl.src = spriteUris[char.class.toLowerCase()];
    spriteImgEl.alt = char.class;
  }
}

/**
 * Update today's stats UI elements
 */
function updateTodayStatsUI(today) {
  setText('commits', today.commits);
  setText('linesAdded', '+' + today.linesAdded);
  setText('linesRemoved', '-' + today.linesRemoved);
  setText('filesChanged', today.filesChanged);
  setText('xpEarned', '+' + today.xpEarned);
}

/**
 * Render quests list
 */
function renderQuests(quests, isAuthenticated) {
  const questsList = document.getElementById('questsList');
  if (!questsList) return;

  if (!isAuthenticated) {
    questsList.innerHTML = '<p class="muted">Connect account to see quests</p>';
    return;
  }
  if (!quests || quests.length === 0) {
    questsList.innerHTML = '<p class="muted">No active quests. Check back tomorrow!</p>';
    return;
  }

  let html = '';
  for (const quest of quests) {
    const progress = Math.min(100, (quest.requirement_current / quest.requirement_target) * 100);
    const isComplete = quest.status === 'completed';
    const isClaimed = quest.status === 'claimed';

    html += '<div class="quest-item ' + (isComplete ? 'completed' : '') + '">';
    html += '  <div class="quest-header">';
    html += '    <span class="quest-title">' + (isComplete ? '[DONE] ' : '') + escapeHtml(quest.title) + '</span>';
    html += '    <span class="quest-reward">+' + escapeHtml(quest.reward_xp) + ' XP, +' + escapeHtml(quest.reward_gold) + ' Gold</span>';
    html += '  </div>';
    html += '  <div class="quest-description">' + escapeHtml(quest.description) + '</div>';
    html += '  <div class="quest-progress-bar">';
    html += '    <div class="quest-progress-fill ' + (isComplete ? 'complete' : '') + '" style="width: ' + progress + '%"></div>';
    html += '  </div>';
    html += '  <div class="quest-progress-text">' + escapeHtml(quest.requirement_current) + ' / ' + escapeHtml(quest.requirement_target) + '</div>';
    if (isComplete && !isClaimed) {
      html += '  <button class="claim-btn" data-quest-id="' + escapeHtml(quest.id) + '">Claim Reward</button>';
    }
    html += '</div>';
  }
  questsList.innerHTML = html;
}

/**
 * Render workers summary
 */
function renderWorkers(summary, isAuthenticated) {
  if (!isAuthenticated) return;

  const workerCountEl = document.getElementById('workerCount');
  const goldPerHourEl = document.getElementById('goldPerHour');
  const pendingGoldEl = document.getElementById('pendingGold');

  if (workerCountEl) workerCountEl.textContent = summary.workerCount;
  if (goldPerHourEl) goldPerHourEl.textContent = summary.totalGoldPerHour;
  if (pendingGoldEl) pendingGoldEl.textContent = summary.pendingGold;
}

// Pending request handlers
function acceptFriendRequest(friendId) {
  sendMessage('acceptFriend', { friendId });
}

function declineFriendRequest(friendId) {
  sendMessage('declineFriend', { friendId });
}

function acceptPvpChallenge(battleId) {
  sendMessage('acceptPvp', { battleId });
}

function declinePvpChallenge(battleId) {
  sendMessage('declinePvp', { battleId });
}

function joinBossBattle(lobbyId) {
  sendMessage('joinBoss', { lobbyId });
}

function declineBossInvite(lobbyId) {
  sendMessage('declineBoss', { lobbyId });
}

/**
 * Render pending requests (friend requests, PvP challenges, boss invites)
 */
function renderPendingRequests(friendRequests, pvpChallenges, bossInvites) {
  const section = document.getElementById('pendingRequestsSection');
  const list = document.getElementById('pendingRequestsList');

  if (!section || !list) return;

  const totalPending = (friendRequests?.length || 0) + (pvpChallenges?.length || 0) + (bossInvites?.length || 0);

  if (totalPending === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  let html = '';

  // Friend requests
  for (const req of (friendRequests || [])) {
    html += '<div class="request-item friend">';
    html += '  <div class="request-info">';
    html += '    <div class="request-type">Friend Request</div>';
    html += '    <div class="request-name">' + escapeHtml(req.displayName) + '</div>';
    html += '    <div class="request-detail">Lv.' + escapeHtml(req.level) + ' ' + escapeHtml(req.characterClass) + '</div>';
    html += '  </div>';
    html += '  <div class="request-actions">';
    html += '    <button class="request-btn accept accept-friend-btn" data-friend-id="' + escapeHtml(req.id) + '">Accept</button>';
    html += '    <button class="request-btn decline decline-friend-btn" data-friend-id="' + escapeHtml(req.id) + '">Decline</button>';
    html += '  </div>';
    html += '</div>';
  }

  // PvP challenges
  for (const challenge of (pvpChallenges || [])) {
    html += '<div class="request-item pvp">';
    html += '  <div class="request-info">';
    html += '    <div class="request-type">PvP Challenge</div>';
    html += '    <div class="request-name">' + escapeHtml(challenge.challengerName) + '</div>';
    html += '    <div class="request-detail">Lv.' + escapeHtml(challenge.challengerLevel) + ' ' + escapeHtml(challenge.challengerClass) + '</div>';
    html += '  </div>';
    html += '  <div class="request-actions">';
    html += '    <button class="request-btn accept accept-pvp-btn" data-battle-id="' + escapeHtml(challenge.id) + '">Fight!</button>';
    html += '    <button class="request-btn decline decline-pvp-btn" data-battle-id="' + escapeHtml(challenge.id) + '">Decline</button>';
    html += '  </div>';
    html += '</div>';
  }

  // Boss invites
  for (const invite of (bossInvites || [])) {
    html += '<div class="request-item boss">';
    html += '  <div class="request-info">';
    html += '    <div class="request-type">Boss Raid Invite</div>';
    html += '    <div class="request-name">' + escapeHtml(invite.challengerName) + '</div>';
    html += '    <div class="request-detail">vs ' + escapeHtml(invite.bossName) + '</div>';
    html += '  </div>';
    html += '  <div class="request-actions">';
    html += '    <button class="request-btn accept join-boss-btn" data-lobby-id="' + escapeHtml(invite.lobbyId) + '">Join!</button>';
    html += '    <button class="request-btn decline decline-boss-btn" data-lobby-id="' + escapeHtml(invite.lobbyId) + '">Decline</button>';
    html += '  </div>';
    html += '</div>';
  }

  list.innerHTML = html;
}

// Listen for messages from the extension
window.addEventListener('message', event => {
  const message = event.data;

  if (message.type === 'navigate') {
    // Handle navigation to specific view
    const view = message.view;
    // Scroll to the appropriate section based on view
    if (view === 'character') {
      document.querySelector('.character-header')?.scrollIntoView({ behavior: 'smooth' });
    } else if (view === 'battle') {
      // For battle view, we could show a battle section if it exists
      console.log('Navigate to battle view');
    }
    // 'dashboard' is the default, no scroll needed
  } else if (message.type === 'stateUpdate') {
    // Update character UI if data provided
    if (message.character) {
      updateCharacterUI(message.character);
    }

    // Update today's stats if data provided
    if (message.todayStats) {
      updateTodayStatsUI(message.todayStats);
    }

    // Render quests, workers, and pending requests
    renderQuests(message.quests, message.isAuthenticated);
    renderWorkers(message.workerSummary, message.isAuthenticated);
    renderPendingRequests(message.pendingFriendRequests, message.pendingPvpChallenges, message.pendingBossInvites);
  }
});

/**
 * Attach click handler to a button by ID
 */
function attachHandler(id, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', handler);
}

// Attach event listeners to static buttons
// (CSP blocks inline onclick handlers, so we use addEventListener)
onReady(function() {
  // Action buttons - use sendMessage helper for simple message types
  attachHandler('checkCommitsBtn', function() { sendMessage('checkCommits'); });
  attachHandler('changeNameBtn', function() { sendMessage('requestNameChange'); });
  attachHandler('changeClassBtn', function() { sendMessage('requestClassChange'); });
  attachHandler('collectGoldBtn', function() { sendMessage('collectGold'); });
  attachHandler('manageWorkersBtn', function() { sendMessage('manageWorkers'); });

  // Event delegation for dynamically created buttons
  document.addEventListener('click', function(e) {
    const target = e.target;
    const { questId, friendId, battleId, lobbyId } = target.dataset;

    // Quest claim buttons
    if (target.classList.contains('claim-btn') && questId) {
      sendMessage('claimQuest', { questId });
    }

    // Friend request buttons
    if (target.classList.contains('accept-friend-btn') && friendId) {
      acceptFriendRequest(friendId);
    }
    if (target.classList.contains('decline-friend-btn') && friendId) {
      declineFriendRequest(friendId);
    }

    // PvP challenge buttons
    if (target.classList.contains('accept-pvp-btn') && battleId) {
      acceptPvpChallenge(battleId);
    }
    if (target.classList.contains('decline-pvp-btn') && battleId) {
      declinePvpChallenge(battleId);
    }

    // Boss battle buttons
    if (target.classList.contains('join-boss-btn') && lobbyId) {
      joinBossBattle(lobbyId);
    }
    if (target.classList.contains('decline-boss-btn') && lobbyId) {
      declineBossInvite(lobbyId);
    }
  });
});

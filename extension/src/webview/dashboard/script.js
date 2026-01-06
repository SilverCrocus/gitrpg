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
 * Update character UI elements
 */
function updateCharacterUI(char) {
  const charNameEl = document.getElementById('charName');
  const levelEl = document.getElementById('level');
  const classEl = document.getElementById('class');
  const xpEl = document.getElementById('xp');
  const xpNextEl = document.getElementById('xpNext');
  const xpBarEl = document.getElementById('xpBar');
  const goldEl = document.getElementById('gold');
  const spriteImgEl = document.getElementById('spriteImg');

  if (charNameEl) charNameEl.textContent = char.name;
  if (levelEl) levelEl.textContent = char.level;
  if (classEl) classEl.textContent = char.class;
  if (xpEl) xpEl.textContent = char.xp;
  if (xpNextEl) xpNextEl.textContent = char.xpToNextLevel;
  if (xpBarEl) xpBarEl.style.width = (char.xp / char.xpToNextLevel * 100) + '%';
  if (goldEl) goldEl.textContent = char.gold;
  if (spriteImgEl && spriteUris[char.class.toLowerCase()]) {
    spriteImgEl.src = spriteUris[char.class.toLowerCase()];
    spriteImgEl.alt = char.class;
  }
}

/**
 * Update today's stats UI elements
 */
function updateTodayStatsUI(today) {
  const commitsEl = document.getElementById('commits');
  const linesAddedEl = document.getElementById('linesAdded');
  const linesRemovedEl = document.getElementById('linesRemoved');
  const filesChangedEl = document.getElementById('filesChanged');
  const xpEarnedEl = document.getElementById('xpEarned');

  if (commitsEl) commitsEl.textContent = today.commits;
  if (linesAddedEl) linesAddedEl.textContent = '+' + today.linesAdded;
  if (linesRemovedEl) linesRemovedEl.textContent = '-' + today.linesRemoved;
  if (filesChangedEl) filesChangedEl.textContent = today.filesChanged;
  if (xpEarnedEl) xpEarnedEl.textContent = '+' + today.xpEarned;
}

// Action button handlers
function checkCommits() {
  vscode.postMessage({ type: 'checkCommits' });
}

function changeName() {
  vscode.postMessage({ type: 'requestNameChange' });
}

function changeClass() {
  vscode.postMessage({ type: 'requestClassChange' });
}

function showQuests() {
  vscode.postMessage({ type: 'showQuests' });
}

function manageWorkers() {
  vscode.postMessage({ type: 'manageWorkers' });
}

function collectGold() {
  vscode.postMessage({ type: 'collectGold' });
}

function claimQuest(questId) {
  vscode.postMessage({ type: 'claimQuest', questId: questId });
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
    html += '    <span class="quest-title">' + (isComplete ? '[DONE] ' : '') + quest.title + '</span>';
    html += '    <span class="quest-reward">+' + quest.reward_xp + ' XP, +' + quest.reward_gold + ' Gold</span>';
    html += '  </div>';
    html += '  <div class="quest-description">' + quest.description + '</div>';
    html += '  <div class="quest-progress-bar">';
    html += '    <div class="quest-progress-fill ' + (isComplete ? 'complete' : '') + '" style="width: ' + progress + '%"></div>';
    html += '  </div>';
    html += '  <div class="quest-progress-text">' + quest.requirement_current + ' / ' + quest.requirement_target + '</div>';
    if (isComplete && !isClaimed) {
      html += '  <button class="claim-btn" data-quest-id="' + quest.id + '">Claim Reward</button>';
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
  vscode.postMessage({ type: 'acceptFriend', friendId: friendId });
}

function declineFriendRequest(friendId) {
  vscode.postMessage({ type: 'declineFriend', friendId: friendId });
}

function acceptPvpChallenge(battleId) {
  vscode.postMessage({ type: 'acceptPvp', battleId: battleId });
}

function declinePvpChallenge(battleId) {
  vscode.postMessage({ type: 'declinePvp', battleId: battleId });
}

function joinBossBattle(lobbyId) {
  vscode.postMessage({ type: 'joinBoss', lobbyId: lobbyId });
}

function declineBossInvite(lobbyId) {
  vscode.postMessage({ type: 'declineBoss', lobbyId: lobbyId });
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
    html += '    <div class="request-name">' + req.displayName + '</div>';
    html += '    <div class="request-detail">Lv.' + req.level + ' ' + req.characterClass + '</div>';
    html += '  </div>';
    html += '  <div class="request-actions">';
    html += '    <button class="request-btn accept accept-friend-btn" data-friend-id="' + req.id + '">Accept</button>';
    html += '    <button class="request-btn decline decline-friend-btn" data-friend-id="' + req.id + '">Decline</button>';
    html += '  </div>';
    html += '</div>';
  }

  // PvP challenges
  for (const challenge of (pvpChallenges || [])) {
    html += '<div class="request-item pvp">';
    html += '  <div class="request-info">';
    html += '    <div class="request-type">PvP Challenge</div>';
    html += '    <div class="request-name">' + challenge.challengerName + '</div>';
    html += '    <div class="request-detail">Lv.' + challenge.challengerLevel + ' ' + challenge.challengerClass + '</div>';
    html += '  </div>';
    html += '  <div class="request-actions">';
    html += '    <button class="request-btn accept accept-pvp-btn" data-battle-id="' + challenge.id + '">Fight!</button>';
    html += '    <button class="request-btn decline decline-pvp-btn" data-battle-id="' + challenge.id + '">Decline</button>';
    html += '  </div>';
    html += '</div>';
  }

  // Boss invites
  for (const invite of (bossInvites || [])) {
    html += '<div class="request-item boss">';
    html += '  <div class="request-info">';
    html += '    <div class="request-type">Boss Raid Invite</div>';
    html += '    <div class="request-name">' + invite.challengerName + '</div>';
    html += '    <div class="request-detail">vs ' + invite.bossName + '</div>';
    html += '  </div>';
    html += '  <div class="request-actions">';
    html += '    <button class="request-btn accept join-boss-btn" data-lobby-id="' + invite.lobbyId + '">Join!</button>';
    html += '    <button class="request-btn decline decline-boss-btn" data-lobby-id="' + invite.lobbyId + '">Decline</button>';
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

// Attach event listeners to static buttons
// (CSP blocks inline onclick handlers, so we use addEventListener)
document.addEventListener('DOMContentLoaded', function() {
  // Action buttons
  const checkCommitsBtn = document.getElementById('checkCommitsBtn');
  const changeNameBtn = document.getElementById('changeNameBtn');
  const changeClassBtn = document.getElementById('changeClassBtn');
  const collectGoldBtn = document.getElementById('collectGoldBtn');
  const manageWorkersBtn = document.getElementById('manageWorkersBtn');

  if (checkCommitsBtn) checkCommitsBtn.addEventListener('click', checkCommits);
  if (changeNameBtn) changeNameBtn.addEventListener('click', changeName);
  if (changeClassBtn) changeClassBtn.addEventListener('click', changeClass);
  if (collectGoldBtn) collectGoldBtn.addEventListener('click', collectGold);
  if (manageWorkersBtn) manageWorkersBtn.addEventListener('click', manageWorkers);

  // Event delegation for dynamically created buttons
  document.addEventListener('click', function(e) {
    const target = e.target;

    // Quest claim buttons
    if (target.classList.contains('claim-btn') && target.dataset.questId) {
      claimQuest(target.dataset.questId);
    }

    // Friend request buttons
    if (target.classList.contains('accept-friend-btn') && target.dataset.friendId) {
      acceptFriendRequest(target.dataset.friendId);
    }
    if (target.classList.contains('decline-friend-btn') && target.dataset.friendId) {
      declineFriendRequest(target.dataset.friendId);
    }

    // PvP challenge buttons
    if (target.classList.contains('accept-pvp-btn') && target.dataset.battleId) {
      acceptPvpChallenge(target.dataset.battleId);
    }
    if (target.classList.contains('decline-pvp-btn') && target.dataset.battleId) {
      declinePvpChallenge(target.dataset.battleId);
    }

    // Boss battle buttons
    if (target.classList.contains('join-boss-btn') && target.dataset.lobbyId) {
      joinBossBattle(target.dataset.lobbyId);
    }
    if (target.classList.contains('decline-boss-btn') && target.dataset.lobbyId) {
      declineBossInvite(target.dataset.lobbyId);
    }
  });
});

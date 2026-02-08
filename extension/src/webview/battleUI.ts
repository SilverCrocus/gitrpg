export function generateBattleHTML(
  fighter1Name: string,
  fighter1Class: string,
  fighter1Level: number,
  fighter2Name: string,
  fighter2Class: string,
  fighter2Level: number,
  nonce: string,
  cspSource: string
): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${cspSource} https: data:; font-src ${cspSource};">
  <title>GitRPG Battle</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: 'Press Start 2P', monospace;
      background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
      color: white;
      margin: 0;
      padding: 20px;
      min-height: 100vh;
    }

    .battle-arena {
      max-width: 600px;
      margin: 0 auto;
      position: relative;
      height: 400px;
      background: linear-gradient(180deg, transparent 60%, #2d4a3e 60%);
      border: 4px solid #4a4a6a;
      border-radius: 8px;
    }

    .fighter {
      position: absolute;
      bottom: 100px;
      text-align: center;
    }

    .fighter-left { left: 50px; }
    .fighter-right { right: 50px; }

    .fighter-sprite {
      width: 96px;
      height: 96px;
      image-rendering: pixelated;
      background-size: contain;
      margin: 0 auto;
    }

    .fighter-name {
      font-size: 10px;
      margin-top: 8px;
      text-shadow: 2px 2px #000;
    }

    .health-bar-container {
      position: absolute;
      top: 20px;
      width: 200px;
      padding: 10px;
      background: rgba(0,0,0,0.7);
      border: 2px solid #4a4a6a;
      border-radius: 4px;
    }

    .health-bar-left { left: 20px; }
    .health-bar-right { right: 20px; text-align: right; }

    .health-bar-name {
      font-size: 10px;
      margin-bottom: 5px;
    }

    .health-bar-level {
      font-size: 8px;
      color: #aaa;
      margin-bottom: 5px;
    }

    .health-bar {
      width: 100%;
      height: 16px;
      background: #333;
      border: 2px solid #666;
      border-radius: 2px;
      overflow: hidden;
    }

    .health-bar-fill {
      height: 100%;
      background: linear-gradient(180deg, #4ade80 0%, #22c55e 100%);
      transition: width 0.3s ease;
    }

    .health-bar-fill.low {
      background: linear-gradient(180deg, #ef4444 0%, #dc2626 100%);
    }

    .health-bar-fill.medium {
      background: linear-gradient(180deg, #facc15 0%, #eab308 100%);
    }

    .damage-popup {
      position: absolute;
      font-size: 24px;
      font-weight: bold;
      color: #ef4444;
      text-shadow: 2px 2px #000;
      animation: damageFloat 1s ease-out forwards;
      pointer-events: none;
    }

    .damage-popup.crit {
      color: #f59e0b;
      font-size: 32px;
    }

    @keyframes damageFloat {
      0% { opacity: 1; transform: translateY(0); }
      100% { opacity: 0; transform: translateY(-50px); }
    }

    .battle-log {
      max-width: 600px;
      margin: 20px auto;
      padding: 15px;
      background: rgba(0,0,0,0.5);
      border: 2px solid #4a4a6a;
      border-radius: 4px;
      max-height: 150px;
      overflow-y: auto;
      font-size: 10px;
    }

    .log-entry {
      margin: 5px 0;
      padding: 5px;
      border-bottom: 1px solid #333;
    }

    .log-entry.crit { color: #f59e0b; }

    .battle-controls {
      max-width: 600px;
      margin: 20px auto;
      display: flex;
      gap: 10px;
      justify-content: center;
    }

    .battle-btn {
      padding: 10px 20px;
      font-family: inherit;
      font-size: 10px;
      background: #4a4a6a;
      color: white;
      border: 2px solid #6a6a8a;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .battle-btn:hover {
      background: #5a5a7a;
      transform: translateY(-2px);
    }

    .battle-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .victory-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.8);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.5s;
    }

    .victory-overlay.visible {
      opacity: 1;
      pointer-events: auto;
    }

    .victory-text {
      font-size: 24px;
      color: #ffd700;
      text-shadow: 2px 2px #000;
      margin-bottom: 20px;
    }

    .rewards {
      font-size: 12px;
      color: #4ade80;
    }

    /* Animation states */
    .fighter-sprite.animation-idle { }
    .fighter-sprite.animation-attacking {
      animation: attackAnim 0.3s ease-out;
    }
    .fighter-sprite.animation-hurt {
      animation: hurtAnim 0.3s ease-out;
    }
    .fighter-sprite.animation-victory {
      animation: victoryAnim 0.5s ease-in-out infinite;
    }
    .fighter-sprite.animation-defeat {
      opacity: 0.5;
      filter: grayscale(100%);
    }

    @keyframes attackAnim {
      0% { transform: translateX(0); }
      50% { transform: translateX(20px); }
      100% { transform: translateX(0); }
    }

    @keyframes hurtAnim {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-10px); }
      75% { transform: translateX(10px); }
    }

    @keyframes victoryAnim {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-10px); }
    }
  </style>
</head>
<body>
  <div class="battle-arena" id="arena">
    <div class="health-bar-container health-bar-left">
      <div class="health-bar-name" id="p1-name">${escapeHtml(fighter1Name)}</div>
      <div class="health-bar-level">Lv.${fighter1Level} ${escapeHtml(fighter1Class)}</div>
      <div class="health-bar">
        <div class="health-bar-fill" id="p1-health" style="width: 100%"></div>
      </div>
    </div>

    <div class="health-bar-container health-bar-right">
      <div class="health-bar-name" id="p2-name">${escapeHtml(fighter2Name)}</div>
      <div class="health-bar-level">Lv.${fighter2Level} ${escapeHtml(fighter2Class)}</div>
      <div class="health-bar">
        <div class="health-bar-fill" id="p2-health" style="width: 100%"></div>
      </div>
    </div>

    <div class="fighter fighter-left" id="fighter1">
      <div class="fighter-sprite" id="sprite1"></div>
      <div class="fighter-name">${escapeHtml(fighter1Name)}</div>
    </div>

    <div class="fighter fighter-right" id="fighter2">
      <div class="fighter-sprite" id="sprite2"></div>
      <div class="fighter-name">${escapeHtml(fighter2Name)}</div>
    </div>

    <div class="victory-overlay" id="victoryOverlay">
      <div class="victory-text" id="victoryText">VICTORY!</div>
      <div class="rewards" id="rewardsText"></div>
    </div>
  </div>

  <div class="battle-log" id="battleLog"></div>

  <div class="battle-controls">
    <button class="battle-btn" id="skipBtn">Skip</button>
    <button class="battle-btn" id="closeBtn">Close</button>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    document.getElementById('skipBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'skip' });
    });

    document.getElementById('closeBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'close' });
    });

    window.addEventListener('message', event => {
      const message = event.data;

      switch (message.type) {
        case 'updateHealth':
          updateHealthBar(message.playerId, message.currentHp, message.maxHp);
          break;
        case 'showDamage':
          showDamagePopup(message.targetId, message.damage, message.isCrit);
          break;
        case 'updateAnimation':
          updateFighterAnimation(message.fighterId, message.animation);
          break;
        case 'addLogEntry':
          addLogEntry(message.text, message.isCrit);
          break;
        case 'showVictory':
          showVictory(message.winnerName, message.xp, message.gold);
          break;
      }
    });

    function updateHealthBar(playerId, current, max) {
      const bar = document.getElementById(playerId === 1 ? 'p1-health' : 'p2-health');
      const percent = (current / max) * 100;
      bar.style.width = percent + '%';

      bar.classList.remove('low', 'medium');
      if (percent <= 25) bar.classList.add('low');
      else if (percent <= 50) bar.classList.add('medium');
    }

    function showDamagePopup(targetId, damage, isCrit) {
      const fighter = document.getElementById(targetId === 1 ? 'fighter1' : 'fighter2');
      const popup = document.createElement('div');
      popup.className = 'damage-popup' + (isCrit ? ' crit' : '');
      popup.textContent = (isCrit ? 'CRIT! ' : '') + damage;
      popup.style.left = '50%';
      popup.style.top = '-20px';
      fighter.appendChild(popup);
      setTimeout(() => popup.remove(), 1000);
    }

    function addLogEntry(text, isCrit) {
      const log = document.getElementById('battleLog');
      const entry = document.createElement('div');
      entry.className = 'log-entry' + (isCrit ? ' crit' : '');
      entry.textContent = text;
      log.appendChild(entry);
      log.scrollTop = log.scrollHeight;
    }

    function showVictory(winnerName, xp, gold) {
      const overlay = document.getElementById('victoryOverlay');
      document.getElementById('victoryText').textContent = winnerName + ' WINS!';
      document.getElementById('rewardsText').textContent = '+' + xp + ' XP | +' + gold + ' Gold';
      overlay.classList.add('visible');
    }

    function updateFighterAnimation(fighterId, animation) {
      const sprite = document.getElementById(fighterId === 1 ? 'sprite1' : 'sprite2');
      sprite.className = 'fighter-sprite animation-' + animation;
    }
  </script>
</body>
</html>
`;
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, (char) => map[char] || char);
}

'use client';

import { useState, useEffect } from 'react';
import { CharacterSprite, CharacterClass } from '@/components/CharacterSprite';

// Types for the dashboard data
interface Character {
  name: string;
  class: string;
  level: number;
  xp: number;
  xpToNextLevel: number;
}

interface TodayStats {
  commits: number;
  linesAdded: number;
  linesRemoved: number;
  filesChanged: number;
  xpEarned: number;
}

interface WorkerData {
  gold: number;
  workers: number;
  goldPerHour: number;
  pendingGold: number;
}

interface Quest {
  id: string;
  title: string;
  description: string;
  current: number;
  target: number;
  xpReward: number;
  goldReward: number;
  status: 'active' | 'completed';
}

interface Battle {
  id: string;
  opponentName: string;
  opponentLevel: number;
  result: 'win' | 'loss';
  xpGained: number;
  goldGained: number;
  date: string;
}

// Mock data for demonstration
const mockCharacter: Character = {
  name: 'CodeWarrior',
  class: 'Warrior',
  level: 5,
  xp: 350,
  xpToNextLevel: 500,
};

const mockStats: TodayStats = {
  commits: 3,
  linesAdded: 247,
  linesRemoved: 45,
  filesChanged: 8,
  xpEarned: 120,
};

const mockWorkerData: WorkerData = {
  gold: 1250,
  workers: 3,
  goldPerHour: 15,
  pendingGold: 45,
};

const mockQuests: Quest[] = [
  {
    id: '1',
    title: 'Commit Warrior',
    description: 'Make 5 commits today',
    current: 3,
    target: 5,
    xpReward: 50,
    goldReward: 25,
    status: 'active',
  },
  {
    id: '2',
    title: 'Code Scribe',
    description: 'Add 500 lines of code',
    current: 247,
    target: 500,
    xpReward: 75,
    goldReward: 40,
    status: 'active',
  },
  {
    id: '3',
    title: 'File Master',
    description: 'Modify 10 files',
    current: 8,
    target: 10,
    xpReward: 40,
    goldReward: 20,
    status: 'active',
  },
];

const mockBattles: Battle[] = [
  {
    id: '1',
    opponentName: 'ShadowCoder',
    opponentLevel: 4,
    result: 'win',
    xpGained: 100,
    goldGained: 50,
    date: '2024-01-01',
  },
  {
    id: '2',
    opponentName: 'ByteKnight',
    opponentLevel: 6,
    result: 'loss',
    xpGained: 25,
    goldGained: 10,
    date: '2024-01-01',
  },
];


// Progress Bar Component
function ProgressBar({ current, max, color = 'purple' }: { current: number; max: number; color?: string }) {
  const percentage = Math.min((current / max) * 100, 100);
  const colorClasses: Record<string, string> = {
    purple: 'bg-purple-500',
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
  };

  return (
    <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
      <div
        className={`h-full ${colorClasses[color] || colorClasses.purple} rounded-full transition-all duration-300`}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}

// Character Card Component
function CharacterCard({ character }: { character: Character }) {
  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <h2 className="text-xl font-semibold mb-4 text-purple-400">Your Character</h2>
      <div className="flex flex-col items-center space-y-4">
        <div className="w-24 h-28 rounded-lg border-2 border-purple-500 overflow-hidden bg-gray-700 flex items-center justify-center">
          <CharacterSprite
            characterClass={character.class.toLowerCase() as CharacterClass}
            size={92}
          />
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-white">{character.name}</p>
          <p className="text-purple-400">Level {character.level} {character.class}</p>
          <div className="mt-2">
            <div className="flex justify-between text-sm text-gray-400 mb-1">
              <span>XP</span>
              <span>{character.xp} / {character.xpToNextLevel}</span>
            </div>
            <ProgressBar current={character.xp} max={character.xpToNextLevel} color="purple" />
          </div>
        </div>
      </div>
    </div>
  );
}

// Today's Stats Card Component
function StatsCard({ stats }: { stats: TodayStats }) {
  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <h2 className="text-xl font-semibold mb-4 text-green-400">Today&apos;s Stats</h2>
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-gray-400">Commits</span>
          <span className="font-medium text-white">{stats.commits}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-400">Lines Added</span>
          <span className="font-medium text-green-400">+{stats.linesAdded}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-400">Lines Removed</span>
          <span className="font-medium text-red-400">-{stats.linesRemoved}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-400">Files Changed</span>
          <span className="font-medium text-white">{stats.filesChanged}</span>
        </div>
        <div className="border-t border-gray-700 pt-3 mt-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-400">XP Earned</span>
            <span className="font-bold text-purple-400">+{stats.xpEarned} XP</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Gold & Workers Card Component
function WorkersCard({ data, onCollect }: { data: WorkerData; onCollect: () => void }) {
  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <h2 className="text-xl font-semibold mb-4 text-yellow-400">Gold & Workers</h2>
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-gray-400">Gold</span>
          <span className="font-bold text-yellow-400">{data.gold.toLocaleString()}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-400">Workers</span>
          <span className="font-medium text-white">{data.workers}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-400">Gold/Hour</span>
          <span className="font-medium text-yellow-400">+{data.goldPerHour}</span>
        </div>
        {data.pendingGold > 0 && (
          <div className="bg-yellow-900/30 rounded-lg p-3 mt-3 border border-yellow-700">
            <div className="flex justify-between items-center">
              <span className="text-yellow-400">Pending Gold</span>
              <span className="font-bold text-yellow-400">{data.pendingGold}</span>
            </div>
          </div>
        )}
        <button
          onClick={onCollect}
          disabled={data.pendingGold === 0}
          className="w-full mt-4 bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-2 rounded-lg transition-colors"
        >
          Collect Gold
        </button>
      </div>
    </div>
  );
}

// Quest Card Component
function QuestCard({ quest }: { quest: Quest }) {
  const isComplete = quest.status === 'completed' || quest.current >= quest.target;

  return (
    <div className={`bg-gray-700 rounded-lg p-4 ${isComplete ? 'border border-green-500' : ''}`}>
      <div className="flex justify-between items-start mb-2">
        <div>
          <p className="font-medium text-white flex items-center gap-2">
            {quest.title}
            {isComplete && <span className="text-green-400 text-sm">[Complete]</span>}
          </p>
          <p className="text-sm text-gray-400">{quest.description}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-400">{quest.current} / {quest.target}</p>
          <p className="text-sm text-green-400">+{quest.xpReward} XP | +{quest.goldReward} Gold</p>
        </div>
      </div>
      <ProgressBar current={quest.current} max={quest.target} color={isComplete ? 'green' : 'blue'} />
    </div>
  );
}

// Quests Card Container
function QuestsCard({ quests }: { quests: Quest[] }) {
  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 md:col-span-2">
      <h2 className="text-xl font-semibold mb-4 text-blue-400">Daily Quests</h2>
      <div className="space-y-4">
        {quests.length === 0 ? (
          <p className="text-gray-400 text-center py-4">No quests available. Check back tomorrow!</p>
        ) : (
          quests.map((quest) => <QuestCard key={quest.id} quest={quest} />)
        )}
      </div>
    </div>
  );
}

// Battle History Card Component
function BattlesCard({ battles, onStartBattle }: { battles: Battle[]; onStartBattle: () => void }) {
  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <h2 className="text-xl font-semibold mb-4 text-red-400">Recent Battles</h2>
      {battles.length === 0 ? (
        <div className="text-gray-400 text-center py-8">
          No battles yet. Challenge a friend!
        </div>
      ) : (
        <div className="space-y-3 max-h-48 overflow-y-auto">
          {battles.map((battle) => (
            <div
              key={battle.id}
              className={`p-3 rounded-lg ${
                battle.result === 'win' ? 'bg-green-900/30 border border-green-700' : 'bg-red-900/30 border border-red-700'
              }`}
            >
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-medium text-white">vs {battle.opponentName}</p>
                  <p className="text-sm text-gray-400">Level {battle.opponentLevel}</p>
                </div>
                <div className="text-right">
                  <p className={`font-bold ${battle.result === 'win' ? 'text-green-400' : 'text-red-400'}`}>
                    {battle.result === 'win' ? 'Victory' : 'Defeat'}
                  </p>
                  <p className="text-sm text-gray-400">
                    +{battle.xpGained} XP | +{battle.goldGained} Gold
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <button
        onClick={onStartBattle}
        className="w-full mt-4 bg-red-600 hover:bg-red-500 text-white font-medium py-2 rounded-lg transition-colors"
      >
        Start Battle
      </button>
    </div>
  );
}

// Main Dashboard Component
export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [character] = useState<Character>(mockCharacter);
  const [stats] = useState<TodayStats>(mockStats);
  const [workerData, setWorkerData] = useState<WorkerData>(mockWorkerData);
  const [quests] = useState<Quest[]>(mockQuests);
  const [battles] = useState<Battle[]>(mockBattles);

  useEffect(() => {
    // Simulate loading data
    const timer = setTimeout(() => {
      setLoading(false);
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  const handleCollectGold = () => {
    if (workerData.pendingGold > 0) {
      setWorkerData((prev) => ({
        ...prev,
        gold: prev.gold + prev.pendingGold,
        pendingGold: 0,
      }));
    }
  };

  const handleStartBattle = () => {
    // TODO: Implement battle start logic
    console.log('Starting battle...');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white text-xl">Loading GitRPG...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
            GitRPG Dashboard
          </h1>
          <p className="text-gray-400 mt-2">Track your coding progress and battle stats</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Character Card */}
          <CharacterCard character={character} />

          {/* Today's Stats Card */}
          <StatsCard stats={stats} />

          {/* Gold & Workers Card */}
          <WorkersCard data={workerData} onCollect={handleCollectGold} />

          {/* Daily Quests Card */}
          <QuestsCard quests={quests} />

          {/* Recent Battles Card */}
          <BattlesCard battles={battles} onStartBattle={handleStartBattle} />
        </div>

        <footer className="mt-12 text-center text-gray-500 text-sm">
          <p>GitRPG - Turn your coding into an adventure</p>
        </footer>
      </div>
    </main>
  );
}

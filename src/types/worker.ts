export interface Worker {
  id: string;
  userId: string;
  level: number;
  goldPerHour: number;
  purchasedAt: Date;
  lastCollectedAt: Date;
}

export interface WorkerConfig {
  baseCost: number;
  baseGoldPerHour: number;
  upgradeCostMultiplier: number;
  upgradeGoldMultiplier: number;
}

export const WORKER_CONFIG: WorkerConfig = {
  baseCost: 100,
  baseGoldPerHour: 5,
  upgradeCostMultiplier: 1.5,
  upgradeGoldMultiplier: 1.3
};

export function calculateWorkerUpgradeCost(currentLevel: number): number {
  return Math.floor(WORKER_CONFIG.baseCost * Math.pow(WORKER_CONFIG.upgradeCostMultiplier, currentLevel));
}

export function calculateWorkerGoldPerHour(level: number): number {
  return Math.floor(WORKER_CONFIG.baseGoldPerHour * Math.pow(WORKER_CONFIG.upgradeGoldMultiplier, level - 1));
}

export function calculatePendingGold(worker: Worker): number {
  const now = new Date();
  const hoursSinceCollection = (now.getTime() - worker.lastCollectedAt.getTime()) / (1000 * 60 * 60);
  return Math.floor(hoursSinceCollection * worker.goldPerHour);
}

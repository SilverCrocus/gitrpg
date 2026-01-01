import { doc, getDoc, setDoc, updateDoc, collection, getDocs, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { getDb } from './firebase';
import { Worker } from '../types';
import { v4 as uuidv4 } from 'uuid';

// Constants for worker economics
export const WORKER_BASE_COST = 100;
export const WORKER_BASE_OUTPUT = 5; // gold per hour
export const WORKER_COST_MULTIPLIER = 1.15; // 15% increase per worker
export const WORKER_OUTPUT_MULTIPLIER = 1.5; // 50% increase per level
export const WORKER_UPGRADE_COST_MULTIPLIER = 2.0;

const WORKERS_COLLECTION = 'workers';

/**
 * Calculates the cost to purchase a new worker based on how many workers
 * the user already owns. Cost increases exponentially.
 */
export function calculateWorkerPurchaseCost(currentWorkerCount: number): number {
  return Math.floor(WORKER_BASE_COST * Math.pow(WORKER_COST_MULTIPLIER, currentWorkerCount));
}

/**
 * Calculates the gold output per hour for a worker at a given level.
 * Output increases with level.
 */
export function calculateWorkerOutput(level: number): number {
  return Math.floor(WORKER_BASE_OUTPUT * Math.pow(WORKER_OUTPUT_MULTIPLIER, level - 1));
}

/**
 * Calculates the cost to upgrade a worker to the next level.
 */
export function calculateWorkerUpgradeCost(currentLevel: number): number {
  return Math.floor(WORKER_BASE_COST * Math.pow(WORKER_UPGRADE_COST_MULTIPLIER, currentLevel));
}

/**
 * Calculates pending gold based on gold per hour rate and time since last collection.
 */
export function calculatePendingGold(goldPerHour: number, lastCollectedAt: Date): number {
  const now = new Date();
  const hoursSinceCollection = (now.getTime() - lastCollectedAt.getTime()) / (1000 * 60 * 60);
  return Math.floor(hoursSinceCollection * goldPerHour);
}

/**
 * Retrieves all workers owned by a user.
 */
export async function getUserWorkers(userId: string): Promise<Worker[]> {
  const db = getDb();
  const workersRef = collection(db, `users/${userId}/${WORKERS_COLLECTION}`);
  const snapshot = await getDocs(workersRef);

  return snapshot.docs.map(doc => doc.data() as Worker);
}

/**
 * Retrieves a specific worker by ID.
 */
export async function getWorker(userId: string, workerId: string): Promise<Worker | null> {
  const db = getDb();
  const workerRef = doc(db, `users/${userId}/${WORKERS_COLLECTION}`, workerId);
  const snapshot = await getDoc(workerRef);

  if (!snapshot.exists()) return null;
  return snapshot.data() as Worker;
}

/**
 * Purchases a new worker for the user.
 * Returns the new worker if successful.
 * Throws an error if user doesn't have enough gold.
 */
export async function purchaseWorker(userId: string, userGold: number): Promise<Worker> {
  const workers = await getUserWorkers(userId);
  const cost = calculateWorkerPurchaseCost(workers.length);

  if (userGold < cost) {
    throw new Error(`Not enough gold. Need ${cost}, have ${userGold}`);
  }

  const db = getDb();
  const workerId = uuidv4();
  const workerRef = doc(db, `users/${userId}/${WORKERS_COLLECTION}`, workerId);

  const worker: Worker = {
    id: workerId,
    userId,
    level: 1,
    goldPerHour: WORKER_BASE_OUTPUT,
    purchasedAt: new Date(),
    lastCollectedAt: new Date()
  };

  await setDoc(workerRef, {
    ...worker,
    purchasedAt: serverTimestamp(),
    lastCollectedAt: serverTimestamp()
  });

  return worker;
}

/**
 * Upgrades a worker to the next level.
 * Returns the upgraded worker if successful.
 * Throws an error if worker not found or user doesn't have enough gold.
 */
export async function upgradeWorker(
  userId: string,
  workerId: string,
  userGold: number
): Promise<Worker> {
  const db = getDb();
  const workerRef = doc(db, `users/${userId}/${WORKERS_COLLECTION}`, workerId);
  const snapshot = await getDoc(workerRef);

  if (!snapshot.exists()) {
    throw new Error('Worker not found');
  }

  const worker = snapshot.data() as Worker;
  const upgradeCost = calculateWorkerUpgradeCost(worker.level);

  if (userGold < upgradeCost) {
    throw new Error(`Not enough gold. Need ${upgradeCost}, have ${userGold}`);
  }

  const newLevel = worker.level + 1;
  const newOutput = calculateWorkerOutput(newLevel);

  await updateDoc(workerRef, {
    level: newLevel,
    goldPerHour: newOutput
  });

  return {
    ...worker,
    level: newLevel,
    goldPerHour: newOutput
  };
}

/**
 * Collects all pending gold from all workers.
 * Updates last collected time for each worker.
 * Returns the total gold collected.
 */
export async function collectWorkerGold(userId: string): Promise<number> {
  const workers = await getUserWorkers(userId);
  let totalGold = 0;

  const db = getDb();

  for (const worker of workers) {
    const lastCollected = worker.lastCollectedAt instanceof Date
      ? worker.lastCollectedAt
      : new Date(worker.lastCollectedAt);
    const pendingGold = calculatePendingGold(worker.goldPerHour, lastCollected);
    totalGold += pendingGold;

    // Update last collected time
    const workerRef = doc(db, `users/${userId}/${WORKERS_COLLECTION}`, worker.id);
    await updateDoc(workerRef, {
      lastCollectedAt: serverTimestamp()
    });
  }

  return totalGold;
}

/**
 * Gets total pending gold from all workers without collecting.
 */
export async function getTotalPendingGold(userId: string): Promise<number> {
  const workers = await getUserWorkers(userId);
  let total = 0;

  for (const worker of workers) {
    const lastCollected = worker.lastCollectedAt instanceof Date
      ? worker.lastCollectedAt
      : new Date(worker.lastCollectedAt);
    total += calculatePendingGold(worker.goldPerHour, lastCollected);
  }

  return total;
}

/**
 * Gets total gold per hour production across all workers.
 */
export async function getTotalGoldPerHour(userId: string): Promise<number> {
  const workers = await getUserWorkers(userId);
  return workers.reduce((sum, w) => sum + w.goldPerHour, 0);
}

/**
 * Gets total worker count for a user.
 */
export async function getWorkerCount(userId: string): Promise<number> {
  const workers = await getUserWorkers(userId);
  return workers.length;
}

/**
 * Deletes a worker (for testing or special cases).
 */
export async function deleteWorker(userId: string, workerId: string): Promise<void> {
  const db = getDb();
  const workerRef = doc(db, `users/${userId}/${WORKERS_COLLECTION}`, workerId);
  await deleteDoc(workerRef);
}

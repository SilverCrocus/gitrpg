import { SupabaseClientService } from './supabaseClient';
import { LocalStateManager } from './localStateManager';
import { Worker, WORKER_CONFIG } from '../types';

export class WorkerService {
  constructor(private supabase: SupabaseClientService, private stateManager?: LocalStateManager) {}

  /**
   * Calculate the cost to purchase a new worker based on current worker count
   */
  calculatePurchaseCost(currentWorkerCount: number): number {
    return Math.floor(WORKER_CONFIG.baseCost * Math.pow(WORKER_CONFIG.costMultiplier, currentWorkerCount));
  }

  /**
   * Calculate gold output per hour for a worker at a given level
   */
  calculateGoldPerHour(level: number): number {
    return Math.floor(WORKER_CONFIG.baseGoldPerHour * Math.pow(WORKER_CONFIG.outputMultiplier, level - 1));
  }

  /**
   * Calculate cost to upgrade a worker to the next level
   */
  calculateUpgradeCost(currentLevel: number): number {
    return Math.floor(WORKER_CONFIG.baseCost * Math.pow(WORKER_CONFIG.upgradeCostMultiplier, currentLevel));
  }

  /**
   * Calculate pending gold based on time since last collection
   */
  calculatePendingGold(goldPerHour: number, lastCollectedAt: Date): number {
    const now = new Date();
    const hoursSinceCollection = (now.getTime() - lastCollectedAt.getTime()) / (1000 * 60 * 60);
    return Math.floor(hoursSinceCollection * goldPerHour);
  }

  /**
   * Get all workers owned by the current user
   */
  async getWorkers(): Promise<Worker[]> {
    const client = this.supabase.getClient();
    const user = this.supabase.getCurrentUser();
    if (!user) return [];

    const { data, error } = await client
      .from('workers')
      .select('*')
      .eq('user_id', user.id)
      .order('purchased_at', { ascending: true });

    if (error) {
      console.error('Error fetching workers:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Get worker count for the current user
   */
  async getWorkerCount(): Promise<number> {
    const workers = await this.getWorkers();
    return workers.length;
  }

  /**
   * Get total gold per hour from all workers
   */
  async getTotalGoldPerHour(): Promise<number> {
    const workers = await this.getWorkers();
    return workers.reduce((sum, w) => sum + w.gold_per_hour, 0);
  }

  /**
   * Get total pending gold from all workers
   */
  async getTotalPendingGold(): Promise<number> {
    const workers = await this.getWorkers();
    let total = 0;

    for (const worker of workers) {
      const lastCollected = new Date(worker.last_collected_at);
      total += this.calculatePendingGold(worker.gold_per_hour, lastCollected);
    }

    return total;
  }

  /**
   * Purchase a new worker
   */
  async purchaseWorker(): Promise<{ success: boolean; worker?: Worker; error?: string }> {
    const client = this.supabase.getClient();
    const user = this.supabase.getCurrentUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    // Get current gold and worker count
    const { data: userData } = await client
      .from('users')
      .select('gold')
      .eq('id', user.id)
      .single();

    const currentGold = userData?.gold || 0;
    const workerCount = await this.getWorkerCount();
    const cost = this.calculatePurchaseCost(workerCount);

    if (currentGold < cost) {
      return { success: false, error: `Not enough gold. Need ${cost}, have ${currentGold}` };
    }

    // Deduct gold
    await client
      .from('users')
      .update({ gold: currentGold - cost })
      .eq('id', user.id);

    // Create worker
    const { data: worker, error } = await client
      .from('workers')
      .insert({
        user_id: user.id,
        level: 1,
        gold_per_hour: WORKER_CONFIG.baseGoldPerHour,
      })
      .select()
      .single();

    if (error) {
      // Refund gold on error
      await client
        .from('users')
        .update({ gold: currentGold })
        .eq('id', user.id);
      return { success: false, error: 'Failed to create worker' };
    }

    // Update local state (deduct cost)
    if (this.stateManager) {
      await this.stateManager.addGold(-cost);
    }

    return { success: true, worker };
  }

  /**
   * Upgrade a worker to the next level
   */
  async upgradeWorker(workerId: string): Promise<{ success: boolean; worker?: Worker; error?: string }> {
    const client = this.supabase.getClient();
    const user = this.supabase.getCurrentUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    // Get worker
    const { data: worker, error: workerError } = await client
      .from('workers')
      .select('*')
      .eq('id', workerId)
      .eq('user_id', user.id)
      .single();

    if (workerError || !worker) {
      return { success: false, error: 'Worker not found' };
    }

    // Get current gold
    const { data: userData } = await client
      .from('users')
      .select('gold')
      .eq('id', user.id)
      .single();

    const currentGold = userData?.gold || 0;
    const upgradeCost = this.calculateUpgradeCost(worker.level);

    if (currentGold < upgradeCost) {
      return { success: false, error: `Not enough gold. Need ${upgradeCost}, have ${currentGold}` };
    }

    const newLevel = worker.level + 1;
    const newGoldPerHour = this.calculateGoldPerHour(newLevel);

    // Deduct gold and upgrade worker
    await client
      .from('users')
      .update({ gold: currentGold - upgradeCost })
      .eq('id', user.id);

    const { data: updatedWorker, error: updateError } = await client
      .from('workers')
      .update({ level: newLevel, gold_per_hour: newGoldPerHour })
      .eq('id', workerId)
      .select()
      .single();

    if (updateError) {
      // Refund on error
      await client
        .from('users')
        .update({ gold: currentGold })
        .eq('id', user.id);
      return { success: false, error: 'Failed to upgrade worker' };
    }

    // Update local state (deduct cost)
    if (this.stateManager) {
      await this.stateManager.addGold(-upgradeCost);
    }

    return { success: true, worker: updatedWorker };
  }

  /**
   * Collect all pending gold from all workers
   */
  async collectAllGold(): Promise<{ success: boolean; goldCollected: number; error?: string }> {
    const client = this.supabase.getClient();
    const user = this.supabase.getCurrentUser();
    if (!user) return { success: false, goldCollected: 0, error: 'Not authenticated' };

    const workers = await this.getWorkers();
    let totalGold = 0;

    for (const worker of workers) {
      const lastCollected = new Date(worker.last_collected_at);
      const pendingGold = this.calculatePendingGold(worker.gold_per_hour, lastCollected);
      totalGold += pendingGold;

      // Update last collected time
      await client
        .from('workers')
        .update({ last_collected_at: new Date().toISOString() })
        .eq('id', worker.id);
    }

    // Add gold to user
    const { data: userData } = await client
      .from('users')
      .select('gold')
      .eq('id', user.id)
      .single();

    const currentGold = userData?.gold || 0;

    await client
      .from('users')
      .update({ gold: currentGold + totalGold })
      .eq('id', user.id);

    // Update local state
    if (this.stateManager) {
      await this.stateManager.addGold(totalGold);
    }

    return { success: true, goldCollected: totalGold };
  }

  /**
   * Get worker summary for UI display
   */
  async getWorkerSummary(): Promise<{
    workerCount: number;
    totalGoldPerHour: number;
    pendingGold: number;
    nextWorkerCost: number;
  }> {
    const workers = await this.getWorkers();
    const workerCount = workers.length;
    const totalGoldPerHour = workers.reduce((sum, w) => sum + w.gold_per_hour, 0);

    let pendingGold = 0;
    for (const worker of workers) {
      const lastCollected = new Date(worker.last_collected_at);
      pendingGold += this.calculatePendingGold(worker.gold_per_hour, lastCollected);
    }

    const nextWorkerCost = this.calculatePurchaseCost(workerCount);

    return { workerCount, totalGoldPerHour, pendingGold, nextWorkerCost };
  }
}

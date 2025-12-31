/**
 * Pack Registry
 * Manages available packs and their schemas
 */

import type { Pack } from '../types/index.js';

export class PackRegistry {
  private packs: Map<string, Pack> = new Map();

  /**
   * Register a pack
   */
  register(pack: Pack): void {
    if (this.packs.has(pack.id)) {
      throw new Error(`Pack ${pack.id} is already registered`);
    }
    this.packs.set(pack.id, pack);
  }

  /**
   * Get a pack by ID
   */
  get(packId: string): Pack | undefined {
    return this.packs.get(packId);
  }

  /**
   * Get all registered packs
   */
  getAll(): Pack[] {
    return Array.from(this.packs.values());
  }

  /**
   * Get packs sorted by priority (highest first)
   */
  getAllByPriority(): Pack[] {
    return this.getAll().sort((a, b) => b.priority - a.priority);
  }

  /**
   * Check if a pack is registered
   */
  has(packId: string): boolean {
    return this.packs.has(packId);
  }

  /**
   * Get pack count
   */
  count(): number {
    return this.packs.size;
  }
}

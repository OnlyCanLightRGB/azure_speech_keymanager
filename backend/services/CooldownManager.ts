import { CooldownKey } from '../types';
import logger from '../utils/logger';

export class CooldownManager {
  private cooldownKeys: Map<string, number> = new Map(); // key -> cooldown_until_timestamp
  private monitorInterval: NodeJS.Timeout | null = null;
  private running: boolean = false;
  private keyManager: any; // Will be injected

  constructor(keyManager: any) {
    this.keyManager = keyManager;
  }

  /**
   * Start the cooldown manager
   */
  start(): void {
    if (this.running) {
      logger.warn('CooldownManager is already running');
      return;
    }

    this.running = true;
    this.monitorInterval = setInterval(() => {
      this.monitorCooldowns();
    }, 100); // Check every 100ms

    logger.info('CooldownManager started');
  }

  /**
   * Stop the cooldown manager
   */
  stop(): void {
    if (!this.running) {
      return;
    }

    logger.info('Stopping CooldownManager...');
    this.running = false;

    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }

    // Force enable all cooldown keys
    const keysToEnable = Array.from(this.cooldownKeys.keys());
    for (const key of keysToEnable) {
      try {
        this.keyManager.enableKey(key);
        logger.info(`Force enabled key during shutdown: ${this.maskKey(key)}`);
      } catch (error) {
        logger.error(`Failed to enable key ${this.maskKey(key)} during shutdown:`, error);
      }
    }

    this.cooldownKeys.clear();
    logger.info('CooldownManager stopped');
  }

  /**
   * Add a key to cooldown
   */
  addKeyToCooldown(key: string, cooldownSeconds: number = 300): void {
    const cooldownUntil = Date.now() + (cooldownSeconds * 1000);
    this.cooldownKeys.set(key, cooldownUntil);
    
    logger.info(`Key ${this.maskKey(key)} added to cooldown for ${cooldownSeconds} seconds`);
  }

  /**
   * Remove a key from cooldown manually
   */
  removeKeyFromCooldown(key: string): boolean {
    const removed = this.cooldownKeys.delete(key);
    if (removed) {
      logger.info(`Key ${this.maskKey(key)} manually removed from cooldown`);
    }
    return removed;
  }

  /**
   * Check if a key is in cooldown
   */
  isKeyInCooldown(key: string): boolean {
    const cooldownUntil = this.cooldownKeys.get(key);
    if (!cooldownUntil) {
      return false;
    }

    if (Date.now() >= cooldownUntil) {
      // Cooldown expired, remove it
      this.cooldownKeys.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Get remaining cooldown time for a key in seconds
   */
  getRemainingCooldownTime(key: string): number {
    const cooldownUntil = this.cooldownKeys.get(key);
    if (!cooldownUntil) {
      return 0;
    }

    const remaining = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
    return remaining;
  }

  /**
   * Get all keys currently in cooldown
   */
  getCooldownKeys(): CooldownKey[] {
    const result: CooldownKey[] = [];
    const now = Date.now();

    for (const [key, cooldownUntil] of this.cooldownKeys.entries()) {
      if (now < cooldownUntil) {
        result.push({
          key: this.maskKey(key),
          cooldownUntil
        });
      }
    }

    return result;
  }

  /**
   * Get cooldown statistics
   */
  getStats(): { totalCooldownKeys: number; activeKeys: string[] } {
    const now = Date.now();
    const activeKeys: string[] = [];

    for (const [key, cooldownUntil] of this.cooldownKeys.entries()) {
      if (now < cooldownUntil) {
        activeKeys.push(this.maskKey(key));
      }
    }

    return {
      totalCooldownKeys: this.cooldownKeys.size,
      activeKeys
    };
  }

  /**
   * Monitor cooldowns and enable expired keys
   */
  private monitorCooldowns(): void {
    if (!this.running) {
      return;
    }

    try {
      const now = Date.now();
      const keysToEnable: string[] = [];

      // Find expired keys
      for (const [key, cooldownUntil] of this.cooldownKeys.entries()) {
        if (now >= cooldownUntil) {
          keysToEnable.push(key);
        }
      }

      // Enable expired keys
      for (const key of keysToEnable) {
        try {
          this.cooldownKeys.delete(key);
          this.keyManager.enableKey(key);
          logger.info(`Key ${this.maskKey(key)} cooldown expired, re-enabled`);
        } catch (error) {
          logger.error(`Failed to enable key ${this.maskKey(key)} after cooldown:`, error);
        }
      }
    } catch (error) {
      logger.error('Error in cooldown monitor:', error);
    }
  }

  /**
   * Mask key for logging (show only first 8 characters)
   */
  private maskKey(key: string): string {
    if (key.length <= 8) {
      return key;
    }
    return key.substring(0, 8) + '...';
  }
}

export default CooldownManager;

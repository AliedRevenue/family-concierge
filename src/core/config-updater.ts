/**
 * Config Updater
 * Handles bidirectional configuration corrections from parent feedback
 */

import { readFileSync, writeFileSync } from 'fs';
import { load, dump } from 'js-yaml';

export class ConfigUpdater {
  private configPath: string;
  private config: any;

  constructor(configPath: string) {
    this.configPath = configPath;
    this.config = load(readFileSync(configPath, 'utf-8'));
  }

  /**
   * Add a new domain to watch for a specific pack
   */
  async addDomain(packId: string, domain: string): Promise<boolean> {
    try {
      const pack = this.config.packs?.find((p: any) => p.packId === packId);
      
      if (!pack) {
        console.error(`❌ Pack "${packId}" not found in configuration`);
        return false;
      }

      // Ensure sources array exists
      if (!pack.config) pack.config = {};
      if (!pack.config.sources) pack.config.sources = [];

      // Find first source or create one
      let source = pack.config.sources[0];
      if (!source) {
        source = {
          name: `${packId.charAt(0).toUpperCase() + packId.slice(1)} Source`,
          type: 'email',
          fromDomains: [],
          keywords: [],
          enabled: true,
        };
        pack.config.sources.push(source);
      }

      // Ensure fromDomains array exists
      if (!source.fromDomains) source.fromDomains = [];

      // Check if domain already exists
      if (source.fromDomains.includes(domain)) {
        console.log(`⚠️  Domain "${domain}" already configured`);
        return false;
      }

      // Add domain
      source.fromDomains.push(domain);

      // Update timestamp
      this.config.updatedAt = new Date().toISOString();

      // Write back to file
      writeFileSync(this.configPath, dump(this.config, { lineWidth: -1 }), 'utf-8');

      return true;
    } catch (error) {
      console.error('Error updating config:', error);
      return false;
    }
  }

  /**
   * Add an exclusion rule to prevent false positives
   */
  async addExclusionRule(packId: string, keyword: string, fromDomain?: string): Promise<boolean> {
    try {
      const pack = this.config.packs?.find((p: any) => p.packId === packId);
      
      if (!pack) {
        console.error(`❌ Pack "${packId}" not found in configuration`);
        return false;
      }

      // Ensure config structure exists
      if (!pack.config) pack.config = {};
      if (!pack.config.exclusionRules) pack.config.exclusionRules = [];

      // Create exclusion rule
      const rule: any = {
        type: 'keyword',
        value: keyword,
        reason: 'Parent feedback - not relevant',
        addedAt: new Date().toISOString(),
      };

      if (fromDomain) {
        rule.fromDomain = fromDomain;
      }

      // Check if rule already exists
      const exists = pack.config.exclusionRules.some((r: any) => 
        r.type === 'keyword' && 
        r.value === keyword && 
        (!fromDomain || r.fromDomain === fromDomain)
      );

      if (exists) {
        console.log(`⚠️  Exclusion rule for "${keyword}" already configured`);
        return false;
      }

      // Add rule
      pack.config.exclusionRules.push(rule);

      // Update timestamp
      this.config.updatedAt = new Date().toISOString();

      // Write back to file
      writeFileSync(this.configPath, dump(this.config, { lineWidth: -1 }), 'utf-8');

      return true;
    } catch (error) {
      console.error('Error updating config:', error);
      return false;
    }
  }

  /**
   * Remove a domain from watch list
   */
  async removeDomain(packId: string, domain: string): Promise<boolean> {
    try {
      const pack = this.config.packs?.find((p: any) => p.packId === packId);
      
      if (!pack || !pack.config?.sources) {
        console.error(`❌ Pack "${packId}" not found or has no sources`);
        return false;
      }

      let removed = false;
      for (const source of pack.config.sources) {
        if (source.fromDomains) {
          const index = source.fromDomains.indexOf(domain);
          if (index !== -1) {
            source.fromDomains.splice(index, 1);
            removed = true;
          }
        }
      }

      if (!removed) {
        console.log(`⚠️  Domain "${domain}" not found in configuration`);
        return false;
      }

      // Update timestamp
      this.config.updatedAt = new Date().toISOString();

      // Write back to file
      writeFileSync(this.configPath, dump(this.config, { lineWidth: -1 }), 'utf-8');

      return true;
    } catch (error) {
      console.error('Error updating config:', error);
      return false;
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): any {
    return this.config;
  }
}

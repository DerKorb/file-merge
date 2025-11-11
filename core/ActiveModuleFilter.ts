/**
 * Active Module Filter
 *
 * Filters fragments based on module activation status.
 * A module is active if it's symlinked from atom-framework/modules/ to modules/
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Fragment } from "./types.js";

export class ActiveModuleFilter {
  private modulesDir: string;
  private atomModulesDir: string;
  private activeModulesCache: Set<string> | null = null;

  constructor(projectRoot: string) {
    this.modulesDir = path.join(projectRoot, "modules");
    this.atomModulesDir = path.join(projectRoot, "atom-framework", "modules");
  }

  /**
   * Check if a module is active (symlinked from atom-framework/modules to modules/)
   */
  isModuleActive(moduleName: string): boolean {
    const targetPath = path.join(this.modulesDir, moduleName);
    const sourcePath = path.join(this.atomModulesDir, moduleName);

    // Check if target exists
    if (!fs.existsSync(targetPath)) {
      return false;
    }

    // Check if it's a symlink
    try {
      const stats = fs.lstatSync(targetPath);
      if (!stats.isSymbolicLink()) {
        return false;
      }

      // Check if it points to atom-framework/modules
      const linkTarget = fs.readlinkSync(targetPath);
      const resolvedTarget = path.resolve(this.modulesDir, linkTarget);
      const resolvedSource = path.resolve(sourcePath);

      return resolvedTarget === resolvedSource;
    } catch {
      return false;
    }
  }

  /**
   * Filter fragments based on _activeOnly setting and module activation
   */
  filterFragments(fragments: Fragment[]): Fragment[] {
    return fragments.filter((fragment) => {
      // Fragments outside atom-framework are always included
      if (!fragment.path.includes("atom-framework/modules/")) {
        return true;
      }

      // Extract module name from path
      // e.g., atom-framework/modules/prisma-module/... → prisma-module
      const match = fragment.path.match(
        /atom-framework[/\\]modules[/\\]([^/\\]+)/,
      );
      if (!match) {
        return true; // Not in modules dir, include it
      }

      const moduleName = match[1];
      const activeOnly = fragment.metadata._activeOnly ?? true; // Default: true

      if (activeOnly === false) {
        // Always include (e.g., catalog files)
        return true;
      }

      // Only include if module is active
      return this.isModuleActive(moduleName);
    });
  }

  /**
   * Get list of all active modules
   */
  getActiveModules(): string[] {
    if (this.activeModulesCache) {
      return Array.from(this.activeModulesCache);
    }

    if (!fs.existsSync(this.modulesDir)) {
      this.activeModulesCache = new Set();
      return [];
    }

    const entries = fs.readdirSync(this.modulesDir, { withFileTypes: true });
    const active = entries
      .filter((entry) => entry.isSymbolicLink())
      .map((entry) => entry.name)
      .filter((name) => this.isModuleActive(name));

    this.activeModulesCache = new Set(active);
    return active;
  }

  /**
   * Clear the active modules cache
   */
  clearCache(): void {
    this.activeModulesCache = null;
  }

  /**
   * Check if fragment conditions are satisfied
   */
  checkConditions(fragment: Fragment): boolean {
    const conditions = fragment.metadata._conditions;
    if (!conditions) {
      return true; // No conditions = always apply
    }

    // Check activeModules condition
    if (conditions.activeModules) {
      const activeModules = this.getActiveModules();
      const allActive = conditions.activeModules.every((module) =>
        activeModules.includes(module),
      );
      if (!allActive) {
        return false;
      }
    }

    // Check env condition (future)
    if (conditions.env) {
      const currentEnv = process.env.NODE_ENV || "development";
      if (conditions.env !== currentEnv) {
        return false;
      }
    }

    // Check platform condition (future)
    if (conditions.platform) {
      if (conditions.platform !== process.platform) {
        return false;
      }
    }

    return true;
  }

  /**
   * Filter fragments by both activation status and conditions
   */
  filterFragmentsWithConditions(fragments: Fragment[]): Fragment[] {
    return this.filterFragments(fragments).filter((fragment) =>
      this.checkConditions(fragment),
    );
  }
}

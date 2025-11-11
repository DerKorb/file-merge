/**
 * StatusReporter
 *
 * Reports status of managed configuration files
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { TemplateDiscovery } from './TemplateDiscovery.js';
import { FragmentDiscovery } from './FragmentDiscovery.js';
import { OverrideDiscovery } from './OverrideDiscovery.js';
import { ActiveModuleFilter } from './ActiveModuleFilter.js';
import type { Source, Fragment } from './types.js';

interface FileStatus {
  targetPath: string;
  mode: 'symlinked' | 'generated' | 'copied';
  sources: string[];
  isSymlink: boolean;
}

export class StatusReporter {
  private templateDiscovery: TemplateDiscovery;
  private fragmentDiscovery: FragmentDiscovery;
  private overrideDiscovery: OverrideDiscovery;
  private moduleFilter: ActiveModuleFilter;

  constructor(private projectRoot: string) {
    this.templateDiscovery = new TemplateDiscovery(projectRoot);
    this.fragmentDiscovery = new FragmentDiscovery(projectRoot);
    this.overrideDiscovery = new OverrideDiscovery(projectRoot);
    this.moduleFilter = new ActiveModuleFilter(projectRoot);
  }

  /**
   * Show status of all managed files
   */
  async showStatus(specificFile?: string): Promise<void> {
    console.log('📊 Config Management Status\n');

    // Discover all sources
    const templates = await this.templateDiscovery.discoverTemplates();
    const allFragments = await this.fragmentDiscovery.discoverFragments();
    const overrides = await this.overrideDiscovery.discoverOverrides();

    // Filter fragments
    const fragments = this.moduleFilter.filterFragmentsWithConditions(allFragments);

    // Group by target
    const targetGroups = this.groupByTarget(templates, fragments, overrides);

    // Build status for each file
    const statuses: FileStatus[] = [];
    for (const [targetPath, sources] of targetGroups) {
      if (specificFile && targetPath !== specificFile) {
        continue;
      }

      const status = await this.analyzeFile(targetPath, sources);
      statuses.push(status);
    }

    if (specificFile) {
      if (statuses.length === 0) {
        console.log(`❌ File not managed: ${specificFile}\n`);
        console.log(`To add it: pnpm config:add ${specificFile}`);
        return;
      }
      await this.showDetailedStatus(statuses[0]);
    } else {
      await this.showSummaryStatus(statuses);
    }
  }

  /**
   * Show detailed status for a single file
   */
  private async showDetailedStatus(status: FileStatus): Promise<void> {
    console.log(`File: ${status.targetPath}\n`);

    // Mode
    const modeIcon = status.mode === 'symlinked' ? '🔗' :
                     status.mode === 'generated' ? '🤖' : '📄';
    console.log(`Mode: ${modeIcon} ${status.mode}`);
    console.log(`Sources: ${status.sources.length}\n`);

    // List sources
    console.log('Source files:');
    for (const source of status.sources) {
      console.log(`  • ${source}`);
    }

    // Check actual file state
    const absolutePath = path.join(this.projectRoot, status.targetPath);
    try {
      const stats = await fs.lstat(absolutePath);
      console.log(`\nActual state:`);
      if (stats.isSymbolicLink()) {
        const target = await fs.readlink(absolutePath);
        console.log(`  🔗 Symlink → ${target}`);
      } else if (stats.isFile()) {
        console.log(`  📄 Regular file (${stats.size} bytes)`);
      }
    } catch {
      console.log(`\n⚠️  File does not exist on disk`);
    }

    // Next steps
    if (status.mode === 'symlinked') {
      console.log('\nTo add overrides:');
      console.log(`  pnpm config:override ${status.targetPath}`);
    } else if (status.mode === 'generated') {
      console.log('\nOverride files:');
      const overrides = status.sources.filter(s => s.includes('.overrides.'));
      for (const override of overrides) {
        console.log(`  📝 ${override}`);
      }
    }
  }

  /**
   * Show summary status for all files
   */
  private async showSummaryStatus(statuses: FileStatus[]): Promise<void> {
    // Group by mode
    const symlinked = statuses.filter(s => s.mode === 'symlinked');
    const generated = statuses.filter(s => s.mode === 'generated');
    const copied = statuses.filter(s => s.mode === 'copied');

    console.log(`Managed Files (${statuses.length}):\n`);

    // Symlinked files
    if (symlinked.length > 0) {
      console.log('🔗 Symlinked (single source):');
      for (const status of symlinked.slice(0, 10)) {
        const template = status.sources[0];
        console.log(`  ${status.targetPath.padEnd(30)} ← ${template}`);
      }
      if (symlinked.length > 10) {
        console.log(`  ... and ${symlinked.length - 10} more`);
      }
      console.log();
    }

    // Generated files
    if (generated.length > 0) {
      console.log('🤖 Generated (multiple sources):');
      for (const status of generated.slice(0, 10)) {
        console.log(`  ${status.targetPath} (${status.sources.length} sources)`);
        for (const source of status.sources.slice(0, 3)) {
          const relativePath = path.relative(this.projectRoot, source);
          console.log(`    ← ${relativePath}`);
        }
        if (status.sources.length > 3) {
          console.log(`    ... and ${status.sources.length - 3} more`);
        }
        console.log();
      }
      if (generated.length > 10) {
        console.log(`  ... and ${generated.length - 10} more`);
      }
    }

    // Copied files
    if (copied.length > 0) {
      console.log('📄 Copied (no symlink support):');
      for (const status of copied) {
        const template = status.sources[0];
        console.log(`  ${status.targetPath.padEnd(30)} ← ${template} (copy mode)`);
      }
      console.log();
    }

    // Summary
    console.log('Summary:');
    console.log(`  • ${statuses.length} managed files`);
    console.log(`  • ${symlinked.length} symlinked (single source)`);
    console.log(`  • ${generated.length} generated (multiple sources)`);
    console.log(`  • ${copied.length} copied (no-symlink mode)`);

    // Show active modules
    const activeModules = this.moduleFilter.getActiveModules();
    if (activeModules.length > 0) {
      console.log(`\nActive modules (${activeModules.length}):`);
      console.log(`  ${activeModules.join(', ')}`);
    }
  }

  /**
   * Analyze file to determine its status
   */
  private async analyzeFile(targetPath: string, sources: Source[]): Promise<FileStatus> {
    const sourcePaths = sources.map(s => path.relative(this.projectRoot, s.path));

    // Check if file should be copied
    const hasCopyFlag = sources.some(s => s.metadata?._copy === true);

    // Determine mode
    let mode: 'symlinked' | 'generated' | 'copied';
    if (hasCopyFlag) {
      mode = 'copied';
    } else if (sources.length === 1) {
      mode = 'symlinked';
    } else {
      mode = 'generated';
    }

    // Check if actually a symlink on disk
    const absolutePath = path.join(this.projectRoot, targetPath);
    let isSymlink = false;
    try {
      const stats = await fs.lstat(absolutePath);
      isSymlink = stats.isSymbolicLink();
    } catch {
      // File doesn't exist
    }

    return {
      targetPath,
      mode,
      sources: sourcePaths,
      isSymlink,
    };
  }

  /**
   * Group sources by target path
   */
  private groupByTarget(
    templates: Source[],
    fragments: Fragment[],
    overrides: Source[]
  ): Map<string, Source[]> {
    const groups = new Map<string, Source[]>();

    // Add templates
    for (const template of templates) {
      const targetPath = this.templateDiscovery.getTargetPath(template.path);
      if (!groups.has(targetPath)) {
        groups.set(targetPath, []);
      }
      groups.get(targetPath)!.push(template);
    }

    // Add fragments
    for (const fragment of fragments) {
      const targetPaths = Array.isArray(fragment.metadata._targetPath)
        ? fragment.metadata._targetPath
        : [fragment.metadata._targetPath];

      for (const targetPath of targetPaths) {
        if (!groups.has(targetPath)) {
          groups.set(targetPath, []);
        }
        groups.get(targetPath)!.push({
          type: 'fragment',
          path: fragment.path,
          content: fragment.content,
          metadata: fragment.metadata,
          priority: fragment.metadata._priority || 100,
        });
      }
    }

    // Add overrides
    for (const override of overrides) {
      const targetPath = this.getTargetPathFromOverride(override.path);
      if (!groups.has(targetPath)) {
        groups.set(targetPath, []);
      }
      groups.get(targetPath)!.push(override);
    }

    return groups;
  }

  /**
   * Get target path from override file path
   */
  private getTargetPathFromOverride(overridePath: string): string {
    const relativePath = path.relative(this.projectRoot, overridePath);
    const parsed = path.parse(relativePath);

    // Remove .overrides from name
    const originalName = parsed.name.replace('.overrides', '');

    return path.join(parsed.dir, `${originalName}${parsed.ext}`);
  }
}

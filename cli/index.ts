#!/usr/bin/env node

/**
 * File Merge CLI
 *
 * File fragment merger - merge files from templates, fragments, and overrides
 */

import { Command } from 'commander';
import { ConfigManager } from '../core/ConfigManager.js';
import { Migrator } from '../migration/Migrator.js';
import { Validator } from '../validation/Validator.js';
import { FileManager } from '../core/FileManager.js';
import { OverrideCreator } from '../core/OverrideCreator.js';
import { StatusReporter } from '../core/StatusReporter.js';
import { watch } from 'chokidar';
import * as path from 'node:path';

const program = new Command();

program
  .name('file-merge')
  .description('File fragment merger - merge files from templates, fragments, and overrides')
  .version('1.0.0');

// Apply command
program
  .command('apply')
  .description('Apply configuration from templates, fragments, and overrides')
  .option('--dry-run', 'Show what would be generated without writing files')
  .option('--verbose', 'Detailed output')
  .option('--filter <patterns...>', 'Only process files matching patterns')
  .action(async (options) => {
    const projectRoot = process.cwd();

    const manager = new ConfigManager({
      projectRoot,
      dryRun: options.dryRun,
      verbose: options.verbose,
      filter: options.filter,
    });

    try {
      await manager.apply();
    } catch (error) {
      console.error('\n❌ Error applying configuration:', error);
      process.exit(1);
    }
  });

// Migrate commands
const migrate = program
  .command('migrate')
  .description('Migration commands for transitioning to new system');

migrate
  .command('analyze')
  .description('Analyze existing configuration and report differences')
  .action(async () => {
    const projectRoot = process.cwd();
    const migrator = new Migrator(projectRoot);

    try {
      await migrator.analyze();
    } catch (error) {
      console.error('\n❌ Error analyzing configuration:', error);
      process.exit(1);
    }
  });

migrate
  .command('extract')
  .description('Extract differences into override files')
  .option('--strategy <type>', 'Extraction strategy: smart, minimal, preserve-all', 'smart-extract')
  .option('--force', 'Overwrite existing override files')
  .option('--no-backup', 'Skip creating backups')
  .action(async (options) => {
    const projectRoot = process.cwd();
    const migrator = new Migrator(projectRoot);

    const strategyMap: Record<string, 'smart-extract' | 'minimal' | 'preserve-all'> = {
      smart: 'smart-extract',
      minimal: 'minimal',
      'preserve-all': 'preserve-all',
    };

    const strategy = strategyMap[options.strategy] || 'smart-extract';

    try {
      await migrator.extract({
        strategy,
        force: options.force,
        backup: options.backup,
      });
    } catch (error) {
      console.error('\n❌ Error extracting overrides:', error);
      process.exit(1);
    }
  });

// Validate command
program
  .command('validate')
  .description('Validate configuration files')
  .option('--strict', 'Fail on warnings')
  .action(async (options) => {
    const projectRoot = process.cwd();
    const validator = new Validator(projectRoot);

    try {
      const result = await validator.validate();

      if (!result.valid) {
        process.exit(1);
      }

      if (options.strict && result.errors.some(e => e.severity === 'warning')) {
        console.log('\n❌ Strict mode: Warnings present');
        process.exit(1);
      }
    } catch (error) {
      console.error('\n❌ Error validating configuration:', error);
      process.exit(1);
    }
  });

// Watch command
program
  .command('watch')
  .description('Watch for changes and auto-regenerate')
  .option('--verbose', 'Detailed output')
  .action(async (options) => {
    const projectRoot = process.cwd();

    console.log('👀 Watching for configuration changes...\n');
    console.log('  Watching:');
    console.log('    - atom-framework/config-templates/**/*');
    console.log('    - **/*.fragment.*');
    console.log('    - **/*.overrides.*');
    console.log('\nPress Ctrl+C to stop\n');

    const patterns = [
      path.join(projectRoot, 'atom-framework/config-templates/**/*'),
      path.join(projectRoot, '**/*.fragment.*'),
      path.join(projectRoot, '**/*.overrides.*'),
    ];

    const watcher = watch(patterns, {
      ignored: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
      persistent: true,
      ignoreInitial: true,
    });

    let regenerating = false;

    const regenerate = async () => {
      if (regenerating) return;

      regenerating = true;
      const timestamp = new Date().toLocaleTimeString();

      try {
        console.log(`\n[${timestamp}] 🔄 Regenerating configuration...`);

        const manager = new ConfigManager({
          projectRoot,
          verbose: options.verbose,
        });

        await manager.apply();

        console.log(`[${timestamp}] ✅ Done`);
      } catch (error) {
        console.error(`\n[${timestamp}] ❌ Error:`, error);
      } finally {
        regenerating = false;
      }
    };

    watcher
      .on('add', (file) => {
        console.log(`\n[${new Date().toLocaleTimeString()}] ➕ Added: ${path.relative(projectRoot, file)}`);
        regenerate();
      })
      .on('change', (file) => {
        console.log(`\n[${new Date().toLocaleTimeString()}] 📝 Changed: ${path.relative(projectRoot, file)}`);
        regenerate();
      })
      .on('unlink', (file) => {
        console.log(`\n[${new Date().toLocaleTimeString()}] ➖ Removed: ${path.relative(projectRoot, file)}`);
        regenerate();
      })
      .on('error', (error) => {
        console.error('\n❌ Watcher error:', error);
      });

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n\n👋 Stopping watcher...');
      await watcher.close();
      process.exit(0);
    });
  });

// Add command - migrate existing files to config management
program
  .command('add <file>')
  .description('Add existing file to config management')
  .option('--force', 'Overwrite if template already exists')
  .option('--no-symlink', 'Copy instead of creating symlink')
  .option('--keep-original', 'Keep original file as override')
  .action(async (file, options) => {
    const projectRoot = process.cwd();
    const fileManager = new FileManager(projectRoot);

    try {
      await fileManager.addFile(file, {
        force: options.force,
        noSymlink: !options.symlink,
        keepOriginal: options.keepOriginal,
      });
    } catch (error) {
      console.error('\n❌ Error adding file:', error);
      process.exit(1);
    }
  });

// Override command - create override file
program
  .command('override <file>')
  .description('Create override file for managed configuration')
  .option('--extract-current', 'Extract current file differences as starting point')
  .option('--edit', 'Open in editor after creation')
  .option('--template <type>', 'Override auto-detected merge strategy')
  .option('--force', 'Overwrite existing override file')
  .action(async (file, options) => {
    const projectRoot = process.cwd();
    const overrideCreator = new OverrideCreator(projectRoot);

    try {
      await overrideCreator.create(file, {
        extractCurrent: options.extractCurrent,
        edit: options.edit,
        template: options.template,
        force: options.force,
      });
    } catch (error) {
      console.error('\n❌ Error creating override:', error);
      process.exit(1);
    }
  });

// Status command - show management status
program
  .command('status [file]')
  .description('Show configuration management status')
  .action(async (file) => {
    const projectRoot = process.cwd();
    const statusReporter = new StatusReporter(projectRoot);

    try {
      await statusReporter.showStatus(file);
    } catch (error) {
      console.error('\n❌ Error showing status:', error);
      process.exit(1);
    }
  });

// Remove command - remove file from management
program
  .command('remove <file>')
  .description('Remove file from config management (revert to unmanaged)')
  .action(async (file) => {
    const projectRoot = process.cwd();
    const fileManager = new FileManager(projectRoot);

    try {
      await fileManager.removeFile(file);
    } catch (error) {
      console.error('\n❌ Error removing file:', error);
      process.exit(1);
    }
  });

// Parse arguments
program.parse();

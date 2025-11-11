/**
 * Merge Strategies Index
 *
 * Re-exports existing strategies from config-compiler and provides new strategies
 */

import type { MergeStrategy, MergeContext, ValidationResult } from '../core/types.js';

/**
 * Generic deep merge strategy for JSON objects
 * Recursively merges objects, arrays are replaced
 */
export class DeepMergeStrategy implements MergeStrategy {
  name = 'deep-merge';

  validate(content: any): ValidationResult {
    if (typeof content !== 'object' || content === null) {
      return {
        valid: false,
        errors: ['Content must be an object'],
      };
    }
    return { valid: true };
  }

  merge(sources: any[], context: MergeContext): any {
    const result: any = {};

    for (const source of sources) {
      this.deepMerge(result, source);
    }

    return result;
  }

  private deepMerge(target: any, source: any): void {
    for (const key in source) {
      if (source[key] === null) {
        // null deletes the key
        delete target[key];
        continue;
      }

      if (typeof source[key] === 'object' && !Array.isArray(source[key])) {
        // Recursive object merge
        if (!target[key] || typeof target[key] !== 'object') {
          target[key] = {};
        }
        this.deepMerge(target[key], source[key]);
      } else {
        // Direct assignment (arrays and primitives replace)
        target[key] = source[key];
      }
    }
  }
}

/**
 * Append-lines strategy for text files like .gitignore
 * Appends lines from each source, deduplicates
 */
export class AppendLinesStrategy implements MergeStrategy<string> {
  name = 'append-lines';

  validate(content: string): ValidationResult {
    if (typeof content !== 'string') {
      return {
        valid: false,
        errors: ['Content must be a string'],
      };
    }
    return { valid: true };
  }

  merge(sources: string[], context: MergeContext): string {
    const allLines: string[] = [];
    const seen = new Set<string>();

    for (const source of sources) {
      const lines = source.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        // Skip empty lines at merge time (will add back at end)
        if (trimmed === '') continue;

        // Deduplicate
        if (!seen.has(line)) {
          seen.add(line);
          allLines.push(line);
        }
      }
    }

    return allLines.join('\n') + '\n';
  }
}

/**
 * Replace strategy - last source wins completely
 * Used for files that shouldn't be merged
 */
export class ReplaceStrategy implements MergeStrategy {
  name = 'replace';

  validate(content: any): ValidationResult {
    return { valid: true }; // Accept any content
  }

  merge(sources: any[], context: MergeContext): any {
    // Return the last source
    return sources[sources.length - 1];
  }
}

/**
 * YAML merge strategy - deep merge for YAML
 */
export class YamlMergeStrategy implements MergeStrategy {
  name = 'yaml-merge';
  private deepMerge = new DeepMergeStrategy();

  validate(content: any): ValidationResult {
    return this.deepMerge.validate(content);
  }

  merge(sources: any[], context: MergeContext): any {
    return this.deepMerge.merge(sources, context);
  }
}

/**
 * Docker Compose merge strategy
 * Merges services, volumes, networks
 */
export class DockerComposeMergeStrategy implements MergeStrategy {
  name = 'docker-compose';

  validate(content: any): ValidationResult {
    if (typeof content !== 'object' || content === null) {
      return {
        valid: false,
        errors: ['Content must be an object'],
      };
    }
    return { valid: true };
  }

  merge(sources: any[], context: MergeContext): any {
    const result: any = {
      version: '3.8', // Default version
    };

    for (const source of sources) {
      // Preserve version from first source
      if (source.version && !result.version) {
        result.version = source.version;
      }

      // Merge services
      if (source.services) {
        if (!result.services) result.services = {};
        for (const [name, service] of Object.entries(source.services)) {
          result.services[name] = this.deepMerge(
            result.services[name] || {},
            service
          );
        }
      }

      // Merge volumes
      if (source.volumes) {
        if (!result.volumes) result.volumes = {};
        Object.assign(result.volumes, source.volumes);
      }

      // Merge networks
      if (source.networks) {
        if (!result.networks) result.networks = {};
        Object.assign(result.networks, source.networks);
      }
    }

    return result;
  }

  private deepMerge(target: any, source: any): any {
    const result = { ...target };

    for (const key in source) {
      if (typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }
}

/**
 * TypeScript config merge strategy
 * Handles extends, compiler options, include/exclude arrays
 */
export class TsConfigMergeStrategy implements MergeStrategy {
  name = 'tsconfig';

  validate(content: any): ValidationResult {
    if (typeof content !== 'object' || content === null) {
      return {
        valid: false,
        errors: ['Content must be an object'],
      };
    }
    return { valid: true };
  }

  merge(sources: any[], context: MergeContext): any {
    const result: any = {};

    for (const source of sources) {
      // Deep merge compilerOptions
      if (source.compilerOptions) {
        if (!result.compilerOptions) result.compilerOptions = {};
        this.deepMerge(result.compilerOptions, source.compilerOptions);
      }

      // Merge arrays (include, exclude, files)
      for (const key of ['include', 'exclude', 'files']) {
        if (source[key]) {
          if (!result[key]) result[key] = [];
          result[key] = [...new Set([...result[key], ...source[key]])];
        }
      }

      // Handle extends (last one wins)
      if (source.extends) {
        result.extends = source.extends;
      }

      // Copy other top-level properties
      for (const key of Object.keys(source)) {
        if (!['compilerOptions', 'include', 'exclude', 'files', 'extends'].includes(key)) {
          result[key] = source[key];
        }
      }
    }

    return result;
  }

  private deepMerge(target: any, source: any): void {
    for (const key in source) {
      if (typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!target[key]) target[key] = {};
        this.deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
  }
}

/**
 * VS Code Tasks merge strategy
 * Merges tasks and inputs from multiple sources
 */
export class VSCodeTasksMergeStrategy implements MergeStrategy {
  name = 'vscode-tasks';

  validate(content: any): ValidationResult {
    if (typeof content !== 'object' || content === null) {
      return {
        valid: false,
        errors: ['Content must be an object'],
      };
    }
    return { valid: true };
  }

  merge(sources: any[], context: MergeContext): any {
    const result: any = {
      version: '2.0.0',
      tasks: [],
      inputs: [],
    };

    for (const source of sources) {
      // Merge version (last one wins)
      if (source.version) {
        result.version = source.version;
      }

      // Merge tasks
      if (source.tasks && Array.isArray(source.tasks)) {
        for (const task of source.tasks) {
          result.tasks.push({ ...task });
        }
      }

      // Merge inputs (deduplicate by id)
      if (source.inputs && Array.isArray(source.inputs)) {
        for (const input of source.inputs) {
          const exists = result.inputs.some((existing: any) => existing.id === input.id);
          if (!exists) {
            result.inputs.push({ ...input });
          }
        }
      }

      // Merge global options
      if (source.options) {
        if (!result.options) result.options = {};
        Object.assign(result.options, source.options);
      }
    }

    return result;
  }

  postProcess(result: any, context: MergeContext): any {
    // Sort tasks by label for consistent output
    if (result.tasks) {
      result.tasks.sort((a: any, b: any) =>
        (a.label || '').localeCompare(b.label || '')
      );
    }

    // Sort inputs by id
    if (result.inputs) {
      result.inputs.sort((a: any, b: any) =>
        (a.id || '').localeCompare(b.id || '')
      );
    }

    return result;
  }
}

/**
 * GitLab CI merge strategy
 * Supports a master template for global settings and individual job fragments
 */
export class GitLabCIMergeStrategy implements MergeStrategy {
  name = 'gitlab-ci';

  private static readonly GLOBAL_PROPERTIES = new Set([
    'stages',
    'variables',
    'image',
    'services',
    'before_script',
    'after_script',
    'cache',
    'default',
    'workflow',
    'include',
  ]);

  validate(content: any): ValidationResult {
    if (typeof content !== 'object' || content === null) {
      return {
        valid: false,
        errors: ['Content must be an object'],
      };
    }
    return { valid: true };
  }

  merge(sources: any[], context: MergeContext): any {
    const result: any = {
      stages: [],
      variables: {},
    };

    for (let i = 0; i < sources.length; i++) {
      const source = sources[i];
      const sourcePath = context.sourcePaths[i];
      const isTemplate = this.isLikelyMasterTemplate(source);

      if (isTemplate) {
        this.mergeGlobalProperties(result, source);
      }

      this.mergeJobs(result, source, sourcePath, isTemplate, context);
    }

    return result;
  }

  private isLikelyMasterTemplate(source: any): boolean {
    // A master template typically has comprehensive global configuration
    // Check for multiple key global properties (stages, variables, workflow, etc.)
    const globalPropCount = Object.keys(source).filter((key) =>
      GitLabCIMergeStrategy.GLOBAL_PROPERTIES.has(key)
    ).length;

    // If it has 3+ global properties, it's likely a master template
    // Fragments usually only have jobs or maybe 1-2 global props
    return globalPropCount >= 3;
  }

  private mergeGlobalProperties(target: any, source: any): void {
    // Merge stages (append unique values)
    if (source.stages) {
      target.stages = target.stages || [];
      for (const stage of source.stages) {
        if (!target.stages.includes(stage)) {
          target.stages.push(stage);
        }
      }
    }

    // Merge variables (source takes precedence)
    if (source.variables) {
      target.variables = { ...target.variables, ...source.variables };
    }

    // Merge other global properties
    for (const [key, value] of Object.entries(source)) {
      if (
        GitLabCIMergeStrategy.GLOBAL_PROPERTIES.has(key) &&
        key !== 'stages' &&
        key !== 'variables'
      ) {
        if (Array.isArray(value) && Array.isArray(target[key])) {
          const targetArray = target[key] as unknown[];
          const sourceArray = value as unknown[];
          target[key] = [
            ...targetArray,
            ...sourceArray.filter((item) => !targetArray.includes(item)),
          ];
        } else if (
          typeof value === 'object' &&
          value !== null &&
          typeof target[key] === 'object'
        ) {
          target[key] = { ...target[key], ...value };
        } else {
          target[key] = value;
        }
      }
    }
  }

  private mergeJobs(
    target: any,
    source: any,
    sourcePath: string,
    isTemplate: boolean,
    context: MergeContext
  ): void {
    // Derive project root from targetPath and relativePath
    // targetPath is absolute, relativePath is relative from project root
    const projectRoot = context.targetPath.substring(
      0,
      context.targetPath.length - context.relativePath.length - 1
    );

    // Compute relative directory of source file from project root
    let relativeSourcePath = sourcePath;
    if (sourcePath.startsWith(projectRoot)) {
      relativeSourcePath = sourcePath.substring(projectRoot.length + 1);
    }

    // Get directory (not file) for prefix computation
    const lastSlash = relativeSourcePath.lastIndexOf('/');
    const relativeDir = lastSlash >= 0 ? relativeSourcePath.substring(0, lastSlash) : '.';

    const prefix = this.getJobPrefix(relativeDir);

    for (const [key, value] of Object.entries(source)) {
      if (GitLabCIMergeStrategy.GLOBAL_PROPERTIES.has(key)) {
        continue;
      }

      // This is a job
      let jobName = key;

      // Only add prefix for non-template fragments
      if (!isTemplate && prefix) {
        jobName = `${prefix}:${key}`;
      }

      target[jobName] = value;
    }
  }

  private getJobPrefix(relativeDir: string): string | null {
    if (relativeDir === '.' || relativeDir === '') {
      return null;
    }

    // Convert path separators to colons and remove common prefixes
    return relativeDir
      .replace(/[/\\]/g, ':')
      .replace(/^(packages|modules):/, ''); // Remove common prefixes
  }

  postProcess(result: any, context: MergeContext): any {
    // Sort variables alphabetically
    if (result.variables) {
      const sortedVars: Record<string, any> = {};
      Object.keys(result.variables)
        .sort()
        .forEach((key) => {
          sortedVars[key] = result.variables[key];
        });
      result.variables = sortedVars;
    }

    return result;
  }
}

/**
 * Strategy registry
 */
export const strategies: Record<string, MergeStrategy> = {
  'deep-merge': new DeepMergeStrategy(),
  'yaml-merge': new YamlMergeStrategy(),
  'append-lines': new AppendLinesStrategy(),
  'replace': new ReplaceStrategy(),
  'docker-compose': new DockerComposeMergeStrategy(),
  'tsconfig': new TsConfigMergeStrategy(),
  'vscode-tasks': new VSCodeTasksMergeStrategy(),
  'gitlab-ci': new GitLabCIMergeStrategy(),
};

/**
 * Get strategy by name or auto-detect from file path
 */
export function getStrategy(strategyName: string | undefined, filePath: string): MergeStrategy {
  if (strategyName && strategies[strategyName]) {
    return strategies[strategyName];
  }

  // Auto-detect based on file path
  const fileName = filePath.toLowerCase();

  if (fileName.endsWith('tsconfig.json') || fileName.includes('tsconfig.')) {
    return strategies['tsconfig'];
  } else if (fileName.includes('docker-compose')) {
    return strategies['docker-compose'];
  } else if (fileName.includes('gitlab-ci') || fileName === '.gitlab-ci.yml') {
    return strategies['gitlab-ci'];
  } else if (fileName.endsWith('.gitignore') || fileName.endsWith('.dockerignore')) {
    return strategies['append-lines'];
  } else if (fileName.endsWith('.editorconfig')) {
    return strategies['replace'];
  } else if (fileName.endsWith('.yaml') || fileName.endsWith('.yml')) {
    return strategies['yaml-merge'];
  } else if (fileName.endsWith('.json')) {
    return strategies['deep-merge'];
  }

  // Default to deep merge
  return strategies['deep-merge'];
}

/**
 * Template Discovery
 *
 * Discovers master template files with __ prefix in config-templates directory
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { glob } from "glob";
import type { ConfigContent, Source } from "./types.js";
import { TemplateVariableResolver } from "./TemplateVariableResolver.js";

export class TemplateDiscovery {
  constructor(private projectRoot: string) {}

  /**
   * Discover all template files in atom-framework/config-templates/
   * Template files use __ prefix (e.g., __tsconfig.json)
   */
  async discoverTemplates(): Promise<Source[]> {
    const templatesDir = path.join(
      this.projectRoot,
      "atom-framework/config-templates",
    );

    // Check if templates directory exists
    try {
      await fs.access(templatesDir);
    } catch {
      console.warn(`⚠️  Templates directory not found: ${templatesDir}`);
      return [];
    }

    // Find all files with __ prefix
    const pattern = path.join(templatesDir, "**/__*");
    const templatePaths = await glob(pattern, {
      nodir: true,
      dot: true, // Include hidden files like __.gitignore
    });

    const templates: Source[] = [];

    for (const templatePath of templatePaths) {
      try {
        const _relativePath = path.relative(templatesDir, templatePath);
        
        // Resolve template variables in the relative path (filename) FIRST
        // This allows us to skip templates early if variables aren't available
        let resolvedRelativePath: string;
        try {
          resolvedRelativePath = TemplateVariableResolver.resolve(_relativePath);
        } catch (error) {
          // If variables can't be resolved, skip this template (override file can still provide values)
          console.warn(`⚠️  Skipping template ${templatePath}: template variables not resolved (${error instanceof Error ? error.message : String(error)})`);
          continue;
        }

        // Only load content if filename resolution succeeded
        const content = await this.loadFile(templatePath);

        templates.push({
          type: "template",
          path: templatePath,
          content,
          priority: 0, // Templates have lowest priority
          resolvedRelativePath, // Store resolved path for target path calculation
        });
      } catch (error) {
        console.error(`❌ Failed to load template ${templatePath}:`, error);
      }
    }

    return templates;
  }

  /**
   * Get target path for a template file
   * Removes __ prefix and maps to project root
   * Resolves template variables in the path
   */
  getTargetPath(templatePath: string, resolvedRelativePath?: string): string {
    const templatesDir = path.join(
      this.projectRoot,
      "atom-framework/config-templates",
    );

    let relativePath: string;
    if (resolvedRelativePath) {
      // Use already resolved path
      relativePath = resolvedRelativePath;
    } else {
      // Resolve variables in relative path
      const rawRelativePath = path.relative(templatesDir, templatePath);
      relativePath = TemplateVariableResolver.resolve(rawRelativePath);
    }
    
    // Remove __ prefix from filename
    // Handle cases like: __{{ENV}}.yaml -> {{ENV}}.yaml (after resolution)
    // or: __file-{{NAME}}.yaml -> file-{{NAME}}.yaml (after resolution)
    const targetRelative = relativePath.replace(/__([^/]+)$/, "$1");

    // Resolve any remaining variables in the target path (in case variables are in directory parts)
    const fullyResolved = TemplateVariableResolver.resolve(targetRelative);

    return path.join(this.projectRoot, fullyResolved);
  }

  /**
   * Load file content based on extension
   */
  private async loadFile(filePath: string): Promise<ConfigContent> {
    const ext = path.extname(filePath).toLowerCase();
    let content = await fs.readFile(filePath, "utf-8");

    // Resolve template variables in content
    if (TemplateVariableResolver.hasVariables(content)) {
      try {
        content = TemplateVariableResolver.resolve(content);
      } catch (error) {
        // If variables can't be resolved, log warning but continue
        // This allows templates to be loaded even if some variables aren't set yet
        console.warn(`⚠️  Warning: Could not resolve template variables in ${filePath}: ${error}`);
      }
    }

    if ([".json", ".jsonc", ".json5"].includes(ext)) {
      // For JSON, parse it
      // Note: This is basic JSON parsing. For .jsonc/.json5 support,
      // we'd need additional libraries
      try {
        return JSON.parse(content);
      } catch {
        // If parsing fails, return as text
        return content;
      }
    } else if ([".yaml", ".yml"].includes(ext)) {
      // For YAML, we'll parse it using the yaml library
      const YAML = await import("yaml");
      return YAML.parse(content);
    } else if (ext === ".toml") {
      // For TOML, parse it using @iarna/toml
      const TOML = await import("@iarna/toml");
      return TOML.parse(content) as ConfigContent;
    } else {
      // For other files, return as text
      return content;
    }
  }
}

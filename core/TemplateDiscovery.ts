/**
 * Template Discovery
 *
 * Discovers master template files with __ prefix in config-templates directory
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { glob } from "glob";
import type { ConfigContent, Source } from "./types.js";

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
        const content = await this.loadFile(templatePath);
        const _relativePath = path.relative(templatesDir, templatePath);

        templates.push({
          type: "template",
          path: templatePath,
          content,
          priority: 0, // Templates have lowest priority
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
   */
  getTargetPath(templatePath: string): string {
    const templatesDir = path.join(
      this.projectRoot,
      "atom-framework/config-templates",
    );

    const relativePath = path.relative(templatesDir, templatePath);
    // Remove __ prefix from filename
    const targetRelative = relativePath.replace(/__([^/]+)$/, "$1");

    return path.join(this.projectRoot, targetRelative);
  }

  /**
   * Load file content based on extension
   */
  private async loadFile(filePath: string): Promise<ConfigContent> {
    const ext = path.extname(filePath).toLowerCase();
    const content = await fs.readFile(filePath, "utf-8");

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
    } else {
      // For other files, return as text
      return content;
    }
  }
}

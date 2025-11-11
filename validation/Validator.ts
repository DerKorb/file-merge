/**
 * Validator
 *
 * Validates configuration files for correctness
 */

import { ActiveModuleFilter } from "../core/ActiveModuleFilter.js";
import { FragmentDiscovery } from "../core/FragmentDiscovery.js";
import { OverrideDiscovery } from "../core/OverrideDiscovery.js";
import { TemplateDiscovery } from "../core/TemplateDiscovery.js";
import { type ConfigError, ErrorSeverity } from "../core/types.js";

export class Validator {
  private templateDiscovery: TemplateDiscovery;
  private fragmentDiscovery: FragmentDiscovery;
  private overrideDiscovery: OverrideDiscovery;
  private moduleFilter: ActiveModuleFilter;
  private errors: ConfigError[] = [];

  constructor(projectRoot: string) {
    this.templateDiscovery = new TemplateDiscovery(projectRoot);
    this.fragmentDiscovery = new FragmentDiscovery(projectRoot);
    this.overrideDiscovery = new OverrideDiscovery(projectRoot);
    this.moduleFilter = new ActiveModuleFilter(projectRoot);
  }

  /**
   * Validate all configuration
   */
  async validate(): Promise<{ valid: boolean; errors: ConfigError[] }> {
    console.log("✅ Validating configuration...\n");

    this.errors = [];

    // Validate templates
    await this.validateTemplates();

    // Validate fragments
    await this.validateFragments();

    // Validate overrides
    await this.validateOverrides();

    // Print results
    this.printResults();

    const hasErrors = this.errors.some((e) => e.severity === "error");

    return {
      valid: !hasErrors,
      errors: this.errors,
    };
  }

  private async validateTemplates(): Promise<void> {
    console.log("📋 Validating templates...");

    try {
      const templates = await this.templateDiscovery.discoverTemplates();
      console.log(`  ✅ Found ${templates.length} valid templates\n`);
    } catch (error) {
      this.addError({
        severity: ErrorSeverity.ERROR,
        code: "TEMPLATE_DISCOVERY_FAILED",
        message: `Failed to discover templates: ${error}`,
      });
    }
  }

  private async validateFragments(): Promise<void> {
    console.log("📦 Validating fragments...");

    try {
      const allFragments = await this.fragmentDiscovery.discoverFragments();
      const activeModules = this.moduleFilter.getActiveModules();

      console.log(`  Found ${allFragments.length} fragments`);
      console.log(`  Active modules: ${activeModules.join(", ") || "none"}`);

      // Validate each fragment
      for (const fragment of allFragments) {
        // Check if target path is specified
        if (!fragment.metadata._targetPath) {
          this.addError({
            severity: ErrorSeverity.ERROR,
            code: "MISSING_TARGET_PATH",
            message: "Fragment missing _targetPath",
            file: fragment.path,
          });
          continue;
        }

        // Check if merge strategy is valid
        if (fragment.metadata._mergeStrategy) {
          const validStrategies = [
            "deep-merge",
            "yaml-merge",
            "append-lines",
            "replace",
            "docker-compose",
            "tsconfig",
            "vscode-tasks",
            "gitlab-ci",
          ];
          if (!validStrategies.includes(fragment.metadata._mergeStrategy)) {
            this.addError({
              severity: ErrorSeverity.WARNING,
              code: "UNKNOWN_STRATEGY",
              message: `Unknown merge strategy: ${fragment.metadata._mergeStrategy}`,
              file: fragment.path,
              suggestion: `Use one of: ${validStrategies.join(", ")}`,
            });
          }
        }

        // Check conditional dependencies
        if (fragment.metadata._conditions?.activeModules) {
          for (const requiredModule of fragment.metadata._conditions
            .activeModules) {
            if (!activeModules.includes(requiredModule)) {
              this.addError({
                severity: ErrorSeverity.WARNING,
                code: "INACTIVE_DEPENDENCY",
                message: `Fragment requires inactive module: ${requiredModule}`,
                file: fragment.path,
                suggestion: `Activate module or fragment will be ignored`,
              });
            }
          }
        }
      }

      console.log(`  ✅ Fragments validated\n`);
    } catch (error) {
      this.addError({
        severity: ErrorSeverity.ERROR,
        code: "FRAGMENT_VALIDATION_FAILED",
        message: `Failed to validate fragments: ${error}`,
      });
    }
  }

  private async validateOverrides(): Promise<void> {
    console.log("🔧 Validating overrides...");

    try {
      const overrides = await this.overrideDiscovery.discoverOverrides();
      console.log(`  ✅ Found ${overrides.length} valid overrides\n`);
    } catch (error) {
      this.addError({
        severity: ErrorSeverity.ERROR,
        code: "OVERRIDE_DISCOVERY_FAILED",
        message: `Failed to discover overrides: ${error}`,
      });
    }
  }

  private addError(error: ConfigError): void {
    this.errors.push(error);
  }

  private printResults(): void {
    if (this.errors.length === 0) {
      console.log("✅ Validation Report\n");
      console.log("═".repeat(60));
      console.log("\n✅ All validation checks passed!\n");
      return;
    }

    console.log("\n⚠️  Validation Report\n");
    console.log("═".repeat(60));

    const errors = this.errors.filter((e) => e.severity === "error");
    const warnings = this.errors.filter((e) => e.severity === "warning");
    const infos = this.errors.filter((e) => e.severity === "info");

    if (errors.length > 0) {
      console.log("\n❌ Errors:");
      for (const error of errors) {
        this.printError(error);
      }
    }

    if (warnings.length > 0) {
      console.log("\n⚠️  Warnings:");
      for (const warning of warnings) {
        this.printError(warning);
      }
    }

    if (infos.length > 0) {
      console.log("\nℹ️  Information:");
      for (const info of infos) {
        this.printError(info);
      }
    }

    console.log(`\n${"═".repeat(60)}`);
    console.log(
      `\n📊 Summary: ${errors.length} errors, ${warnings.length} warnings, ${infos.length} info`,
    );

    if (errors.length > 0) {
      console.log(
        "\n❌ Validation failed - please fix errors before applying configuration",
      );
    }
  }

  private printError(error: ConfigError): void {
    const icon =
      error.severity === "error"
        ? "❌"
        : error.severity === "warning"
          ? "⚠️"
          : "ℹ️";
    console.log(`\n  ${icon} [${error.code}] ${error.message}`);

    if (error.file) {
      console.log(`     File: ${error.file}`);
    }

    if (error.line) {
      console.log(`     Line: ${error.line}`);
    }

    if (error.suggestion) {
      console.log(`     💡 ${error.suggestion}`);
    }
  }
}

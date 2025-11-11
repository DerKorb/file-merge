# @feinarbyte/file-merge

File fragment merger - batteries included, dlx-ready.

Merge files from templates, fragments, and overrides with intelligent strategies for YAML, JSON, GitLab CI, Docker Compose, TypeScript configs, text files, and more.

## Installation

```bash
# Using pnpm dlx
pnpm dlx @feinarbyte/file-merge

# Using npx
npx @feinarbyte/file-merge

# Or install globally
npm install -g @feinarbyte/file-merge
```

## Usage

### Apply Merging

```bash
file-merge apply
```

Options:
- `--dry-run` - Show what would be generated without writing files
- `--verbose` - Detailed output
- `--filter <patterns...>` - Only process files matching patterns

### Watch Mode

```bash
file-merge watch
```

Automatically regenerates merged files when source files change.

### Migration

```bash
# Analyze existing files
file-merge migrate analyze

# Extract differences into override files
file-merge migrate extract --strategy smart
```

### Validation

```bash
file-merge validate
```

### Status

```bash
file-merge status [file]
```

## Features

- **Template-based merging** - Define templates in `config-templates/`
- **Fragment merging** - Merge fragments from packages/modules
- **Override support** - Override templates with project-specific changes
- **Smart merge strategies** - Auto-detects merge strategy based on file type
- **Supported formats**: YAML, JSON, GitLab CI, Docker Compose, TypeScript configs, VS Code tasks, text files (.gitignore, .dockerignore), and more

## Merge Strategies

- `deep-merge` - Deep merge for JSON objects
- `yaml-merge` - Deep merge for YAML files
- `gitlab-ci` - GitLab CI/CD configuration merging
- `docker-compose` - Docker Compose file merging
- `tsconfig` - TypeScript config merging
- `vscode-tasks` - VS Code tasks.json merging
- `append-lines` - Line-by-line appending (for .gitignore, etc.)
- `replace` - Last source wins

## Publishing

To publish this package to npm:

```bash
# Make sure you're logged in to npm with access to @feinarbyte scope
npm login

# Build the package
npm run build

# Publish (will automatically build via prepublishOnly)
npm publish --access public
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev
```

## License

MIT


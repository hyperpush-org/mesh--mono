# Mesh Language

[![VS Code Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/OpenWorthTechnologies.mesh-lang)](https://marketplace.visualstudio.com/items?itemName=OpenWorthTechnologies.mesh-lang)
[![VS Code Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/OpenWorthTechnologies.mesh-lang)](https://marketplace.visualstudio.com/items?itemName=OpenWorthTechnologies.mesh-lang)

Language support for [Mesh](https://meshlang.dev) -- an expressive, readable programming language with built-in concurrency via actors and supervision trees.

## Features

- **Syntax Highlighting** -- comprehensive TextMate grammar with scoping for keywords, types, literals, comments, and module-qualified calls
- **Diagnostics** -- real-time error reporting from the Mesh compiler
- **Hover Information** -- type information and documentation on hover
- **Go to Definition** -- jump to definitions across files
- **Completions** -- context-aware completion suggestions with snippet support for functions and types
- **Signature Help** -- parameter hints for function calls showing argument types and names
- **Document Symbols** -- Outline view with hierarchical symbols for functions, services, types, and more

## Requirements

The Mesh compiler (`meshc`) must be installed and available in your PATH. The extension connects to the built-in language server provided by `meshc`.

**Install meshc:**

```sh
curl -sSf https://meshlang.dev/install.sh | sh
```

## Extension Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `mesh.lsp.path` | `meshc` | Path to the meshc binary. Must be in PATH, or provide an absolute path. |

## Release Notes

See [CHANGELOG.md](CHANGELOG.md) for a detailed list of changes in each release.

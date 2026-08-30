# Ugaris Mod Registry

The official mod registry for the Ugaris Launcher. This repository maintains a curated list of mods that appear in the launcher's "Available" tab.

## How It Works

The **Ugaris Client** (the game) runs on **Windows**, **macOS**, and **Linux**. Mods extend or modify the client's functionality. The **Ugaris Launcher** simply orchestrates mod management - discovering, installing, enabling, and updating mods on your behalf.

## For Players

Mods listed in this registry can be installed directly from the Ugaris Launcher:

1. Open the Ugaris Launcher
2. Open the **Mods** view (shown by default; **Options > Launcher > Mods**
   toggles the button)
3. Browse the **Browse** tab to discover mods
4. Click **Install** on any mod you want

The launcher will automatically download the correct version for your operating system.

## For Mod Authors

Want to add your mod to this registry? See [MODS.md](MODS.md) for detailed instructions on:

- How to structure your mod repository
- How to create a valid `mod.json` file
- How to set up GitHub Actions for cross-platform builds
- How to submit your mod to this registry

### Requirements for Native Mods

**Source code is required.** For native/dynamic library mods, we require:

1. **Full source code** available in the repository
2. **GitHub Actions pipeline** that builds the releases
3. **No pre-compiled binaries** committed to the repository

This ensures transparency, security, and allows community verification. Binaries must be generated through CI/CD, not uploaded manually.

### Quick Start

1. Create a GitHub repository with your mod's **source code**
2. Set up a **GitHub Actions workflow** to build for all platforms
3. Add a `mod.json` file to the root (see [MODS.md](MODS.md) for schema)
4. [Open an issue](../../issues/new?template=mod-submission.yml) to submit your mod

## Cross-Platform Support

The Ugaris Client runs on three platforms. Native mods should support:

| Platform | Library Extension | Architecture |
|----------|------------------|--------------|
| Windows | `.dll` | x86_64 |
| macOS | `.dylib` | x86_64, arm64 |
| Linux | `.so` | x86_64 |

**Mod slots:** Native mods use slots `bmod`, `cmod`, `dmod`, `emod`, `fmod`. The `amod` slot is reserved for system use. The launcher may rename your mod file to an available slot when installing multiple mods.

> **Note:** the current Ugaris client only loads native mods. Lua mod
> support existed in an older client and is kept in the manifest format for
> compatibility, but Lua mods are not executed by today's client.

## Registry Structure

```
mod-registry/
├── registry.json                        # The main registry file
├── README.md                            # This file
├── MODS.md                              # Detailed mod authoring guide
├── scripts/validate-registry.mjs        # CI validation (structure + live installability)
└── .github/workflows/validate.yml       # Runs the validation on PRs, pushes and weekly
```

Every pull request and push is validated: the registry structure is checked,
and every listed mod's `mod.json` and release files are fetched exactly the
way the launcher fetches them. A weekly run catches mods whose releases
disappear after listing.

## Registry Schema

The `registry.json` file contains:

| Field | Description |
|-------|-------------|
| `version` | Schema version (currently 1) |
| `lastUpdated` | ISO 8601 timestamp of last update |
| `mods` | Array of mod entries |
| `categories` | Available category definitions |

### Mod Entry Fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | The mod's GitHub repository as "owner/repo" (this is what the launcher installs from) |
| `name` | Yes | Display name |
| `description` | No | Short description |
| `author` | No | Author name |
| `githubRepo` | No | Overrides `id` as the repository if they differ (rarely needed) |
| `category` | No | Primary category ID |
| `featured` | No | Show in featured section |
| `verified` | No | Shows "Verified" badge |
| `tags` | No | Searchable tags |

### Available Categories

- `demo` - Demo & Examples
- `utility` - Utilities
- `ui` - UI Enhancements
- `gameplay` - Gameplay
- `visual` - Visual
- `automation` - Automation
- `social` - Social

## Contributing

### Submitting a Mod

1. Ensure your repository contains **source code** (for native mods)
2. Ensure builds are generated via **GitHub Actions**
3. Ensure your repository has a valid `mod.json`
4. Test that your mod installs correctly via URL in the launcher
5. [Open an issue](../../issues/new?template=mod-submission.yml) with:
   - Your GitHub repository URL
   - A brief description of your mod
   - Which category it belongs to

### Reporting Issues

If a listed mod is broken, malicious, or abandoned, please [open an issue](../../issues/new) to report it.

## Verification

Mods with the "Verified" badge have been reviewed by maintainers for:

- Source code availability and readability
- CI/CD pipeline builds the released binaries
- Correct installation via launcher
- Functionality as described
- No malicious code detected
- Active maintenance

## License

This registry is maintained by the Ugaris Project team.

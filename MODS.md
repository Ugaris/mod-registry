# Ugaris Mod Authoring Guide

This guide explains how to create, organize, and host mods for the Ugaris Client, and how to submit them to the official registry.

## Table of Contents

- [Overview](#overview)
- [Mod Types](#mod-types)
- [Cross-Platform Development](#cross-platform-development)
- [Source Code Requirements](#source-code-requirements)
- [Setting Up Your Repository](#setting-up-your-repository)
- [GitHub Actions CI/CD](#github-actions-cicd)
- [The mod.json File](#the-modjson-file)
- [Repository Organization](#repository-organization)
- [Version Management](#version-management)
- [Submitting to the Registry](#submitting-to-the-registry)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

---

## Overview

The **Ugaris Client** is the game application that runs on Windows, macOS, and Linux. **Mods extend or modify the client's functionality**. The **Ugaris Launcher** is a separate application that orchestrates mod management - it handles discovering, installing, enabling, disabling, and updating mods, but the mods themselves run within the client.

The launcher can install mods directly from GitHub repositories. For this to work, your repository must contain a `mod.json` file that describes your mod and tells the launcher which files to download.

**Key requirements:**
- Your repository must be **public** on GitHub
- You must have a valid `mod.json` in the repository root
- For native mods: **source code must be available** and builds must be generated via **GitHub Actions**
- Files referenced in `mod.json` must exist at the specified paths

---

## Mod Types

### Where mods live

Every mod — native library, Lua scripts, or both — is **one folder** under the
player's user directory:

```
<userdir>/mods/
  mods.json                    # which mods are on, and in what order
  Ugaris-tracker-mod/
    mod.json                   # written by the launcher; required
    tracker.so                 # any filename — one platform library per folder
    data/...                   # your own files
```

`<userdir>` is `%APPDATA%\Astonia\` on Windows, `~/.local/share/Astonia/` on
Linux and `~/Library/Application Support/Astonia/` on macOS — or whatever path
the launcher passes the client as `--userdir`.

**How enable/disable works:** the launcher writes `mods/mods.json`, which the
client reads at startup:

```json
{ "version": 1, "mods": { "Ugaris-tracker-mod": { "enabled": false, "order": 100 } } }
```

Nothing is renamed on disk. Because the client never unloads a library, a
toggle takes effect the **next time the game is launched**.

### Native/Dynamic Library Mods

Native mods are dynamic libraries loaded by the game client at startup. The
file extension depends on the platform:

| Platform | Extension | Example |
|----------|-----------|---------|
| Windows | `.dll` | `mymod.dll` |
| macOS | `.dylib` | `mymod.dylib` |
| Linux | `.so` | `mymod.so` |

**The filename is yours to choose.** The client loads whatever library it finds
in your mod's folder.

> **The `amod`..`fmod` slots are gone.** Older versions of the client loaded
> `bin/{a..f}mod.<ext>` next to the executable — six mods maximum, with the
> launcher renaming your library onto a free slot. Nothing renames anything any
> more, and there is no limit on how many mods a player can install. If your
> build still emits `bmod.so`, it will install and load fine under that name;
> renaming it to something meaningful is a courtesy to players browsing their
> mods folder, not a requirement.

**If you ship more than one library for a platform** — say your mod bundles a
dependency — add `"entry"` to your `mod.json` naming your own library without
its extension. The client will not guess which one is the mod, and the launcher
refuses an install that would produce a folder it cannot load.

`amod` is still special, but it is not a slot you can claim: the Ugaris system
mod ships in the game depot at `bin/amod.<ext>` and is the only mod allowed to
override client behaviour, claim the server's mod packets or replace the
client's game data tables. Nothing installed under `mods/` can reach that.

### Lua Mods

Lua mods are script-based: an `init.lua` (loaded first) plus any other `*.lua`
files, in exactly the same kind of mod folder as a native mod. A single mod may
ship both a library and scripts.

```
<userdir>/mods/
  YourModName/
    mod.json
    init.lua
    other_files.lua
```

Lua mods are **inherently cross-platform** - the same scripts work on all
operating systems.

---

## Linking against the client

Mods call functions and read variables exported by the game executable.
How that resolves differs per platform:

| Platform | Mechanism |
|----------|-----------|
| Linux | The client is linked `-rdynamic`; the dynamic loader resolves your undefined symbols at load time. Link with `-Wl,--allow-shlib-undefined`. |
| macOS | Same idea; link with `-undefined dynamic_lookup`. |
| **Windows** | **You must link the client's import library.** Download `mod-sdk.zip` from an [astonia_community_client release](https://github.com/eddoww/astonia_community_client/releases), copy `lib/moac.a` (MinGW) / `lib/moac.lib` (MSVC) into your project, and link it. A DLL built with `/FORCE:UNRESOLVED` instead will load but **crashes the game** on the first client API call - there is no runtime symbol fixup on Windows. |

The `mod-sdk.zip` also contains the authoritative API headers
(`amod/amod.h`, `amod/amod_structs.h`, `astonia.h`, `dll.h`).

## Cross-Platform Development

The Ugaris Client runs on three platforms. If you're developing a native mod, you should support all of them:

### Supported Platforms

| Platform | OS | Architecture | Library Extension |
|----------|-----|--------------|-------------------|
| Windows | Windows 10+ | x86_64 | `.dll` |
| macOS | macOS 11+ | x86_64, arm64 (Universal) | `.dylib` |
| Linux | Ubuntu 20.04+ compatible | x86_64 | `.so` |

### Platform-Specific Considerations

**Windows:**
- Build with MSVC or MinGW-w64
- Target x86_64 architecture
- Use `.dll` extension

**macOS:**
- Build Universal binaries (x86_64 + arm64) when possible
- Use `-arch x86_64 -arch arm64` flags with clang
- Use `.dylib` extension
- Consider code signing for distribution

**Linux:**
- Build on Ubuntu 20.04 or compatible for broad compatibility
- Link against common system libraries
- Use `.so` extension
- Consider static linking for fewer dependencies

### mod.json for Cross-Platform Mods

Your `mod.json` should list files for each platform:

```json
{
  "name": "My Cross-Platform Mod",
  "version": "1.0.0",
  "type": "dll",
  "files": [
    {
      "name": "mymod.dll",
      "path": "releases/v1.0.0/windows/mymod.dll",
      "platform": "windows"
    },
    {
      "name": "mymod.dylib",
      "path": "releases/v1.0.0/macos/mymod.dylib",
      "platform": "macos"
    },
    {
      "name": "mymod.so",
      "path": "releases/v1.0.0/linux/mymod.so",
      "platform": "linux"
    }
  ]
}
```

The launcher will download only the file matching the user's platform.

---

## Source Code Requirements

**For native/dynamic library mods, source code availability is mandatory.**

### Why We Require Source Code

1. **Security** - Users and maintainers can audit the code for malicious behavior
2. **Trust** - Transparent development builds community confidence
3. **Verification** - We can verify that released binaries match the source
4. **Collaboration** - Others can learn from, contribute to, or fork your work
5. **Longevity** - If you stop maintaining, others can continue

### What This Means

- Your repository must contain **all source code** needed to build the mod
- Binaries must be built via **GitHub Actions**, not uploaded manually
- **No pre-compiled binaries** should be committed to your repository
- Build artifacts should only exist in GitHub Releases (generated by CI)

### Acceptable Repository Contents

**Yes:**
- Source code (`.c`, `.cpp`, `.h`, `.rs`, etc.)
- Build configuration (`CMakeLists.txt`, `Makefile`, `Cargo.toml`, etc.)
- GitHub Actions workflow files
- Documentation and assets

**No:**
- Pre-compiled `.dll`, `.dylib`, `.so` files in the repo
- Obfuscated or minified source code
- Binary blobs without source

### Exception: Lua Mods

Lua mods don't require CI/CD since they're distributed as source code. The `.lua` files themselves are both the source and the distribution.

---

## Setting Up Your Repository

### Step 1: Create a GitHub Repository

1. Go to [github.com/new](https://github.com/new)
2. Name your repository (e.g., `my-ugaris-mod`)
3. Make it **Public**
4. Initialize with a README
5. Choose a license (MIT, GPL, Apache, etc.)
6. Click **Create repository**

### Step 2: Add Your Source Code

Structure your source code logically:

```
your-mod-repo/
├── .github/
│   └── workflows/
│       └── build.yml        # GitHub Actions workflow
├── src/
│   ├── main.c               # Your source files
│   ├── hooks.c
│   └── utils.h
├── CMakeLists.txt           # Build configuration
├── mod.json                 # Mod metadata
├── README.md                # Documentation
└── LICENSE                  # Your chosen license
```

### Step 3: Set Up GitHub Actions

Create a workflow file at `.github/workflows/build.yml` to automatically build your mod for all platforms. See the [GitHub Actions CI/CD](#github-actions-cicd) section for complete examples.

### Step 4: Create mod.json

Create a `mod.json` file in the **root** of your repository. See [The mod.json File](#the-modjson-file) section for the schema.

### Step 5: Push and Verify

1. Push your code to GitHub
2. Watch the Actions tab to ensure builds succeed
3. Verify releases are created with all platform binaries
4. Test installation via the launcher

---

## GitHub Actions CI/CD

Your mod must be built using GitHub Actions. This ensures binaries are reproducible and match the source code.

### Basic Cross-Platform Workflow

Create `.github/workflows/build.yml`:

```yaml
name: Build Mod

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    strategy:
      matrix:
        include:
          - os: windows-latest
            artifact: mymod.dll
            platform: windows
          - os: macos-latest
            artifact: mymod.dylib
            platform: macos
          - os: ubuntu-latest
            artifact: mymod.so
            platform: linux

    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4

      - name: Fetch client import library (Windows)
        if: matrix.platform == 'windows'
        shell: bash
        run: |
          # Required: Windows mods link against the client's import library
          curl -fsSL -o mod-sdk.zip \
            "https://github.com/eddoww/astonia_community_client/releases/latest/download/mod-sdk.zip"
          unzip -oq mod-sdk.zip
          mkdir -p lib && cp mod-sdk/lib/moac.a mod-sdk/lib/moac.lib lib/

      - name: Build (Windows)
        if: matrix.platform == 'windows'
        run: |
          cmake -B build -DCMAKE_BUILD_TYPE=Release
          cmake --build build --config Release
          cp build/Release/mymod.dll mymod.dll

      - name: Build (macOS)
        if: matrix.platform == 'macos'
        run: |
          cmake -B build -DCMAKE_BUILD_TYPE=Release \
            -DCMAKE_OSX_ARCHITECTURES="x86_64;arm64"
          cmake --build build
          cp build/mymod.dylib mymod.dylib

      - name: Build (Linux)
        if: matrix.platform == 'linux'
        run: |
          cmake -B build -DCMAKE_BUILD_TYPE=Release
          cmake --build build
          cp build/mymod.so mymod.so

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.platform }}
          path: ${{ matrix.artifact }}

  release:
    needs: build
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - uses: actions/checkout@v4

      - name: Download all artifacts
        uses: actions/download-artifact@v4
        with:
          path: artifacts

      - name: Organize release files
        run: |
          mkdir -p release/windows release/macos release/linux
          cp artifacts/windows/mymod.dll release/windows/
          cp artifacts/macos/mymod.dylib release/macos/
          cp artifacts/linux/mymod.so release/linux/

      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          files: |
            release/windows/mymod.dll
            release/macos/mymod.dylib
            release/linux/mymod.so
```

### How It Works

1. **Trigger**: Workflow runs when you push a tag like `v1.0.0`
2. **Matrix build**: Builds run in parallel on Windows, macOS, and Linux
3. **Artifacts**: Each build uploads its binary
4. **Release**: A final job downloads all artifacts and creates a GitHub Release

### Creating a Release

To trigger a build and release:

```bash
git tag v1.0.0
git push origin v1.0.0
```

### Referencing Release Files in mod.json

After the workflow creates a release, reference the files:

```json
{
  "files": [
    {
      "name": "mymod.dll",
      "path": "https://github.com/you/repo/releases/download/v1.0.0/mymod.dll",
      "platform": "windows"
    },
    {
      "name": "mymod.dylib",
      "path": "https://github.com/you/repo/releases/download/v1.0.0/mymod.dylib",
      "platform": "macos"
    },
    {
      "name": "mymod.so",
      "path": "https://github.com/you/repo/releases/download/v1.0.0/mymod.so",
      "platform": "linux"
    }
  ]
}
```

### Alternative: Rust Project

If your mod is written in Rust:

```yaml
name: Build Mod

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    strategy:
      matrix:
        include:
          - os: windows-latest
            target: x86_64-pc-windows-msvc
            artifact: mymod.dll
            platform: windows
          - os: macos-latest
            target: x86_64-apple-darwin
            artifact: libmymod.dylib
            output: mymod.dylib
            platform: macos
          - os: ubuntu-20.04
            target: x86_64-unknown-linux-gnu
            artifact: libmymod.so
            output: mymod.so
            platform: linux

    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-action@stable
        with:
          targets: ${{ matrix.target }}

      - name: Build
        run: cargo build --release --target ${{ matrix.target }}

      - name: Rename artifact
        run: |
          cp target/${{ matrix.target }}/release/${{ matrix.artifact }} \
             ${{ matrix.output || matrix.artifact }}

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.platform }}
          path: ${{ matrix.output || matrix.artifact }}
```

---

## The mod.json File

The `mod.json` file tells the launcher everything it needs to know about your mod.

### Complete Schema

```json
{
  "name": "My Awesome Mod",
  "version": "1.0.0",
  "description": "A brief description of what your mod does",
  "author": "YourUsername",
  "authorUrl": "https://github.com/YourUsername",
  "type": "dll",
  "files": [
    {
      "name": "mymod.dll",
      "path": "https://github.com/you/repo/releases/download/v1.0.0/mymod.dll",
      "platform": "windows"
    },
    {
      "name": "mymod.dylib",
      "path": "https://github.com/you/repo/releases/download/v1.0.0/mymod.dylib",
      "platform": "macos"
    },
    {
      "name": "mymod.so",
      "path": "https://github.com/you/repo/releases/download/v1.0.0/mymod.so",
      "platform": "linux"
    }
  ],
  "tags": ["utility", "ui"],
  "homepage": "https://github.com/YourUsername/your-mod-repo",
  "branch": "main"
}
```

### Field Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | **Yes** | Display name shown in the launcher |
| `version` | string | **Yes** | Semantic version (e.g., "1.2.0") |
| `description` | string | No | Short description (1-2 sentences) |
| `author` | string | No | Your name or username |
| `authorUrl` | string | No | Link to your profile or website |
| `type` | string | **Yes** | Either `"dll"` or `"lua"` |
| `files` | array | **Yes** | List of files to download |
| `files[].name` | string | **Yes** | Filename it is installed as (e.g., "mymod.dll") — your choice |
| `files[].path` | string | **Yes** | Path to file (repo path or release URL) |
| `files[].platform` | string | No | Target platform: `"windows"`, `"macos"`, or `"linux"` |
| `files[].targetPath` | string | No | Subdirectory **inside your mod's folder** (empty = its root) |
| `entry` | string | No | Which library is the mod, without extension. Required if you ship more than one for a platform |
| `tags` | array | No | Category tags for filtering |
| `homepage` | string | No | URL to mod's homepage or documentation |
| `branch` | string | No | Git branch to use (default: "main") |

### Example: Cross-Platform Native Mod

```json
{
  "name": "Enhanced Minimap",
  "version": "2.1.0",
  "description": "Adds zoom controls and waypoints to the minimap",
  "author": "MapMaster",
  "authorUrl": "https://github.com/MapMaster",
  "type": "dll",
  "files": [
    {
      "name": "mymod.dll",
      "path": "https://github.com/MapMaster/enhanced-minimap/releases/download/v2.1.0/mymod.dll",
      "platform": "windows"
    },
    {
      "name": "mymod.dylib",
      "path": "https://github.com/MapMaster/enhanced-minimap/releases/download/v2.1.0/mymod.dylib",
      "platform": "macos"
    },
    {
      "name": "mymod.so",
      "path": "https://github.com/MapMaster/enhanced-minimap/releases/download/v2.1.0/mymod.so",
      "platform": "linux"
    }
  ],
  "tags": ["ui", "minimap", "navigation"],
  "homepage": "https://github.com/MapMaster/enhanced-minimap"
}
```

### Example: Lua Mod (Cross-Platform by Default)

```json
{
  "name": "Auto-Loot Filter",
  "version": "1.0.0",
  "description": "Automatically filters loot based on configurable rules",
  "author": "LootLord",
  "type": "lua",
  "files": [
    {
      "name": "main.lua",
      "path": "src/main.lua",
      "targetPath": "mods/AutoLootFilter"
    },
    {
      "name": "config.lua",
      "path": "src/config.lua",
      "targetPath": "mods/AutoLootFilter"
    }
  ],
  "tags": ["automation", "loot", "inventory"]
}
```

### Example: Windows-Only Mod

If your mod only supports one platform, specify it clearly:

```json
{
  "name": "Windows-Only Feature",
  "version": "1.0.0",
  "description": "Uses Windows-specific APIs (Windows only)",
  "type": "dll",
  "files": [
    {
      "name": "cmod.dll",
      "path": "https://github.com/you/repo/releases/download/v1.0.0/cmod.dll",
      "platform": "windows"
    }
  ],
  "tags": ["windows-only"]
}
```

---

## Repository Organization

### Recommended Structure for Native Mods

```
your-mod/
├── .github/
│   └── workflows/
│       └── build.yml         # CI/CD pipeline
├── src/
│   ├── main.c                # Source code
│   ├── feature.c
│   └── feature.h
├── include/                  # Headers
│   └── mod_api.h
├── CMakeLists.txt            # Build config
├── mod.json                  # Mod metadata
├── README.md                 # Documentation
└── LICENSE                   # License file
```

**Note:** No `releases/` folder with binaries! All binaries come from GitHub Releases generated by CI.

### Recommended Structure for Lua Mods

```
your-lua-mod/
├── src/
│   ├── main.lua
│   ├── config.lua
│   └── utils/
│       └── helpers.lua
├── mod.json
├── README.md
└── LICENSE
```

---

## Version Management

### Semantic Versioning

Use [semantic versioning](https://semver.org/) (MAJOR.MINOR.PATCH):

- **MAJOR**: Breaking changes or complete rewrites
- **MINOR**: New features, backwards compatible
- **PATCH**: Bug fixes, backwards compatible

Examples:
- `1.0.0` - Initial release
- `1.1.0` - Added new feature
- `1.1.1` - Fixed a bug
- `2.0.0` - Major rewrite

### Releasing a New Version

1. **Update your code** and commit changes
2. **Update `mod.json`:**
   - Change the `version` field
   - Update file paths to reference the new version tag
3. **Commit the mod.json change**
4. **Create and push a tag:**
   ```bash
   git tag v1.1.0
   git push origin v1.1.0
   ```
5. **Wait for CI** to build and create the release
6. **Verify** the release contains all platform binaries

### Example Version Update

Before (v1.0.0):
```json
{
  "version": "1.0.0",
  "files": [
    { "path": "https://github.com/you/repo/releases/download/v1.0.0/mymod.dll", "platform": "windows" }
  ]
}
```

After (v1.1.0):
```json
{
  "version": "1.1.0",
  "files": [
    { "path": "https://github.com/you/repo/releases/download/v1.1.0/mymod.dll", "platform": "windows" }
  ]
}
```

---

## Submitting to the Registry

### Prerequisites

Before submitting, ensure:

- [ ] Your repository is **public**
- [ ] **Source code is available** (for native mods)
- [ ] Builds are generated via **GitHub Actions**
- [ ] You have a valid `mod.json` in the repository root
- [ ] All files referenced in `mod.json` exist
- [ ] Your mod installs correctly via URL in the launcher
- [ ] Your mod works as described on all supported platforms

### Testing Your Mod

Test your mod before submitting:

1. Open the Ugaris Launcher
2. Go to Mods section
3. Click "Install from URL"
4. Enter your GitHub repo URL: `owner/repo-name`
5. Verify the mod installs and works correctly
6. **Test on multiple platforms if possible**

### Submission Process

1. **Go to the Issues page** of this repository
2. **Click "New Issue"**
3. **Select "Mod Submission"** template
4. **Fill out the form:**
   - GitHub Repository URL (e.g., `YourUsername/your-mod`)
   - Mod name
   - Brief description
   - Category (utility, ui, gameplay, visual, automation, social)
   - Supported platforms
   - Any additional notes

### What Happens Next

1. A maintainer will review your submission
2. They will verify:
   - Source code is available and readable
   - GitHub Actions builds the releases
   - The mod installs correctly
   - The mod functions as described
3. If approved, your mod will be added to `registry.json`
4. Your mod will appear in the launcher's "Available" tab

### Submission Requirements

Your mod will be evaluated on:

| Criteria | Description |
|----------|-------------|
| **Source available** | Full source code in the repository |
| **CI/CD builds** | Binaries built by GitHub Actions, not uploaded |
| **Valid mod.json** | Must follow the schema correctly |
| **Working installation** | Must install without errors |
| **Cross-platform** | Should support Windows, macOS, and Linux (preferred) |
| **Accurate description** | Must do what it claims to do |
| **No malicious code** | Must not harm users or their systems |
| **Appropriate content** | Must be suitable for the community |

### Getting Verified Status

After your mod is added to the registry, you can request "Verified" status by demonstrating:

- Consistent functionality across all platforms
- Clean, well-documented source code
- Active maintenance
- Responsive to user issues
- No reports of problems

---

## Best Practices

### Code Quality

- **Write clean, readable code** - others will review it
- **Comment complex logic** - explain the "why"
- **Follow platform conventions** - use appropriate APIs for each OS
- **Handle errors gracefully** - don't crash the client
- **Test on all platforms** - or clearly document limitations

### Cross-Platform Development

- **Use cross-platform libraries** when possible (SDL, etc.)
- **Abstract platform-specific code** into separate files
- **Test on all platforms** before releasing
- **Document platform limitations** if any features are platform-specific

### CI/CD

- **Keep your workflow simple** - easier to maintain
- **Pin action versions** - avoid unexpected breaks
- **Test workflow changes** in a branch first
- **Include build status badge** in your README

### Documentation

- **Write a good README** explaining what your mod does
- **Document build requirements** for contributors
- **Include screenshots** if your mod has visual elements
- **List known issues** and limitations

### Security

- **Never include secrets** in your repository
- **Don't request unnecessary permissions**
- **Be transparent** about what your mod does
- **Respond promptly** to security reports

---

## Troubleshooting

### "No mod.json found"

- Ensure `mod.json` is in the **root** of your repository
- Check that it's on the `main` or `master` branch
- Verify the file is named exactly `mod.json` (lowercase)

### "Invalid mod.json"

- Validate your JSON at [jsonlint.com](https://jsonlint.com)
- Check for missing commas, quotes, or brackets
- Ensure all required fields are present

### "File not found" during installation

- Verify release URLs are correct
- Ensure the GitHub Release was created successfully
- Check that all platform binaries were uploaded

### GitHub Actions build fails

- Check the Actions tab for error logs
- Ensure all dependencies are installed in the workflow
- Test the build locally first
- Verify CMakeLists.txt or build config is correct

### Mod installs but doesn't work

- Check `mods/mods.json` — the mod may be disabled (a toggle only takes
  effect at the next launch)
- If your folder holds more than one library for the platform, add `"entry"`
  to `mod.json`: the client will not guess which one to load
- Check that the game version is compatible
- Verify you built for the correct architecture
- Look for error logs in the game directory

### macOS: Library not loading

- Ensure you built a Universal binary or the correct architecture
- Check if code signing is required
- Verify library dependencies are available

### Linux: Library not found

- Check for missing shared library dependencies (`ldd mymod.so`)
- Consider static linking for fewer dependencies
- Build on an older distro for broader compatibility

---

## Questions?

If you have questions about mod development or the submission process:

1. Check existing [Issues](../../issues) for similar questions
2. Open a new issue with the "Question" label
3. Join the community Discord (if available)

---

## Quick Reference Card

```
Repository Structure (Native Mod):
├── .github/workflows/build.yml  (required - CI/CD)
├── src/                         (required - source code)
├── CMakeLists.txt               (build config)
├── mod.json                     (required - metadata)
├── README.md                    (recommended)
└── LICENSE                      (recommended)

mod.json minimum:
{
  "name": "...",
  "version": "X.X.X",
  "type": "dll",
  "files": [
    { "name": "mymod.dll", "path": "...release URL...", "platform": "windows" },
    { "name": "mymod.dylib", "path": "...release URL...", "platform": "macos" },
    { "name": "mymod.so", "path": "...release URL...", "platform": "linux" }
  ]
}

Library filename: yours to choose. One folder per mod, no slots, no limit.
Extensions by platform: .dll (Windows), .dylib (macOS), .so (Linux)
Note: add "entry" if you ship more than one library for a platform

Release workflow:
1. Update code and mod.json version
2. git tag v1.0.0
3. git push origin v1.0.0
4. Wait for CI to build
5. Verify release created

To submit: Open an issue with "Mod Submission" template
```

# Markwhen Obsidian Plugin

![markwhen-obsidian-plugin](./screenshot.png)

![Obsidian Downloads](https://img.shields.io/badge/dynamic/json?logo=obsidian&color=%23483699&label=downloads&query=%24%5B%22markwhen%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json)

This plugin integrates [Markwhen](https://github.com/mark-when/markwhen/) into [Obsidian.md](https://obsidian.md/). You can use markwhen syntax to create timelines.

> [!Note]  
> Latest release: 0.0.1  
> Document version: 0.0.1

## Installation

> [!Note]  
> Make sure that you are not in the **Restricted Mode**.

### Install the plugin manually

1. Go to the repo's latest [release page](https://github.com/mark-when/obsidian-plugin/releases/latest), and download `markwhen.zip`.
2. Copy unzipped files to your local path `[your vault]/.obsidian/plugins/markwhen/`.
3. Relaunch Obsidian, or refresh the plugin list, you will see this plugin.
4. In the plugin list, enable `Markwhen` and enjoy!

### Install via BRAT

:construction:

## Development

Ensure you first have Obsidian installed, and set up a development vault.

For developers on Linux / MacOS, if the path to your vault is something other than `~/Documents/Obsidian Vault`, update `copyAssets.sh` to point to your vault's location.

For developers on Windows, since there's no watch command out-of-the-box, you can place the repo right in the dev vault config directory (i.e. `[your vault]/.obsidian/plugins/markwhen/`), and set the `outDir` to `./` in `vite.config.ts` (vite complains about this).

> [!Note]
> The plugin id in the manifest is `markwhen`, indicating users will find their plugin under the `.obsidian/plugins/markwhen` directory if they install this plugin from official Obsidian distribution.

```sh
git clone git@github.com:mark-when/obsidian-plugin.git
cd obsidian-plugin
npm i
npm run vite
```

You can download and enable the [Hot-Reload](https://github.com/pjeby/hot-reload) plugin in the dev vault to experience a smooth debugging workflow. Every time `main.js`, `manifest.json` or `styles.css` updates, it will trigger an auto-reload.

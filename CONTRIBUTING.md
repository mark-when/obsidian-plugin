# Contribute to Obsidian Markwhen

## Clone the repo

```cmd
cd [your-working-folder]
```

> **Note**
> It is recommended to use the config directory of a dev vault (e.g., .obsidian\plugins\\) as the working directory.

```cmd
git clone https://github.com/Acylation/obsidian-markwhen.git markwhen
cd markwhen
```

> **Note**  
> The plugin id in the manifest is `markwhen` rather than `obsidian-markwhen`.  

## Install dependencies

```cmd
npm install
```

## Configuring packages

Since Obsidian is built on top of Electron, some of the packages will be resolved as if in browsers. To avoid this, we need to manually support node.js functionality by modifying the package.json of the packages.

### iconv-lite

In `node_modules/iconv-lite/package.json`, L29-L32, change the values from `false` to `true`.

```json
"browser": {
    "./lib/extend-node": true,
    "./lib/streams": true
},
```

### WebSocket

In `node_modules/ws/package.json`, L21 & L27, change the file from `browser.js` to `index.js`.

```json  
"exports": {
    ".": {
      "browser": "./index.js", // this line
      "import": "./wrapper.mjs",
      "require": "./index.js"
    },
    "./package.json": "./package.json"
  },
  "browser": "index.js", // and this line
  "engines": {
    "node": ">=10.0.0"
  },
```

### Developing

```cmd
npm run dev
```

> **Note**  
> This command will listen for changes to the source code and provide a new build when you save changes.  
> Download and enable the [Hot-Reload](https://github.com/pjeby/hot-reload) plugin to experience a smooth debugging workflow.  

### Linting and building

```cmd
npm run lint
```

```cmd
npm run build
```

# Contribute to Obsidian Markwhen

## Clone the repo

```cmd
cd [your-working-folder]
```

> **Note**
> It is recommended to use the config directory of a dev vault (e.g., .obsidian\plugins\markwhen) as the working directory.

```cmd
git clone https://github.com/Acylation/obsidian-markwhen.git markwhen
cd markwhen
```

> **Note**  
> The plugin id in the manifest is `markwhen` rather than `obsidian-markwhen`, indicating the users will find their plugin under the `markwhen` folder.

## Install dependencies

```cmd
npm install
```

## Developing

```cmd
npm run dev
```

> **Note**  
> This command will listen for changes to the source code and provide a new build when you save changes.  
> Download and enable the [Hot-Reload](https://github.com/pjeby/hot-reload) plugin to experience a smooth debugging workflow.  

## Linting and building

```cmd
npm run lint
```

```cmd
npm run build
```

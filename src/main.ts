import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	TFolder,
	normalizePath,
	TextComponent,
	ExtraButtonComponent,
	ToggleComponent,
} from 'obsidian';

import {Mutex} from 'async-mutex';

import { MARKWHEN_ICON } from './icons';
import { VIEW_TYPE_MARKWHEN, MarkwhenView } from './MarkwhenView';

import * as fs from 'fs';
import * as path from 'path';

interface MarkwhenPluginSettings {
	folder: string;
	deftoselectedtoggle: boolean;
	actionToContextSettingtoggle: boolean;
}


const DEFAULT_SETTINGS: MarkwhenPluginSettings = {
	folder: 'Markwhen',
	deftoselectedtoggle: false,
	actionToContextSettingtoggle: false,
};




export default class MarkwhenPlugin extends Plugin {
	public utilities = new class {
        constructor(public superThis: MarkwhenPlugin) {
        }
        public testSetOuterPrivate(target: number) {
        }
    }(this);

    public fclass = new class {
		constructor(public superThis: MarkwhenPlugin) {

        }
		private lastCallTime = 0;
		private notPassedCount = 1;
		private isUpdating = false;
		private timeMutex = new Mutex();
		private countMutex = new Mutex();

		async checkAndCreateFolder(folderPath: string) {
			const vault = this.superThis.app.vault;
			folderPath = normalizePath(folderPath);
			//https://github.com/zsviczian/obsidian-excalidraw-plugin/issues/658
			const folder = vault.getAbstractFileByPathInsensitive(folderPath);
			if (folder && folder instanceof TFolder) return;
			if (folder && folder instanceof TFile) return; //File name corruption
			await vault.createFolder(folderPath);
		}

		async createMWFile(
			filename: string,
			folderPath: string,
			initData?: string
		): Promise<TFile> {
			const fname = normalizePath(`${folderPath}/${filename}`);
			await this.checkAndCreateFolder(folderPath);
			// Acquire the time mutex to ensure exclusive access to the critical section for lastCallTime
			const timeRelease = await this.timeMutex.acquire();
			try {
				const currentTime = Date.now();
				if (!this.isUpdating && (Math.floor(currentTime / 1000) != Math.floor(this.lastCallTime / 1000))) {
					// Set the flag to indicate that the value is being updated
					this.isUpdating = true;

					// Release the time mutex to allow other functions to proceed
					timeRelease();

					// Update the value
					const file = await this.updateLastCallTime(currentTime, fname, initData);
					return file;
				} else {
					timeRelease();
					// Increment the not passed count
					const file = await this.incrementNotPassedCount(fname, initData);
					return file;
				}
			} finally {
				// Release the time mutex to allow other functions to proceed
				timeRelease();
			}
		}

		private async updateLastCallTime(
			currentTime: number,
			filename: string,
			initData?: string): Promise<TFile> {
			// Acquire the time mutex to ensure exclusive access to the critical section for lastCallTime
			const timeRelease = await this.timeMutex.acquire();
			let file;
			try {
				// Update the last call time
				this.lastCallTime = currentTime;
				this.zeroNotPassedCount();
				file = await this.superThis.app.vault.create(filename+".mw", initData ?? '');
				this.isUpdating = false;
			} finally {
				// Release the time mutex to allow other functions to proceed
				timeRelease();
			}
			return file;
		}

		private async incrementNotPassedCount(
			filename: string,
			initData?: string): Promise<TFile> {
			// Acquire the count mutex to ensure exclusive access to the critical section for notPassedCount
			const countRelease = await this.countMutex.acquire();
			let file;
			try {
				// Increment the not passed count
				file = await this.superThis.app.vault.create(filename+ " (" + this.notPassedCount + ').mw', initData ?? '');
				this.notPassedCount++;
			} finally {
				// Release the count mutex to allow other functions to proceed
				countRelease();
			}
			return file;
		}
		private async zeroNotPassedCount(): Promise<void> {
			// Acquire the count mutex to ensure exclusive access to the critical section for notPassedCount
			const countRelease = await this.countMutex.acquire();
			try {
				// Increment the not passed count
				this.notPassedCount = 1;
			} finally {
				// Release the count mutex to allow other functions to proceed
				countRelease();
			}
		}

	}(this);


	settings: MarkwhenPluginSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
            id: 'markwhen-create-template',
            name: 'Create Markwhen Template File',
            callback: () => {
				const markwhenfile =  '/markwhen.mw';
				const obsidianConfigDir = this.app.vault.adapter.basePath;
				const pluginFolderPath = path.join(obsidianConfigDir, this.manifest?.dir?.replace(/\//g, "\\") ?? ''); //check if configdir exists and if file does not exist create one

				fs.readFile(pluginFolderPath  + markwhenfile, 'utf8', (err, data) => {
					if (err) {
						console.error('Error reading file:', err);
						return;
					}
					this.createAndOpenMWFile(undefined,undefined,data);
					// Do something with the file contents here
				});
                // Your command logic goes here
                console.log('My Plugin Command executed!');
            }
        });

		this.addRibbonIcon(
			MARKWHEN_ICON,
			'Create new Markwhen file', // tooltip
			() => {
				//TODO: better UX dealing with ribbon icons
				this.createAndOpenMWFile();
				}
		);

		this.registerView(
			VIEW_TYPE_MARKWHEN,
			(leaf) => new MarkwhenView(leaf, 'text', this)
		);

		this.registerExtensions(['mw'], VIEW_TYPE_MARKWHEN);

		this.addSettingTab(new MarkwhenPluginSettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async activateView(): Promise<void> {
		const leaf = this.app.workspace.getLeaf('tab');

		leaf.setViewState({
			type: VIEW_TYPE_MARKWHEN,
			active: true,
		});

		this.app.workspace.revealLeaf(leaf);
	}

	//Credits to https://github.com/yuleicul/obsidian-ketcher on file operations
	async createAndOpenMWFile(
		filename?: string,
		foldername?: string,
		initData?: string
	) {
		filename = filename ?? `Markwhen ${new Date()
			.toLocaleString('en-US', { hour12: false })
			.replace(/\//g, '-')
			.replace(/:/g, '.')
			.replace(/,/, '')}`;
		if (this.settings.deftoselectedtoggle && this.app.workspace.getActiveFile() instanceof TFile ) {foldername = this.app.workspace.getActiveFile()?.parent?.path ?? this.app.workspace.lastActiveFile.parent.path;}
		const folderPath = normalizePath(foldername ?? this.settings.folder)
		const file = await this.fclass.createMWFile(filename, folderPath, initData);
		this.app.workspace.getLeaf('tab').openFile(file);
	}

	async fileExists(filePath: string): Promise<boolean> {
		return await this.app.vault.adapter.exists(filePath);
	}

}

class MarkwhenPluginSettingTab extends PluginSettingTab {
	plugin: MarkwhenPlugin;

	constructor(app: App, plugin: MarkwhenPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		const folderSetting = new Setting(containerEl)
			.setName('Default folder')
			.setDesc('Default folder for new Markwhen files.')
			.addExtraButton((button: ExtraButtonComponent) => {
				button.setIcon('rotate-ccw').onClick(async () => {
					folderText.setValue(DEFAULT_SETTINGS.folder);
					this.plugin.settings.folder = DEFAULT_SETTINGS.folder; // Extract to Default Object
					deftoselecttoggle.setValue(DEFAULT_SETTINGS.deftoselectedtoggle);
					this.plugin.settings.deftoselectedtoggle = DEFAULT_SETTINGS.deftoselectedtoggle; 
					await this.plugin.saveSettings();
				});
			});

		const folderText = new TextComponent(folderSetting.controlEl)
			.setPlaceholder(DEFAULT_SETTINGS.folder)
			.setValue(this.plugin.settings.folder)
			.onChange(async (value) => {
				this.plugin.settings.folder = value;
				await this.plugin.saveSettings();
			});

		if (this.plugin.settings.deftoselectedtoggle) {
			folderText.inputEl.classList.add('disabled-text-field');
		} else {
			folderText.inputEl.classList.remove('disabled-text-field');
		}

		const defToSelectedSetting = new Setting(containerEl)
		.setName('Default To Current Folder')
		.setDesc('Create new MW file under current folder');

		const deftoselecttoggle = new ToggleComponent(defToSelectedSetting.controlEl)
		.setValue(this.plugin.settings.deftoselectedtoggle)
		.onChange(async (value) => {
			this.plugin.settings.deftoselectedtoggle = value;
			await this.plugin.saveSettings();
			folderText.setDisabled(value);
			// Apply the CSS class to gray out the folder name text field
			if (value) {
				folderText.inputEl.classList.add('disabled-text-field');
			} else {
				folderText.inputEl.classList.remove('disabled-text-field');
			}
		});

		const actionToContextSetting = new Setting(containerEl)
		.setName('Actions on Context Menu')
		.setDesc('Add Default Actions to Context Menu');

		const actionToContextSettingtoggle = new ToggleComponent(actionToContextSetting.controlEl)
		.setValue(this.plugin.settings.actionToContextSettingtoggle)
		.onChange(async (value) => {
			this.plugin.settings.actionToContextSettingtoggle = value;
			await this.plugin.saveSettings();
		});
	}
}

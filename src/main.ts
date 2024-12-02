import {
	App,
	ExtraButtonComponent,
	normalizePath,
	Plugin,
	PluginSettingTab,
	Setting,
	TextComponent,
	TFile,
	TFolder,
} from 'obsidian';

import { MARKWHEN_ICON } from './icons';
import { MarkwhenView, VIEW_TYPE_MARKWHEN } from './MarkwhenView';

interface MarkwhenPluginSettings {
	folder: string;
}

const DEFAULT_SETTINGS: MarkwhenPluginSettings = {
	folder: 'Markwhen',
};

export default class MarkwhenPlugin extends Plugin {
	settings: MarkwhenPluginSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: 'print-greeting-to-console',
			name: 'Print greeting to console',
			callback: () => {
				console.log('Hey, you!');
			},
		});

		this.addRibbonIcon(
			MARKWHEN_ICON,
			'Create new Markwhen file', // tooltip
			() => {
				//TODO: better UX dealing with ribbon icons
				this.createAndOpenMWFile(
					`Markwhen ${new Date()
						.toLocaleString('en-US', { hour12: false })
						.replace(/\//g, '-')
						.replace(/:/g, '.')
						.replace(/,/, '')}.mw` // improve this
				);
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
		filename: string,
		foldername?: string,
		initData?: string
	) {
		const file = await this.createMWFile(filename, foldername, initData);
		this.app.workspace.getLeaf('tab').openFile(file);
	}

	async createMWFile(
		filename: string,
		foldername?: string,
		initData?: string
	): Promise<TFile> {
		const folderPath = normalizePath(foldername || this.settings.folder);
		await this.checkAndCreateFolder(folderPath);
		const fname = normalizePath(`${folderPath}/${filename}`);
		const file = await this.app.vault.create(fname, initData ?? '');
		return file;
	}

	async checkAndCreateFolder(folderPath: string) {
		const vault = this.app.vault;
		folderPath = normalizePath(folderPath);
		//https://github.com/zsviczian/obsidian-excalidraw-plugin/issues/658
		const folder = vault.getAbstractFileByPathInsensitive(folderPath);
		if (folder && folder instanceof TFolder) return;
		if (folder && folder instanceof TFile) return; //File name corruption
		await vault.createFolder(folderPath);
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
	}
}

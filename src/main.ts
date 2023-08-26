import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	addIcon,
	TFile,
	TFolder,
	normalizePath,
} from 'obsidian';

import { VIEW_TYPE_MARKWHEN, MarkwhenView } from './MarkwhenView';

import { MARKWHEN_ICON_NAME, MARKWHEN_ICON_SVG } from './icon';

interface MarkwhenPluginSettings {
	mySetting: string;
}

const DEFAULT_FOLDER = 'Markwhen';

const DEFAULT_SETTINGS: MarkwhenPluginSettings = {
	mySetting: 'default',
};

export default class MarkwhenPlugin extends Plugin {
	settings: MarkwhenPluginSettings;

	async onload() {
		await this.loadSettings();

		addIcon(MARKWHEN_ICON_NAME, MARKWHEN_ICON_SVG);
		// https://github.com/mark-when/markwhen/issues/131

		this.addRibbonIcon(
			MARKWHEN_ICON_NAME, // icon id, built-in lucide or add your custom by `addIcon()`
			'Create new Markwhen file', // tooltip
			() => {
				this.createAndOpenMWFile(
					`Markwhen ${new Date()
						.toLocaleString('en-US', { hour12: false })
						.replace(/\//g, '-')
						.replace(/:/g, '.')
						.replace(/,/, '')}.mw` // improve this
				);
			}
		);

		// this.addCommand() // id, name, cb

		this.registerView(VIEW_TYPE_MARKWHEN, (leaf) => new MarkwhenView(leaf));

		this.registerExtensions(['mw'], VIEW_TYPE_MARKWHEN);

		this.addSettingTab(new MarkwhenPluginSettingTab(this.app, this));

		// file layer
		// handling hot data
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

	/**
	 * activateView opens the main Projects view in a new workspace leaf.
	 * */
	async activateView(): Promise<void> {
		const leaf = this.app.workspace.getLeaf('tab');

		// leaf.openFile(
		// 	markwhenFile,
		// 	!subpath || subpath === ''
		// 		? { active }
		// 		: { active, eState: { subpath } }
		// );

		leaf.setViewState({
			type: VIEW_TYPE_MARKWHEN,
			active: true,
			state: {},
		});

		this.app.workspace.revealLeaf(leaf);
	}

	// functions in file modules are taken from https://github.com/yuleicul/obsidian-ketcher

	async createAndOpenMWFile(
		filename: string,
		foldername?: string,
		initData?: string
	): Promise<string> {
		const file = await this.createMWFile(filename, foldername, initData);
		this.openMWFile(file, true);
		return file.path;
	}

	async createMWFile(
		filename: string,
		foldername?: string,
		initData?: string
	): Promise<TFile> {
		const folderPath = normalizePath(foldername || DEFAULT_FOLDER); // normalizePath(foldername || this.settings.folder);
		await this.checkAndCreateFolder(folderPath); //create folder if it does not exist
		const fname = normalizePath(`${folderPath}/${filename}`);
		const file = await this.app.vault.create(fname, initData ?? '');

		return file;
	}

	async checkAndCreateFolder(folderPath: string) {
		const vault = this.app.vault;
		folderPath = normalizePath(folderPath);
		//https://github.com/zsviczian/obsidian-excalidraw-plugin/issues/658
		//@ts-ignore
		const folder = vault.getAbstractFileByPathInsensitive(folderPath);
		if (folder && folder instanceof TFolder) {
			return;
		}
		if (folder && folder instanceof TFile) {
			console.log('folder already exists');
		}
		await vault.createFolder(folderPath);
	}

	public openMWFile(
		drawingFile: TFile,
		active: boolean = false,
		subpath?: string
	) {
		const leaf = this.app.workspace.getLeaf('tab');

		leaf.openFile(
			drawingFile,
			!subpath || subpath === ''
				? { active }
				: { active, eState: { subpath } }
		);
	}
}

// class SampleModal extends Modal

class MarkwhenPluginSettingTab extends PluginSettingTab {
	plugin: MarkwhenPlugin;

	constructor(app: App, plugin: MarkwhenPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Setting #1')
			.setDesc("It's a secret")
			.addText((text) =>
				text
					.setPlaceholder('Enter your secret')
					.setValue(this.plugin.settings.mySetting)
					.onChange(async (value) => {
						this.plugin.settings.mySetting = value;
						await this.plugin.saveSettings();
					})
			);
	}
}

// TODO: toggle markdown/markwhen view
// TODO: adapt light/dark
// TODO: file system interface

import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	addIcon,
	TFile,
	TFolder,
	normalizePath,
	TextComponent,
	ExtraButtonComponent,
} from 'obsidian';

import { VIEW_TYPE_MARKWHEN, MarkwhenView } from './MarkwhenView';

import { MARKWHEN_ICON_NAME, MARKWHEN_ICON_SVG } from '../assets/icon';
import { ViewPlugin } from '@codemirror/view';
import { MarkwhenCodemirrorPlugin } from './MarkwhenCodemirrorPlugin';

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

		addIcon(MARKWHEN_ICON_NAME, MARKWHEN_ICON_SVG); // https://github.com/mark-when/markwhen/issues/131
		addIcon(
			'oneview',
			'<g stroke-width="11" transform="translate(0px, -5px) scale(1.1)"  stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">    <path d="M 45.826 24.996 l 37.494 0"></path>    <path d="M 37.494 49.992 l 29.162 0 "></path>    <path d="M 41.66 74.988 l 33.328 0"></path>    <path d=" M 20.83 24.996 l 0 49.992"></path></g>'
		);
		this.addRibbonIcon(
			MARKWHEN_ICON_NAME, // icon id, built-in lucide or add your custom by `addIcon()`
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

		this.registerView(VIEW_TYPE_MARKWHEN, (leaf) => new MarkwhenView(leaf));

		this.registerExtensions(['mw'], VIEW_TYPE_MARKWHEN);
		this.registerEditorExtension([
			ViewPlugin.fromClass(MarkwhenCodemirrorPlugin),
		]);

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

	// functions in file modules are taken from https://github.com/yuleicul/obsidian-ketcher

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
		const folderPath = normalizePath(foldername || this.settings.folder); // normalizePath(foldername || this.settings.folder);
		await this.checkAndCreateFolder(folderPath);
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

// TODO: toggle markdown/markwhen view & highlighting

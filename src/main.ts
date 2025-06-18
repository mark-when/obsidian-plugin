import {
	App,
	ExtraButtonComponent,
	normalizePath,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TextComponent,
	TFile,
	TFolder,
} from 'obsidian';

import { MARKWHEN_ICON } from './icons';
import { MarkwhenView, VIEW_TYPE_MARKWHEN } from './MarkwhenView';
import { getDefaultFileName } from './utils/fileUtils';
import { getTemplateURL, ViewType } from './templates';
import { parse } from '@markwhen/parser';
import { getAppState, getMarkwhenState } from './utils/markwhenState';

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
			id: 'markwhen-new-file',
			name: 'Create new Markwhen File',
			callback: () => {
				this.createAndOpenMWFile(getDefaultFileName());
			},
		});

		this.addCommand({
			id: 'markwhen-open-text-view',
			name: 'Open text view',
			callback: async () => {
				this.openViewFromCurrent('text');
			},
		});

		this.addCommand({
			id: 'markwhen-open-oneview-view',
			name: 'Open vertical timeline view',
			callback: async () => {
				this.openViewFromCurrent('oneview');
			},
		});

		this.addCommand({
			id: 'markwhen-open-timeline-view',
			name: 'Open timeline view',
			callback: async () => {
				this.openViewFromCurrent('timeline');
			},
		});

		this.addCommand({
			id: 'markwhen-open-calendar-view',
			name: 'Open calendar view',
			callback: async () => {
				this.openViewFromCurrent('calendar');
			},
		});

		this.addRibbonIcon(
			MARKWHEN_ICON,
			'Create new Markwhen file', // tooltip
			() => {
				//TODO: better UX dealing with ribbon icons
				this.createAndOpenMWFile(getDefaultFileName());
			}
		);

		this.registerView(
			VIEW_TYPE_MARKWHEN,
			(leaf) => new MarkwhenView(leaf, 'text', this)
		);

		this.registerExtensions(['mw'], VIEW_TYPE_MARKWHEN);

		this.registerMarkdownCodeBlockProcessor(
			'mw',
			this.renderTimeline.bind(this)
		);

		this.addSettingTab(new MarkwhenPluginSettingTab(this.app, this));
	}

	onunload() {}

	renderTimeline(mw: string, el: HTMLElement) {
		const container = el.createEl('div', {
			cls: 'mw-timeline',
		});
		const frame = container.createEl('iframe');
		frame.src = getTemplateURL('timeline');
		frame.height = `500px`;
		frame.width = '100%';
		const parsed = parse(mw);
		frame.onload = () => {
			frame.contentWindow?.postMessage(
				{
					type: 'appState',
					request: true,
					id: `markwhen_0`,
					params: getAppState(parsed),
				},
				'*'
			);
			frame.contentWindow?.postMessage(
				{
					type: 'markwhenState',
					request: true,
					id: `markwhen_0`,
					params: getMarkwhenState(parsed, mw),
				},
				'*'
			);
		};
	}

	async openViewFromCurrent(viewType: ViewType) {
		const currentFile = this.app.workspace.getActiveFile();
		if (currentFile === null || currentFile.extension !== 'mw') {
			new Notice('You must be on a Markwhen file to run this command.');
			return;
		}

		const leaf = this.app.workspace.getLeaf('split');
		await leaf.open(new MarkwhenView(leaf, viewType, this));
		await leaf.openFile(currentFile);
		await leaf.setViewState({
			type: VIEW_TYPE_MARKWHEN,
			active: true,
		});
	}

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

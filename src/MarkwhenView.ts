import { TextFileView, WorkspaceLeaf, EventRef, Menu, Notice } from 'obsidian';
import MarkwhenPlugin from './main';
import { MARKWHEN_ICON_NAME } from '../assets/icon';
export const VIEW_TYPE_MARKWHEN = 'markwhen-view';

import { parse } from '@markwhen/parser';
import { useLpc, AppState, MarkwhenState } from '@markwhen/view-client';
import { useColors } from './utils/colorMap';
type ViewType = 'timeline' | 'calendar' | 'resume';

import { join } from 'path';
import { getNonce } from './utils/nonce';

export class MarkwhenView extends TextFileView {
	viewType: ViewType;
	plugin: MarkwhenPlugin;
	iframe: HTMLIFrameElement;
	plaintext: Boolean;
	vaultListener: EventRef;
	lpc: ReturnType<typeof useLpc>;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);

		this.viewType = 'timeline';
		this.iframe = this.contentEl.createEl('iframe');
		this.iframe.height = '100%';
		this.iframe.width = '100%';

		this.plaintext = false;
	}

	getViewData() {
		return this.data;
	}

	setViewData(data: string, _clear: boolean): void {
		this.data = data;

		if (_clear) {
			this.iframe.src = this.app.vault.adapter.getResourcePath(
				join(
					this.app.vault.configDir,
					'plugins',
					'obsidian-markwhen',
					'assets',
					`${this.viewType}.html`
				)
			);

			this.updateView();
		}
	}

	getDisplayText() {
		return this.file?.name ?? 'Markwhen';
	}

	getIcon() {
		return MARKWHEN_ICON_NAME;
	}

	getViewType() {
		// This implements the TextFileView class provided by Obsidian API
		// Don't get confused with Markwhen visualizations
		return VIEW_TYPE_MARKWHEN;
	}

	onPaneMenu(
		menu: Menu,
		source: 'more-options' | 'tab-header' | string
	): void {
		// insert in the front of the section
		if (source == 'more-options' || source == 'tab-header') {
			menu.addItem((item) => {
				item.setTitle('Open as text')
					.setIcon('file-text')
					.onClick(() => {
						new Notice('should open as plain text'); // TODO: setup another plaintext view, may require a cm6 plugin
					})
					.setSection('pane');
			});
		}

		// load default menu items
		super.onPaneMenu(menu, source);
	}

	clear() {} // preserve to implement class TextFileView

	async onOpen() {
		this.addAction('calendar', 'Calendar', (evt) => {
			if (this.viewType == 'calendar') return;
			this.setViewType('calendar');
		});

		this.addAction('clock', 'Timeline', (evt) => {
			if (this.viewType == 'timeline') return;
			this.setViewType('timeline');
		});

		this.registerDomEvent(window, 'message', async (e) => {
			if (e.source == this.iframe.contentWindow) {
				// console.log(e);
				// handle received global message here
				/* Sample e.data
					{
						"type": "setHoveringPath",
						"request": true,
						"id": "markwhen_WIPSNWsi1BPsoc5PIRwRTMicRS3xVGGX"
					}
					{
						"type": "appState",
						"response": true,
						"id": "markwhen_CkNiTDyiNpVq6ZAjbsrsDEn8PgL9ERbn"
					}
				*/
			}
		});

		this.registerInterval(
			window.setInterval(() => {
				this.iframe.contentWindow?.postMessage(
					{
						type: 'markwhenState',
						request: true,
						id: `markwhen_${getNonce()}`,
						params: this.getMarkwhenState(),
					},
					'*'
				);
				this.iframe.contentWindow?.postMessage(
					{
						type: 'appState',
						request: true,
						id: `markwhen_${getNonce()}`,
						params: this.getAppState(),
					},
					'*'
				);
			}, 1000) // init before timer?
		);

		this.lpc = useLpc({
			markwhenState: async (newState) => {
				this.iframe.contentWindow?.postMessage(
					{
						type: 'markwhenState',
						request: true,
						id: `markwhen_${getNonce()}`,
						params: newState,
					},
					'*'
				);
			},

			appState: (newState) => {
				this.iframe.contentWindow?.postMessage(
					{
						type: 'appState',
						request: true,
						id: `markwhen_${getNonce()}`,
						params: newState,
					},
					'*'
				);
			},
		});
	}

	async onClose() {
    this.lpc.close();
	}

	async setViewType(view: ViewType) {
		this.viewType = view;
		this.iframe.src = this.app.vault.adapter.getResourcePath(
			join(
				this.app.vault.configDir,
				'plugins',
				'obsidian-markwhen',
				'assets',
				`${this.viewType}.html`
			)
		);
		this.updateView();
	}

	async updateView() {
		const rawText = this.data;
		const parsed = parse(rawText);
		const parseResult = {
			markwhenState: {
				rawText,
				parsed: parsed.timelines,
				transformed: parsed.timelines[0].events,
			},
			appState: {
				...this.getAppState(),
				colorMap: useColors(parsed.timelines[0]),
			},
		};
		this.lpc.postRequest('markwhenState', parseResult?.markwhenState);
		this.lpc.postRequest('appState', parseResult?.appState);
	}

	getMarkwhenState(): MarkwhenState {
		const parsed = parse(this.data);
		return {
			rawText: this.data,
			parsed: parsed.timelines,
			transformed: parsed.timelines[0].events,
		};
	}

	getAppState(): AppState {
		const isDark =
			window.document.body.attributes
				.getNamedItem('class')
				?.value.contains('theme-dark') &&
			!window.document.body.attributes
				.getNamedItem('class')
				?.value.contains('theme-light'); // edge: 1 & 1 or 0 & 0

		return {
			isDark,
			hoveringPath: undefined,
			detailPath: undefined,
			colorMap: useColors(parse(this.data).timelines[0]) ?? {},
		};
	}
}

// TODO
// handle hot data
// onChange:{
//   this.data = await (getHotData)
//   this.requestSave(this.data)
// }

import {
	TextFileView,
	WorkspaceLeaf,
	EventRef,
	Menu,
	Notice,
	addIcon,
} from 'obsidian';
import MarkwhenPlugin from './main';
import { MARKWHEN_ICON_NAME } from '../assets/icon';
export const VIEW_TYPE_MARKWHEN = 'markwhen-view';
import { parse, toDateRange, dateRangeToString } from '@markwhen/parser';
import { useLpc, AppState, MarkwhenState } from '@markwhen/view-client';
import { useColors } from './utils/colorMap';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';

type ViewType = 'timeline' | 'calendar' | 'resume' | 'text';

import { join } from 'path';
import { getNonce } from './utils/nonce';

export class MarkwhenView extends TextFileView {
	viewType: ViewType;
	plugin: MarkwhenPlugin;
	vaultListener: EventRef;
	lpc: ReturnType<typeof useLpc>;

	root: HTMLDivElement;
	iframe: HTMLIFrameElement;
	editorView: EditorView;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);

		this.viewType = 'text';
		this.iframe = this.contentEl.createEl('iframe');
		this.iframe.height = '100%';
		this.iframe.width = '100%';
		this.iframe.style.display = 'none';

		this.root = this.contentEl.createDiv({
			cls: 'markdown-source-view cm-s-obsidian mod-cm6 is-folding is-live-preview show-properties is-readable-line-width node-insert-event markwhenEditor',
		});
	}

	getViewData() {
		return this.data;
	}

	initialEditorState(doc: string) {
		return EditorState.create({
			doc,
			extensions: [
				EditorView.updateListener.of((update) => {
					if (update.docChanged) {
						this.data = update.state.sliceDoc();
						this.requestSave();
					}
				}),
			],
		});
	}

	setViewData(data: string, _clear: boolean): void {
		this.data = data;

		if (this.viewType === 'text') {
			if (!this.editorView) {
				this.editorView = new EditorView({
					state: this.initialEditorState(data),
					parent: this.root,
				});
			} else {
				this.editorView.setState(this.initialEditorState(data));
			}
		} else {
			this.iframe.src = this.app.vault.adapter.getResourcePath(
				join(
					this.app.vault.configDir,
					'plugins',
					'obsidian-markwhen',
					'assets',
					`${this.viewType}.html`
				)
			);
		}
		this.updateView();
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
		addIcon(
			'markwhen',
			'<path fill="currentColor" d="M 87.175 87.175 H 52.8 C 49.0188 87.175 45.925 84.0813 45.925 80.3 S 49.0188 73.425 52.8 73.425 H 87.175 C 90.9563 73.425 94.05 76.5188 94.05 80.3 S 90.9563 87.175 87.175 87.175 Z M 80.3 59.675 H 32.175 C 28.3938 59.675 25.3 56.5813 25.3 52.8 S 28.3938 45.925 32.175 45.925 H 80.3 C 84.0813 45.925 87.175 49.0188 87.175 52.8 S 84.0813 59.675 80.3 59.675 Z M 18.425 32.175 H 18.425 C 14.6438 32.175 11.55 29.0813 11.55 25.3 S 14.6438 18.425 18.425 18.425 H 32.175 C 35.9563 18.425 39.05 21.5188 39.05 25.3 S 35.9563 32.175 32.175 32.175 Z"></path>'
		);
		addIcon(
			'pen-line',
			'<path d="M 48 80 h 36" stroke="currentColor" stroke-width="8"/><path stroke="currentColor" stroke-width="8" d="M 66 14 a 8.48 8.48 90 0 1 12 12 L 28 76 l -16 4 l 4 -16 Z"/>'
		);
		this.addAction(
			'calendar',
			'Click to view Calendar\n⌘+Click to open to the right',
			(evt) => {
				if (this.viewType === 'calendar') return;
				this.setViewType('calendar');
			}
		);

		this.addAction(
			'markwhen',
			'Click to view Timeline\n⌘+Click to open to the right',
			(evt) => {
				if (this.viewType === 'timeline') return;
				this.setViewType('timeline');
			}
		);

		this.addAction(
			'pen-line',
			'Click to edit text\n⌘+Click to open to the right',
			(evt) => {
				console.log('event', evt);
			}
		);

		this.registerDomEvent(window, 'message', async (e) => {
			if (e.source == this.iframe.contentWindow && e.data.request) {
				if (e.data.type === 'newEvent') {
					const newEventString = `\n${dateRangeToString(
						toDateRange(e.data.params.dateRangeIso)
					)}: new event`;
					this.setViewData(this.data + newEventString, false);
				}
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

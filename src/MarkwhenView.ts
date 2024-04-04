import {
	TextFileView,
	WorkspaceLeaf,
	EventRef,
	addIcon,
	ViewStateResult,
} from 'obsidian';
import MarkwhenPlugin from './main';
import { MARKWHEN_ICON_NAME } from '../assets/icon';
export const VIEW_TYPE_MARKWHEN = 'markwhen-view';
import { parse, toDateRange, dateRangeToString } from '@markwhen/parser';
import { AppState, MarkwhenState } from '@markwhen/view-client';
import { useColors } from './utils/colorMap';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';

type ViewType = 'timeline' | 'calendar' | 'resume' | 'text';

import { join } from 'path';

export class MarkwhenView extends TextFileView {
	plugin: MarkwhenPlugin;
	vaultListener: EventRef;

	root: HTMLDivElement;
	editorView: EditorView;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
		this.root = this.contentEl.createDiv({
			cls: 'markdown-source-view cm-s-obsidian mod-cm6 is-folding is-live-preview show-properties is-readable-line-width node-insert-event markwhenEditor',
		});
		this.editorView = new EditorView({
			state: this.initialEditorState(),
			parent: this.root,
		});
	}

	getViewData() {
		return this.editorView?.state.sliceDoc();
	}

	initialEditorState(doc: string = '') {
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
		this.editorView.dispatch({
			changes: {
				insert: data,
				from: 0,
				to: this.editorView?.state.sliceDoc().length ?? 0,
			},
		});
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

	clear() {} // preserve to implement class TextFileView

	// setState(state: any, result: ViewStateResult): Promise<void> {
	// 	this.setViewType(state.viewType);
	// 	return super.setState(state, result);
	// }

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
			async (evt) => {
				// if (evt.metaKey) {
				// 	const leaf = this.app.workspace.getLeaf('split');
				// 	await leaf.openFile(this.file!);
				// 	leaf.setViewState({
				// 		type: VIEW_TYPE_MARKWHEN,
				// 		active: true,
				// 		state: {
				// 			viewType: 'calendar',
				// 		},
				// 	});
				// 	leaf.setEphemeralState({
				// 		viewType: 'calendar',
				// 	});
				// 	return;
				// }
				// if (this.viewType === 'calendar') return;
				// this.setViewType('calendar');
			}
		);

		this.addAction(
			'markwhen',
			'Click to view Timeline\n⌘+Click to open to the right',
			(evt) => {
				// if (this.viewType === 'timeline') return;
				// this.setViewType('timeline');
			}
		);

		this.addAction(
			'pen-line',
			'Click to edit text\n⌘+Click to open to the right',
			(evt) => {
				// console.log('event', evt);
			}
		);

		// this.registerDomEvent(window, 'message', async (e) => {
		// 	if (e.source == this.iframe.contentWindow && e.data.request) {
		// 		if (e.data.type === 'newEvent') {
		// 			const newEventString = `\n${dateRangeToString(
		// 				toDateRange(e.data.params.dateRangeIso)
		// 			)}: new event`;
		// 			this.setViewData(this.data + newEventString, false);
		// 		}
		// 	}
		// });
	}

	async onClose() {
		// this.lpc.close();
	}

	// async setViewType(viewType?: ViewType) {
	// 	if (!viewType) {
	// 		return;
	// 	}
	// 	this.viewType = viewType;
	// 	if (this.viewType === 'text') {
	// 		if (!this.editorView) {
	// 			this.editorView = new EditorView({
	// 				state: this.initialEditorState(this.data),
	// 				parent: this.root,
	// 			});
	// 		} else {
	// 			this.editorView.setState(this.initialEditorState(this.data));
	// 		}
	// 	} else {
	// 		this.iframe.src = this.app.vault.adapter.getResourcePath(
	// 			join(
	// 				this.app.vault.configDir,
	// 				'plugins',
	// 				'obsidian-markwhen',
	// 				'assets',
	// 				`${this.viewType}.html`
	// 			)
	// 		);
	// 	}
	// }

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

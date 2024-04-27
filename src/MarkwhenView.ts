import {
	TextFileView,
	WorkspaceLeaf,
	EventRef,
	addIcon,
	ViewStateResult,
	MarkdownView,
} from 'obsidian';
import MarkwhenPlugin from './main';
import { MARKWHEN_ICON_NAME } from '../assets/icon';
export const VIEW_TYPE_MARKWHEN = 'markwhen-view';
import { parse, toDateRange, dateRangeToString } from '@markwhen/parser';
import { AppState, MarkwhenState } from '@markwhen/view-client';
import { useColors } from './utils/colorMap';
import { EditorView, ViewPlugin } from '@codemirror/view';
import { EditorState, StateEffect } from '@codemirror/state';
import { MarkwhenCodemirrorPlugin } from './MarkwhenCodemirrorPlugin';

type ViewType = 'timeline' | 'calendar' | 'resume' | 'text' | 'oneview';

import { join } from 'path';

export class MarkwhenView extends MarkdownView {
	plugin: MarkwhenPlugin;
	vaultListener: EventRef;

	editorView: EditorView;
	viewType!: ViewType;
	views: Partial<{ [vt in ViewType]: HTMLIFrameElement }>;

	constructor(leaf: WorkspaceLeaf, viewType: ViewType = 'text') {
		super(leaf);
		this.viewType = viewType;
		this.views = {};
		for (const view of ['timeline', 'calendar', 'oneview'] as ViewType[]) {
			this.views[view] = this.contentEl.createEl('iframe', {
				attr: {
					style: 'height: 100%; width: 100%',
				},
			});
			this.views[view]?.addClass('mw');
		}
	}

	createIFrameForViewType(
		viewType: ViewType,
		root: HTMLElement
	): HTMLIFrameElement {
		return root.createEl('iframe', {
			attr: {
				style: 'height: 100%; width: 100%',
				src: this.srcForViewType(viewType),
			},
		});
	}

	srcForViewType(vt: ViewType) {
		return this.app.vault.adapter.getResourcePath(
			join(
				this.app.vault.configDir,
				'plugins',
				'obsidian-markwhen',
				'assets',
				`${vt}.html`
			)
		);
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

	async split(viewType: ViewType) {
		const leaf = this.app.workspace.getLeaf('split');
		await leaf.open(new MarkwhenView(leaf, viewType));
		await leaf.openFile(this.file!);
		await leaf.setViewState({
			type: VIEW_TYPE_MARKWHEN,
			active: true,
		});
	}

	async onOpen() {
		if (this.currentMode.cm) {
			this.editorView = this.currentMode.cm;
			this.editorView.dispatch({
				effects: StateEffect.appendConfig.of(
					ViewPlugin.fromClass(MarkwhenCodemirrorPlugin)
				),
			});
		}
		addIcon(
			'markwhen',
			'<path fill="currentColor" d="M 87.175 87.175 H 52.8 C 49.0188 87.175 45.925 84.0813 45.925 80.3 S 49.0188 73.425 52.8 73.425 H 87.175 C 90.9563 73.425 94.05 76.5188 94.05 80.3 S 90.9563 87.175 87.175 87.175 Z M 80.3 59.675 H 32.175 C 28.3938 59.675 25.3 56.5813 25.3 52.8 S 28.3938 45.925 32.175 45.925 H 80.3 C 84.0813 45.925 87.175 49.0188 87.175 52.8 S 84.0813 59.675 80.3 59.675 Z M 18.425 32.175 H 18.425 C 14.6438 32.175 11.55 29.0813 11.55 25.3 S 14.6438 18.425 18.425 18.425 H 32.175 C 35.9563 18.425 39.05 21.5188 39.05 25.3 S 35.9563 32.175 32.175 32.175 Z"></path>'
		);
		addIcon(
			'pen-line',
			'<path d="M 48 80 h 36" stroke="currentColor" stroke-width="8"/><path stroke="currentColor" stroke-width="8" d="M 66 14 a 8.48 8.48 90 0 1 12 12 L 28 76 l -16 4 l 4 -16 Z"/>'
		);
		const action = (viewType: ViewType) => async (evt: MouseEvent) => {
			if (evt.metaKey) {
				await this.split(viewType);
			} else if (this.viewType !== viewType) {
				await this.setViewType(viewType);
			}
		};

		this.addAction(
			'calendar',
			'Click to view calendar\n⌘+Click to open to the right',
			action('calendar')
		);

		this.addAction(
			'markwhen',
			'Click to view timeline\n⌘+Click to open to the right',
			action('timeline')
		);
		this.addAction(
			'oneview',
			'Click to view vertical timeline',
			action('oneview')
		);

		this.addAction(
			'pen-line',
			'Click to edit text\n⌘+Click to open to the right',
			action('text')
		);
		this.setViewType(this.viewType);
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

	async setViewType(viewType?: ViewType) {
		if (!viewType) {
			return;
		}
		this.viewType = viewType;
		if (this.viewType === 'text') {
			for (const vt of ['timeline', 'oneview', 'calendar']) {
				this.views[vt as ViewType]?.removeClass('mw-active');
			}
			for (let i = 0; i < this.contentEl.children.length; i++) {
				const el = this.contentEl.children.item(i);
				if (el?.nodeName === 'IFRAME') {
					el.addClass('mw-hidden');
				} else {
					el?.removeClass('mw-hidden');
				}
			}
		} else {
			for (const vt of ['timeline', 'calendar', 'oneview']) {
				if (vt === viewType) {
					const frame = this.views[viewType];
					if (frame) {
						if (!frame.src) {
							frame.setAttrs({
								src: this.srcForViewType(vt),
							});
						}
						frame.addClass('active');
					}
				} else {
					this.views[vt as ViewType]?.removeClass('active');
				}
			}
			for (let i = 0; i < this.contentEl.children.length; i++) {
				const el = this.contentEl.children.item(i);
				if (el?.nodeName === 'IFRAME' && el.hasClass('active')) {
					el.removeClass('mw-hidden');
				} else {
					el?.addClass('mw-hidden');
				}
			}
		}
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

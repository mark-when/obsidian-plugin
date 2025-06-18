import { WorkspaceLeaf, MarkdownView, TFile, Platform } from 'obsidian';
import MarkwhenPlugin from './main';
import { MARKWHEN_ICON } from './icons';
export const VIEW_TYPE_MARKWHEN = 'markwhen-view';
import { getAppState, getMarkwhenState } from './utils/markwhenState';
import {
	ParseResult,
	get,
	isEvent,
	parse,
	toDateRange,
} from '@markwhen/parser';
import { EditorView, ViewPlugin } from '@codemirror/view';
import { StateEffect } from '@codemirror/state';
import {
	MarkwhenCodemirrorPlugin,
	parseResult,
} from './MarkwhenCodemirrorPlugin';

import { type ViewType, getTemplateURL } from './templates';
import { editEventDateRange } from './utils/dateTextInterpolation';
import { dateRangeToString } from './utils/dateTimeUtilities';

export class MarkwhenView extends MarkdownView {
	readonly plugin: MarkwhenPlugin;
	editorView: EditorView;
	viewType!: ViewType;
	views: Partial<{ [vt in ViewType]: HTMLIFrameElement }>;
	codemirrorPlugin: ViewPlugin<MarkwhenCodemirrorPlugin>;
	updateId = 0;

	constructor(
		leaf: WorkspaceLeaf,
		viewType: ViewType = 'text',
		plugin: MarkwhenPlugin
	) {
		super(leaf);
		this.plugin = plugin;
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
		this.codemirrorPlugin = ViewPlugin.fromClass(MarkwhenCodemirrorPlugin);
	}

	createIFrameForViewType(
		viewType: ViewType,
		root: HTMLElement
	): HTMLIFrameElement {
		return root.createEl('iframe', {
			attr: {
				style: 'height: 100%; width: 100%',
				src: getTemplateURL(viewType),
			},
		});
	}

	getDisplayText() {
		return this.file?.name ?? 'Markwhen';
	}

	getIcon() {
		return MARKWHEN_ICON;
	}

	getViewType() {
		// This implements the TextFileView class provided by Obsidian API
		// Don't get confused with Markwhen visualizations
		return VIEW_TYPE_MARKWHEN;
	}

	async split(viewType: ViewType) {
		const leaf = this.app.workspace.getLeaf('split');
		await leaf.open(new MarkwhenView(leaf, viewType, this.plugin));
		await leaf.openFile(this.file!);
		await leaf.setViewState({
			type: VIEW_TYPE_MARKWHEN,
			active: true,
		});
	}

	updateVisualization(mw: ParseResult) {
		const frame = this.activeFrame();
		if (!frame) {
			return;
		}
		frame.contentWindow?.postMessage(
			{
				type: 'appState',
				request: true,
				id: `markwhen_${this.updateId++}`,
				params: getAppState(mw),
			},
			'*'
		);
		frame.contentWindow?.postMessage(
			{
				type: 'markwhenState',
				request: true,
				id: `markwhen_${this.updateId++}`,
				params: getMarkwhenState(mw, this.data),
			},
			'*'
		);
	}

	registerExtensions() {
		const cm = this.getCodeMirror();
		if (cm) {
			this.editorView = cm;
			const parseListener = EditorView.updateListener.of((update) => {
				update.transactions.forEach((tr) => {
					tr.effects.forEach((effect) => {
						if (effect.is(parseResult)) {
							this.updateVisualization(effect.value);
						}
					});
				});
			});
			this.editorView.dispatch({
				effects: StateEffect.appendConfig.of([
					this.codemirrorPlugin,
					parseListener,
				]),
			});
		}
	}

	async onLoadFile(file: TFile) {
		super.onLoadFile(file);

		// Idk how else to register these extensions - I don't want to
		// register them in the main file because I need the update listener
		// to dispatch updates to visualizations.
		//
		// Meanwhile the extensions aren't
		// registered when I don't use setTimeout. Is there another hook I can use?
		// Other than onLoadFile or onOpen?
		setTimeout(() => {
			this.registerExtensions();
		}, 500);
	}

	async onOpen() {
		super.onOpen();

		const action = (viewType: ViewType) => async (evt: MouseEvent) => {
			if (evt.metaKey || evt.ctrlKey) {
				await this.split(viewType);
			} else if (this.viewType !== viewType) {
				await this.setViewType(viewType);
			}
		};

		this.addAction(
			'calendar',
			`Click to view calendar\n${
				Platform.isMacOS ? '⌘' : 'Ctrl'
			}+Click to open to the right`,
			action('calendar')
		);

		this.addAction(
			MARKWHEN_ICON,
			`Click to view timeline\n${
				Platform.isMacOS ? '⌘' : 'Ctrl'
			}+Click to open to the right`,
			action('timeline')
		);

		this.addAction(
			'oneview',
			`Click to view vertical timeline\n${
				Platform.isMacOS ? '⌘' : 'Ctrl'
			}+Click to open to the right`,
			action('oneview')
		);

		// Hook for resume view

		// this.addAction(
		// 	'file-text',
		// 	`Click to view resume\n${
		// 		Platform.isMacOS ? '⌘' : 'Ctrl'
		// 	}+Click to open to the right`,
		// 	action('resume')
		// );

		this.addAction(
			'pen-line',
			`Click to edit text\n${
				Platform.isMacOS ? '⌘' : 'Ctrl'
			}+Click to open to the right`,
			action('text')
		);

		this.setViewType(this.viewType);
		this.registerDomEvent(window, 'message', async (e) => {
			if (
				e.source == this.activeFrame()?.contentWindow &&
				e.data.request
			) {
				if (e.data.type === 'newEvent') {
					const { dateRangeIso, granularity } = e.data.params;
					const newEventString = `\n${dateRangeToString(
						toDateRange(dateRangeIso),
						granularity
							? granularity === 'instant'
								? 'minute'
								: granularity
							: 'day'
					)}: new event`;
					this.getCodeMirror()?.dispatch({
						changes: {
							from: this.data.length,
							to: this.data.length,
							insert: newEventString,
						},
					});
				} else if (
					e.data.type === 'markwhenState' ||
					e.data.type === 'appState'
				) {
					this.updateVisualization(this.getMw()!);
				} else if (e.data.type === 'editEventDateRange') {
					const events = this.getMw()?.events;
					if (!events) {
						return;
					}
					const { path, range, scale, preferredInterpolationFormat } =
						e.data.params;
					const event = get(events, path);
					if (!event || !isEvent(event)) {
						return;
					}
					const newText = editEventDateRange(
						event,
						toDateRange(range),
						scale,
						preferredInterpolationFormat
					);
					if (newText) {
						this.getCodeMirror()?.dispatch({
							changes: {
								from: event.textRanges.datePart.from,
								to: event.textRanges.datePart.to,
								insert: newText,
							},
						});
					}
				}
			}
		});
	}

	activeFrame() {
		for (let i = 0; i < this.contentEl.children.length; i++) {
			const el = this.contentEl.children.item(i);
			if (el?.nodeName === 'IFRAME' && el.hasClass('active')) {
				return el as HTMLIFrameElement;
			}
		}
	}

	onload() {
		this.plugin.app.workspace.onLayoutReady(() => {
			this.contentEl.addClass('markwhen-view');
		});
		super.onload();
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
			Array.from(this.contentEl.children).forEach((el) => {
				if (el?.nodeName === 'IFRAME') {
					el.addClass('mw-hidden');
				} else {
					el?.removeClass('mw-hidden');
				}
			});
		} else {
			for (const vt of ['timeline', 'calendar', 'oneview']) {
				if (vt === viewType) {
					const frame = this.views[viewType];
					if (frame) {
						if (!frame.src) {
							frame.setAttrs({
								src: getTemplateURL(vt),
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
		this.updateVisualization(this.getMw()!);
	}

	getCodeMirror(): EditorView | undefined {
		// @ts-ignore
		return this.editor.cm;
	}

	getMw(): ParseResult | undefined {
		return (
			this.getCodeMirror()?.plugin(this.codemirrorPlugin)?.markwhen ??
			parse(this.data)
		);
	}

	//Avoid loading Markdown file in Markwhen view (action icons, favicons, etc.)
	canAcceptExtension(extension: string) {
		return extension === 'mw';
	}
}

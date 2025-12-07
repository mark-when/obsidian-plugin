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
import { EventDetailModal } from './EventDetailModal';
import { WysiwygEventModal } from './WysiwygEventModal';

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
		await super.onLoadFile(file);

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

		// Force update visualization when file changes
		// Send multiple updates to ensure the iframe properly receives new state
		this.forceRefreshVisualization(file.name);
	}

	/**
	 * Force refresh the visualization with multiple update attempts
	 * This helps when switching between files to ensure the iframe state is properly reset
	 */
	private forceRefreshVisualization(fileName: string) {
		// First update after content is loaded
		setTimeout(() => {
			const mw = this.getMw();
			if (mw) {
				console.log('[Markwhen] File loaded (update 1):', fileName);
				this.updateVisualization(mw);
			}
		}, 100);

		// Second update after extensions are registered
		setTimeout(() => {
			const mw = this.getMw();
			if (mw) {
				console.log('[Markwhen] File loaded (update 2):', fileName);
				this.updateVisualization(mw);
			}
		}, 600);

		// Third update as a final fallback
		setTimeout(() => {
			const mw = this.getMw();
			if (mw) {
				console.log('[Markwhen] File loaded (update 3):', fileName);
				this.updateVisualization(mw);
			}
		}, 1200);
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
			// Debug: Log ALL messages to find what pencil button sends
			console.log('[Markwhen] ANY message received:', {
				type: e.data?.type,
				request: e.data?.request,
				params: e.data?.params,
				fromActiveFrame: e.source === this.activeFrame()?.contentWindow,
				data: e.data
			});

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
				} else if (e.data.type === 'setDetailPath' || e.data.type === 'showInEditor') {
					// Handle event click (pencil button sends 'showInEditor')
					const path = e.data.params;
					console.log('[Markwhen] Event detail request received:', e.data.type, 'path:', path);

					if (!path) {
						console.log('[Markwhen] No path provided');
						return;
					}

					const events = this.getMw()?.events;
					if (!events) {
						console.log('[Markwhen] No events found');
						return;
					}

					const eventNode = get(events, path) as Node<Event>;
					if (!eventNode || !eventNode.value) {
						console.log('[Markwhen] Event not found at path:', path);
						return;
					}

					console.log('[Markwhen] Opening modal for event:', eventNode.value);
					this.showEventDetailModal(eventNode.value);
				}
			}
		});
	}

	showEventDetailModal(event: Event) {
		const editorMode = this.plugin.settings.editorMode || 'wysiwyg';

		if (editorMode === 'wysiwyg') {
			const modal = new WysiwygEventModal(
				this.app,
				event,
				this.data,
				(newTitle: string, newDescription: string, newDateRange?: string) => {
					this.updateEventTitleDescriptionAndDate(event, newTitle, newDescription, newDateRange);
				}
			);
			modal.open();
		} else {
			const modal = new EventDetailModal(
				this.app,
				event,
				this.data,
				(newDescription: string) => {
					this.updateEventDescription(event, newDescription);
				}
			);
			modal.open();
		}
	}

	/**
	 * Update event with new title, description, and optionally date range
	 */
	updateEventTitleDescriptionAndDate(event: Event, newTitle: string, newDescription: string, newDateRange?: string) {
		const cm = this.getCodeMirror();
		if (!cm) return;

		const eventAny = event as any;
		const dateFrom = eventAny.dateRangeInText?.from ?? 0;
		const dateTo = eventAny.dateRangeInText?.to ?? 0;

		// Find the first line boundaries
		let lineStart = dateFrom;
		while (lineStart > 0 && this.data[lineStart - 1] !== '\n') {
			lineStart--;
		}

		let lineEnd = dateTo;
		while (lineEnd < this.data.length && this.data[lineEnd] !== '\n') {
			lineEnd++;
		}

		const firstLine = this.data.substring(lineStart, lineEnd);

		// Find the colon AFTER the date part ends, not the first colon
		const dateEndInLine = dateTo - lineStart;
		const afterDatePart = firstLine.substring(dateEndInLine);
		const colonInRest = afterDatePart.indexOf(':');

		// Get the original date part (for fallback if no new date provided)
		const originalDatePart = firstLine.substring(0, dateEndInLine);

		// Use new date range if provided, otherwise keep original
		const datePart = newDateRange || originalDatePart;

		let tagsPart = '';
		if (colonInRest !== -1) {
			const afterColon = afterDatePart.substring(colonInRest + 1);
			const tagMatches = afterColon.match(/#\w+/g);
			if (tagMatches) {
				tagsPart = ' ' + tagMatches.join(' ');
			}
		} else {
			const tagMatches = afterDatePart.match(/#\w+/g);
			if (tagMatches) {
				tagsPart = ' ' + tagMatches.join(' ');
			}
		}

		// Find where the event ends
		let eventEnd = lineEnd + 1;
		while (eventEnd < this.data.length) {
			const nextLineEnd = this.data.indexOf('\n', eventEnd);
			const nextLine = nextLineEnd === -1
				? this.data.substring(eventEnd)
				: this.data.substring(eventEnd, nextLineEnd);

			if (this.looksLikeNewEvent(nextLine) || this.looksLikeSection(nextLine)) {
				break;
			}

			eventEnd = nextLineEnd === -1 ? this.data.length : nextLineEnd + 1;
		}

		// Build new event text
		let newFirstLine = `${datePart}: ${newTitle}${tagsPart}`;
		let newEventText = newFirstLine;
		if (newDescription && newDescription.trim()) {
			newEventText += '\n' + newDescription;
		}

		// Replace in editor
		cm.dispatch({
			changes: {
				from: lineStart,
				to: eventEnd,
				insert: newEventText + '\n',
			},
		});
	}

	updateEventTitleAndDescription(event: Event, newTitle: string, newDescription: string) {
		// Delegate to the new method without date change
		this.updateEventTitleDescriptionAndDate(event, newTitle, newDescription);
	}

	updateEventDescription(event: Event, newDescription: string) {
		const cm = this.getCodeMirror();
		if (!cm) return;

		const eventAny = event as any;
		const dateFrom = eventAny.dateRangeInText?.from ?? 0;
		const dateTo = eventAny.dateRangeInText?.to ?? 0;

		// Find the first line (date + title)
		let lineStart = dateFrom;
		while (lineStart > 0 && this.data[lineStart - 1] !== '\n') {
			lineStart--;
		}

		let lineEnd = dateTo;
		while (lineEnd < this.data.length && this.data[lineEnd] !== '\n') {
			lineEnd++;
		}

		const firstLine = this.data.substring(lineStart, lineEnd);

		// Find where the event ends (next event or section)
		let eventEnd = lineEnd + 1;
		while (eventEnd < this.data.length) {
			const nextLineEnd = this.data.indexOf('\n', eventEnd);
			const nextLine = nextLineEnd === -1
				? this.data.substring(eventEnd)
				: this.data.substring(eventEnd, nextLineEnd);

			if (this.looksLikeNewEvent(nextLine) || this.looksLikeSection(nextLine)) {
				break;
			}

			eventEnd = nextLineEnd === -1 ? this.data.length : nextLineEnd + 1;
		}

		// Build new event text
		let newEventText = firstLine;
		if (newDescription && newDescription.trim()) {
			newEventText += '\n' + newDescription;
		}

		// Replace in editor
		cm.dispatch({
			changes: {
				from: lineStart,
				to: eventEnd,
				insert: newEventText + '\n',
			},
		});
	}

	looksLikeNewEvent(line: string): boolean {
		const trimmed = line.trim();
		if (!trimmed) return false;

		const datePatterns = [
			/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/,
			/^\d{1,2}[-/]\d{1,2}[-/]\d{4}/,
			/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i,
			/^now\b/i,
			/^today\b/i,
			/^tomorrow\b/i,
			/^\d+\s+(day|week|month|year)s?\s+(ago|from now)/i,
		];

		return datePatterns.some(pattern => pattern.test(trimmed));
	}

	looksLikeSection(line: string): boolean {
		return line.trim().toLowerCase().startsWith('section ');
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

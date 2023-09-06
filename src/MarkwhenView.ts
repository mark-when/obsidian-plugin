// Obsidian
import { TextFileView, WorkspaceLeaf, EventRef, normalizePath } from 'obsidian';
import { MARKWHEN_ICON_NAME } from './icon';
export const VIEW_TYPE_MARKWHEN = 'markwhen-view';

// Markwhen
import { parse } from '@markwhen/parser';
import { Timelines } from '@markwhen/parser/lib/Types';
type ViewType = 'timeline' | 'calendar' | 'resume' | 'json';
import timelineTemplate from '@markwhen/timeline/dist/index.html';
import calendarTemplate from '@markwhen/calendar/dist/index.html';
import resumeTemplate from '@markwhen/resume/dist/index.html';

// Dev-dep
import { parse as parseHtml } from 'node-html-parser';

import MarkwhenPlugin from './main';
import { join } from 'path';

export class MarkwhenView extends TextFileView {
	inputFileName: string;
	outputType: ViewType;
	serving: boolean;
	plugin: MarkwhenPlugin;
	iframe: HTMLIFrameElement;
	vaultListener: EventRef;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);

		// default for development, will provide config/UI
		this.inputFileName = this.file?.name ?? '';
		this.outputType = 'timeline'; // infer or assign
		this.serving = true;
		this.iframe = this.contentEl.createEl('iframe');
	}

	getViewData() {
		return this.data;
	}

	setViewData(data: string, _clear: boolean): void {
		this.data = data;

		if (_clear) {
			const { parsed, rawText } = getParseFromFile(this.data);

			this.iframe.src = this.app.vault.adapter.getResourcePath(
				join(
					this.app.vault.configDir,
					'plugins',
					'markwhen',
					'assets',
					'timeline.html'
				)
			);
			this.iframe.height = '100%';
			this.iframe.width = '100%';

			this.iframe?.addEventListener('message', (e) => {
				console.log(e);
			});
			setTimeout(() => {
				this.iframe.contentWindow?.postMessage(
					{
						type: 'markwhenState',
						request: true,
						id: 'markwhen_1234',
						params: {
							rawText,
							parsed: parsed.timelines,
							transformed: parsed.timelines[0].events,
						},
					},
					'*'
				);
				this.iframe.contentWindow?.postMessage(
					{
						type: 'appState',
						request: true,
						id: 'markwhen_1235',
						params: {
							isDark: true,
							colorMap: {},
						},
					},
					'*'
				);
			}, 1000);
			// will generate file with bug
			this.app.vault.adapter.write(
				normalizePath(`./${this.outputType}.html`),
				getInitialHtml(parsed, rawText, this.outputType)
			);
		}
	}

	getDisplayText() {
		return this.file?.name ?? 'Markwhen';
	}

	clear() {} // preserve

	getIcon() {
		return MARKWHEN_ICON_NAME;
	}

	getViewType() {
		return VIEW_TYPE_MARKWHEN;
	}

	// useful hooks: setViewData(), onOpen(), onClose(), onLoad & onUnload, constructor
	// remember to clear when setViewData(data, _clear =  true)

	async onOpen() {}

	async onClose() {}
}

const getParseFromFile = (content: string) => {
	// put this.data into this
	// provide an inline version
	const parsed = parse(content);
	return { parsed, rawText: content };
};

const injectScript = (domString: string, jsToInject: string) => {
	const html = parseHtml(domString);
	const script = `<script>${jsToInject}</script>`;
	const head = html.getElementsByTagName('head')[0];
	head.innerHTML = script + head.innerHTML;
	return html.toString();
};

const templateHtml = (viewType: Exclude<ViewType, 'json'>) => {
	switch (viewType) {
		case 'timeline':
			return timelineTemplate;
		case 'calendar':
			return calendarTemplate;
		case 'resume':
			return resumeTemplate;
		default:
			return timelineTemplate;
	}
};

const appState = (parsed: Timelines, rawText: string) => ({
	app: {
		isDark: false,
	},
	markwhen: {
		rawText,
		parsed: parsed.timelines,
		transformed: parsed.timelines[0].events,
	},
});

const getInitialHtml = (
	parsed: Timelines,
	rawText: string,
	viewType: ViewType
) => {
	if (viewType === 'json') {
		return JSON.stringify(parsed);
	}

	return injectScript(
		templateHtml(viewType),
		`var __markwhen_initial_state = ${JSON.stringify(
			appState(parsed, rawText)
		)}`
	);
};

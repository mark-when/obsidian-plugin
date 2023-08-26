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
import express from 'express';
import { Server } from 'http';
import { WebSocketServer } from 'ws';
import { parse as parseHtml } from 'node-html-parser';

import MarkwhenPlugin from './main';

export class MarkwhenView extends TextFileView {
	inputFileName: string;
	outputType: ViewType;
	serving: boolean;
	port: number;
	wsPort: number;
	plugin: MarkwhenPlugin;
	wss: WebSocketServer;
	expressApp: express.Application;
	server: Server;
	iframe: HTMLIFrameElement;
	vaultListener: EventRef;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);

		// default for development, will provide config/UI
		this.inputFileName = this.file?.name ?? '';
		this.outputType = 'timeline'; // infer or assign
		this.serving = true;
		this.port = 3000;
		this.wsPort = 3001;

		this.iframe = this.contentEl.createEl('iframe');
	}

	getViewData() {
		return this.data;
	}

	setViewData(data: string, _clear: boolean): void {
		this.data = data;

		if (_clear) {
			const { parsed, rawText } = getParseFromFile(this.data);

			this.wss?.close();
			this.wss = new WebSocketServer({ port: this.wsPort });
			this.wss.on('connection', (ws) => {
				this.vaultListener = this.app.vault.on('modify', (file) => {
					if (file.name == this.file?.name) {
						console.log('Updating...');
						const { parsed, rawText } = getParseFromFile(this.data);
						ws.send(
							JSON.stringify({
								type: 'state',
								request: true,
								id: `markwhen_1234`,
								params: appState(parsed, rawText),
							})
						);
					}
				});
			});

			this.server?.close();
			this.expressApp = express();
			this.expressApp.get('/', (req, res) => {
				const html = injectScript(
					templateHtml(this.outputType as Exclude<ViewType, 'json'>),
					`var __markwhen_wss_url = "ws://localhost:${this.wsPort}";
				var __markwhen_initial_state = ${JSON.stringify(appState(parsed, rawText))}`
				);
				console.log(parsed);
				res.status(200).send(html);
			});

			this.server = this.expressApp.listen(this.port);
			console.log(`Server running at http://localhost:${this.port}`);

			this.iframe.src = `http://localhost:${this.port}`;
			this.iframe.height = '100%';
			this.iframe.width = '100%';

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

	async onClose() {
		// disconnect
		this.server.close();
		this.wss.close();
	}
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

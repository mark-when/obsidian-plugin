// Obsidian
import { TextFileView, WorkspaceLeaf, EventRef } from 'obsidian';
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
		this.outputType = 'calendar'; // infer or assign
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
						console.log(rawText);
						ws.send(
							JSON.stringify({
								type: 'state',
								request: true,
								id: `markwhen_1234`,
								params: appState(parsed, rawText),
							})
						);
						console.log('sent');
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

function getParseFromFile(content: string) {
	// put this.data into this
	// provide an inline version
	const parsed = parse(content);
	return { parsed, rawText: content };
}

function injectScript(domString: string, jsToInject: string) {
	const html = parseHtml(domString);
	const script = `<script>${jsToInject}</script>`;
	const head = html.getElementsByTagName('head')[0];
	head.innerHTML = script + head.innerHTML;
	return html.toString();
}

function templateHtml(viewType: Exclude<ViewType, 'json'>) {
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
}

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

function getInitialHtml(
	parsed: Timelines,
	rawText: string,
	viewType: ViewType
) {
	if (viewType === 'json') {
		return JSON.stringify(parsed);
	}

	return injectScript(
		templateHtml(viewType),
		`var __markwhen_initial_state = ${JSON.stringify(
			appState(parsed, rawText)
		)}`
	);
}

// 尝试一下导出本地包，然后配置

// 挂到端口上，然后使用   iframe 连接
// https://github.com/MSzturc/obsidian-advanced-slides/blob/f2fc58abd0b05723c11c0bd7a8cd8293fcffd5f7/src/revealServer.ts#L29
// https://github.com/Pamela-Wang/Obsidian-Starter-Vaults/blob/555fb26656f708cb472ed6b0c9916818ee60053f/Potato%20Vault/.obsidian/plugins/obsidian-calibre-plugin/main.js#L94

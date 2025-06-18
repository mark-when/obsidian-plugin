import type { EditorView, PluginValue, ViewUpdate } from '@codemirror/view';
import { ParseResult, Timeline, emptyTimeline } from '@markwhen/parser';
import parseWorker from './markwhenWorker?worker&inline';
import { StateEffect } from '@codemirror/state';

export const useParserWorker = (parsed: (mw: ParseResult) => void) => {
	let running = false;
	let parsingString = '';
	let queuedString = '';
	const worker = new parseWorker();

	worker.onmessage = (message: MessageEvent<any>) => {
		const { timelines: fromWorker, error } = message.data;
		if (!error) {
			parsed(fromWorker);
		} else {
			console.log(error);
		}
		if (queuedString !== parsingString) {
			parsingString = queuedString;
			worker.postMessage({ rawTimelineString: queuedString });
		} else {
			running = false;
		}
	};

	return (s: string) => {
		queuedString = s;
		if (!running) {
			running = true;
			parsingString = s;
			worker.postMessage({ rawTimelineString: s });
		} else {
			console.info('Would post but running');
		}
	};
};

export const parseResult = StateEffect.define<ParseResult>();

export class MarkwhenCodemirrorPlugin implements PluginValue {
	markwhen: ParseResult = emptyTimeline() as ParseResult;
	view: EditorView;
	worker = useParserWorker((mw) => {
		this.markwhen = mw;
		this.view.dispatch({
			effects: parseResult.of(mw),
		});
	});

	constructor(view: EditorView) {
		this.view = view;
		this.worker(view.state.doc.sliceString(0));
	}

	update(update: ViewUpdate): void {
		if (update.docChanged) {
			this.worker(update.state.sliceDoc());
		}
	}
}

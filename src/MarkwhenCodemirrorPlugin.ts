import type { EditorView, PluginValue, ViewUpdate } from '@codemirror/view';
import { Timeline, emptyTimeline } from '@markwhen/parser';
import parseWorker from './markwhenWorker?worker&inline';
import { StateEffect } from '@codemirror/state';

export const useParserWorker = (parsed: (mw: Timeline) => void) => {
	let running = false;
	let parsingString = '';
	let queuedString = '';
	const worker = new parseWorker();

	worker.onmessage = (message: MessageEvent<any>) => {
		const { timelines: fromWorker } = message.data;
		parsed(fromWorker[0]);
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

export const parseResult = StateEffect.define<Timeline>();

export class MarkwhenCodemirrorPlugin implements PluginValue {
	markwhen = emptyTimeline();
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

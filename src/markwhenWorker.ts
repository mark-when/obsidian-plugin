import { parse, Caches } from '@markwhen/parser';

const cache = new Caches();
addEventListener('message', (message) => {
	try {
		postMessage(parse(message.data.rawTimelineString, cache));
	} catch (e) {
		postMessage({ error: e });
	}
});

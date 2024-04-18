import { parse, Caches } from '@markwhen/parser';

const cache = new Caches();
addEventListener('message', (message) => {
	postMessage(parse(message.data.rawTimelineString, cache));
});

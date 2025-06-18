import { ParseResult, Timeline } from '@markwhen/parser';
import { MarkwhenState, AppState } from '@markwhen/view-client';
import { useColors } from './colorMap';

export function getMarkwhenState(
	mw: ParseResult,
	rawText: string
): MarkwhenState | undefined {
	return {
		rawText,
		parsed: mw,
		transformed: mw.events,
	};
}

export function getAppState(mw: Timeline): AppState {
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
		colorMap: mw ? useColors(mw) ?? {} : {},
	};
}

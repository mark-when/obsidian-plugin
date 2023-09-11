import { COLORS, HUMAN_COLORS, hexToRgb } from './colorUtils';

export type ColorMap = Record<string, Record<string, string>>;

const colorMapAndRangesFromMarkwhen = (timeline: any, colorIndex: number) => {
	const map = {} as Record<string, string>;
	const ranges = timeline.ranges.flatMap((r: any) => {
		if (r.type !== 'tag') {
			return [];
		}
		if (map[r.content.tag]) {
			r.content.color = map[r.content.tag];
			return [r];
		}
		const headerDefinition =
			r.content?.tag && timeline.header[')' + r.content.tag];
		let tagColorDefintion: string | undefined;
		tagColorDefintion =
			!!headerDefinition &&
			((typeof headerDefinition === 'string' && headerDefinition) ||
				(typeof headerDefinition === 'object' &&
					headerDefinition.color));
		if (tagColorDefintion) {
			const humanColorIndex = HUMAN_COLORS.indexOf(tagColorDefintion);
			if (humanColorIndex === -1) {
				const rgb = hexToRgb(tagColorDefintion);
				if (rgb) {
					r.content.color = rgb;
				} else {
					r.content.color = COLORS[colorIndex++ % COLORS.length];
				}
			} else {
				r.content.color = COLORS[humanColorIndex];
			}
		} else {
			r.content.color = COLORS[colorIndex++ % COLORS.length];
		}
		map[r.content.tag] = r.content.color;
		return [r];
	});
	return [map, ranges, colorIndex] as const;
};

export const useColors = (markwhen: any) => {
	let colorIndex = 0;
	const colorMap = {} as ColorMap;
	for (const [path, timeline] of [['default', markwhen]] as [string, any][]) {
		const [map, ranges, index] = colorMapAndRangesFromMarkwhen(
			timeline,
			colorIndex
		);
		colorMap[path] = map;
		colorIndex = index;
	}
	return colorMap;
};

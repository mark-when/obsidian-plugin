import {
	DateFormat,
	DateRange,
	Event,
	RELATIVE_TIME_REGEX,
	RelativeDate,
	toDateRange,
} from '@markwhen/parser';
import { Duration, DurationLikeObject, Interval } from 'luxon';
import {
	dateRangeToString,
	dateTimeToString,
	DisplayScale,
} from './dateTimeUtilities';

const equivalentRanges = (r1: DateRange, r2: DateRange) =>
	+r1.fromDateTime === +r2.fromDateTime && +r1.toDateTime === +r2.toDateTime;

const relativeTimeRegexGlobal = new RegExp(
	`${RELATIVE_TIME_REGEX.source}`,
	'g'
);

const getRelativeTimeMatches = (s: string) => {
	const relativeMatches: RegExpMatchArray[] = [];
	for (const match of s.matchAll(relativeTimeRegexGlobal) || []) {
		if (match[0].trim()) {
			relativeMatches.push(match);
		}
	}
	return relativeMatches;
};

const roundToMinutes = (d: Duration) => {
	const minutes = d.as('minutes');
	if (minutes % 1) {
		// try to round by 5 if that's what we're going for
		const lastDigit = Math.round(minutes % 10);
		let roundedMinutes: number;
		if (lastDigit === 4) {
			roundedMinutes = Math.ceil(minutes);
		} else if (lastDigit === 5 || lastDigit === 6) {
			roundedMinutes = Math.floor(minutes);
		} else {
			roundedMinutes = Math.round(minutes / 10) * 10;
		}
		return d.set({
			milliseconds: 0,
			seconds: 0,
			minutes: roundedMinutes,
		});
	}
	return d;
};

const toHuman = (d: Duration) => {
	const rescaled = roundToMinutes(d).rescale();
	return rescaled.toHuman();
};

const rangeStringFromDiff = (
	originalRange: DateRange,
	newRange: DateRange,
	originalDiffString: string
) => {
	const originalReferenceDate = originalRange.fromDateTime.minus(
		RelativeDate.diffFromString(originalDiffString)
	);
	const newFromDiff = toHuman(
		newRange.fromDateTime.diff(originalReferenceDate)
	);

	const newToDiff = toHuman(newRange.toDateTime.diff(newRange.fromDateTime));

	// checking if these start with a minus is our way of making sure
	// they aren't negative
	if (
		newFromDiff &&
		newToDiff &&
		!newFromDiff.startsWith('-') &&
		!newToDiff.startsWith('-')
	) {
		return `${newFromDiff} - ${newToDiff}`;
	} else if (newFromDiff && !newFromDiff.startsWith('-')) {
		return newFromDiff;
	} else if (newToDiff && !newToDiff.startsWith('-')) {
		return newToDiff;
	}
};

function editRelativeEventDateRange(
	event: Event,
	range: DateRange,
	scale: DisplayScale,
	preferredInterpolationFormat: DateFormat | undefined,
	originalRange: DateRange
): string | undefined {
	const dateText = event.firstLine.datePart || '';
	const relativeMatches = getRelativeTimeMatches(dateText);
	if (!relativeMatches.length) {
		return;
	}
	if (relativeMatches.length > 2) {
		console.warn("We shouldn't have more than 2 relative matches");
	}

	const movingFrom = +originalRange.fromDateTime !== +range.fromDateTime;
	const movingTo = +originalRange !== +range.toDateTime;

	const indexOfFirst = dateText.indexOf(relativeMatches[0][0]);
	const indexOfSecond = dateText.indexOf(relativeMatches[1]?.[0]);
	const fromRelative = indexOfFirst === 0 ? relativeMatches[0] : undefined;
	const toRelative =
		indexOfFirst > 0
			? relativeMatches[0]
			: indexOfSecond > 0
			? relativeMatches[1]
			: undefined;

	if (movingFrom && movingTo) {
		if (fromRelative && toRelative) {
			const newRangeString = rangeStringFromDiff(
				originalRange,
				range,
				relativeMatches[0][0]
			);
			if (newRangeString) {
				return newRangeString;
			}
		} else if (fromRelative) {
			if (fromRelative![0] === event.firstLine.datePart) {
				const originalReferenceDate = originalRange.fromDateTime;

				const newFromDiff = toHuman(
					range.fromDateTime.diff(originalReferenceDate)
				);

				const newToDiff = toHuman(
					range.toDateTime.diff(range.fromDateTime)
				);

				if (newFromDiff && newToDiff) {
					return `${newFromDiff} - ${newToDiff}`;
				} else if (newFromDiff) {
					return newFromDiff;
				} else if (newToDiff) {
					return newToDiff;
				}
			}
		} else if (toRelative) {
			const interval = Interval.fromDateTimes(
				range.fromDateTime,
				range.toDateTime
			);

			let bestDiff;
			const durationKeys = [
				'years',
				'months',
				'weeks',
				'days',
				'hours',
				'minutes',
			] as (keyof DurationLikeObject)[];
			for (const durKey of durationKeys) {
				const possibleDiff = interval.toDuration(durKey);
				const amount = possibleDiff.as(durKey);
				if (amount > 0 && amount % 1 === 0) {
					bestDiff = possibleDiff;
					break;
				}
			}
			bestDiff = bestDiff ?? range.toDateTime.diff(range.fromDateTime);
			const newToDiff = toHuman(bestDiff);

			if (newToDiff && !newToDiff.startsWith('-')) {
				const newFrom = dateTimeToString(
					range.fromDateTime,
					scale,
					true,
					preferredInterpolationFormat
				);
				// Generally speaking if the date has slashes we delimit the range with a dash,
				// and if a date has dashes we delimit the range with a slash. Yes, this could be more robust
				// but I'd rather get it out the door
				const separator = newFrom?.includes('/') ? '-' : '/';
				return `${newFrom} ${separator} ${newToDiff}`;
			}
		}
	} else if (movingFrom) {
		if (fromRelative && toRelative) {
			const newRangeString = rangeStringFromDiff(
				originalRange,
				range,
				relativeMatches[0][0]
			);
			if (newRangeString) {
				return newRangeString;
			}
		} else if (fromRelative) {
			const newRangeString = rangeStringFromDiff(
				originalRange,
				range,
				relativeMatches[0][0]
			);
			if (newRangeString) {
				return newRangeString;
			}
		} else if (toRelative) {
			console.log('unimplemented');
		}
	} else if (movingTo) {
		if (fromRelative && toRelative) {
			const newRangeString = rangeStringFromDiff(
				originalRange,
				range,
				relativeMatches[0][0]
			);
			if (newRangeString) {
				return newRangeString;
			}
		} else if (fromRelative) {
			if (fromRelative![0] === event.firstLine.datePart) {
				const originalReferenceDate = originalRange.fromDateTime;

				const newFromDiff = toHuman(
					range.fromDateTime.diff(originalReferenceDate)
				);

				const newToDiff = toHuman(
					range.toDateTime.diff(range.fromDateTime)
				);

				if (newFromDiff && newToDiff) {
					return `${newFromDiff} - ${newToDiff}`;
				} else if (newFromDiff) {
					return newFromDiff;
				} else if (newToDiff) {
					return newToDiff;
				}
			}
		} else if (toRelative) {
			const interval = Interval.fromDateTimes(
				range.fromDateTime,
				range.toDateTime
			);

			let bestDiff;
			const durationKeys = [
				'years',
				'months',
				'weeks',
				'days',
				'hours',
				'minutes',
			] as (keyof DurationLikeObject)[];
			for (const durKey of durationKeys) {
				const possibleDiff = interval.toDuration(durKey);
				const amount = possibleDiff.as(durKey);
				if (amount > 0 && amount % 1 === 0) {
					bestDiff = possibleDiff;
					break;
				}
			}
			bestDiff = bestDiff ?? range.toDateTime.diff(range.fromDateTime);
			const newToDiff = toHuman(bestDiff);

			if (newToDiff && !newToDiff.startsWith('-')) {
				const originalText = event.firstLine.datePart!;
				const index = originalText.indexOf(toRelative[0]);
				const originalFrom = event.firstLine.datePart!.substring(
					0,
					index
				);
				// Generally speaking if the date has slashes we delimit the range with a dash,
				// and if a date has dashes we delimit the range with a slash. Yes, this could be more robust
				// but I'd rather get it out the door
				return `${originalFrom} ${newToDiff}`;
			}
		}
	}
}

export function editEventDateRange(
	event: Event,
	range: DateRange,
	scale: DisplayScale,
	preferredInterpolationFormat: DateFormat | undefined
): string | undefined {
	const originalRange = toDateRange(event.dateRangeIso);
	if (equivalentRanges(originalRange, range)) {
		return;
	}

	return (
		editRelativeEventDateRange(
			event,
			range,
			scale,
			preferredInterpolationFormat,
			originalRange
		) || dateRangeToString(range, scale, preferredInterpolationFormat)
	);
}

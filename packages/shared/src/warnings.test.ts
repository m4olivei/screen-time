import { describe, expect, it } from 'vitest';
import {
	computeDueWarnings,
	describeWarning,
	WARNING_GRACE_MS,
	WARNING_THRESHOLDS_MINUTES
} from './warnings.js';

/** Reference cutoff; every `now` below is expressed as an offset from it. */
const CUTOFF = new Date('2026-08-05T20:00:00.000Z');

const MINUTE_MS = 60 * 1000;

/** `now` at `minutes` (and optional `seconds`) before the cutoff. */
function remaining(minutes: number, seconds = 0): Date {
	return new Date(CUTOFF.getTime() - minutes * MINUTE_MS - seconds * 1000);
}

describe('warning thresholds', () => {
	it('are the agreed ladder, longest first', () => {
		expect(WARNING_THRESHOLDS_MINUTES).toEqual([30, 15, 10, 5, 2, 1]);
	});

	it('defaults the grace period to 60 seconds', () => {
		expect(WARNING_GRACE_MS).toBe(60_000);
	});
});

describe('describeWarning', () => {
	it('pluralises multi-minute thresholds and shows for 15 seconds', () => {
		expect(describeWarning(15)).toEqual({
			title: 'Screen time',
			message: 'Internet turns off in 15 minutes',
			durationSeconds: 15
		});
	});

	it('uses the singular and a full minute of display at one minute', () => {
		expect(describeWarning(1)).toEqual({
			title: 'Screen time',
			message: 'Internet turns off in 1 minute',
			durationSeconds: 60
		});
	});

	it('titles every threshold the same', () => {
		for (const threshold of WARNING_THRESHOLDS_MINUTES) {
			expect(describeWarning(threshold).title).toBe('Screen time');
		}
	});
});

describe('computeDueWarnings', () => {
	it('ignores thresholds whose due moment is still in the future', () => {
		const result = computeDueWarnings({
			now: remaining(31),
			cutoff: CUTOFF,
			handledThresholds: []
		});
		expect(result).toEqual({ send: null, handle: [] });
	});

	it('sends a threshold that has just come due and reports it as handled', () => {
		const result = computeDueWarnings({
			now: remaining(15),
			cutoff: CUTOFF,
			handledThresholds: [30]
		});
		expect(result).toEqual({ send: 15, handle: [15] });
	});

	it('treats a threshold due exactly graceMs ago as still fresh', () => {
		const result = computeDueWarnings({
			now: remaining(14),
			cutoff: CUTOFF,
			handledThresholds: [30]
		});
		expect(result).toEqual({ send: 15, handle: [15] });
	});

	it('suppresses a threshold that came due longer ago than graceMs', () => {
		const result = computeDueWarnings({
			now: remaining(13, 59),
			cutoff: CUTOFF,
			handledThresholds: [30]
		});
		expect(result).toEqual({ send: null, handle: [15] });
	});

	it('sends only the smallest of several simultaneously fresh thresholds', () => {
		const result = computeDueWarnings({
			now: remaining(5),
			cutoff: CUTOFF,
			handledThresholds: [30, 15],
			graceMs: 6 * MINUTE_MS
		});
		expect(result).toEqual({ send: 5, handle: [10, 5] });
	});

	it('never returns a threshold that is already handled', () => {
		const result = computeDueWarnings({
			now: remaining(1),
			cutoff: CUTOFF,
			handledThresholds: [30, 15, 10, 5, 2, 1]
		});
		expect(result).toEqual({ send: null, handle: [] });
	});

	it('handles the backlog silently when the worker restarts near the cutoff', () => {
		// Worker comes back up with just under 4 minutes left and no record of
		// any warning: 30/15/10/5 are all long overdue, so none of them fires.
		const restart = computeDueWarnings({
			now: remaining(3, 55),
			cutoff: CUTOFF,
			handledThresholds: []
		});
		expect(restart).toEqual({ send: null, handle: [30, 15, 10, 5] });

		// Once 2 minutes comes due it is the only candidate, and it fires.
		const twoMinutes = computeDueWarnings({
			now: remaining(2),
			cutoff: CUTOFF,
			handledThresholds: restart.handle
		});
		expect(twoMinutes).toEqual({ send: 2, handle: [2] });
	});
});

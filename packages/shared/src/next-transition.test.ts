// Prove independence from the process/system timezone: everything below
// evaluates America/Toronto wall-clock time while the test process runs in UTC.
process.env.TZ = 'UTC';

import { describe, expect, it } from 'vitest';
import type { ScheduleWindow } from './db/entities/ScheduleWindow.js';
import type { Override, OverrideType } from './db/entities/Override.js';
import { computeDesiredState } from './desired-state.js';
import { computeExtendAnchor, computeNextTransition } from './next-transition.js';

const TZ = 'America/Toronto';

let nextId = 1;

function win(dayOfWeek: number, startMinute: number, endMinute: number): ScheduleWindow {
	return { id: nextId++, profileId: 1, dayOfWeek, startMinute, endMinute } as ScheduleWindow;
}

function ov(type: OverrideType, effectiveUntil: string | Date, createdAt: string | Date): Override {
	return {
		id: nextId++,
		profileId: 1,
		type,
		effectiveUntil: new Date(effectiveUntil),
		createdAt: new Date(createdAt)
	} as Override;
}

/** Reference window: Wednesday 16:00–20:00 America/Toronto (EDT, UTC-4 in August). */
const wedWindow = win(3, 960, 1200);

const insideWindow = '2026-08-05T18:00:00-04:00'; // Wed 18:00
const beforeWindow = '2026-08-05T10:00:00-04:00'; // Wed 10:00
const afterWindow = '2026-08-05T21:00:00-04:00'; // Wed 21:00

function at(iso: string): Date {
	return new Date(iso);
}

describe('computeNextTransition: schedule windows only', () => {
	it('ON inside a window transitions at the window end', () => {
		const result = computeNextTransition({
			now: at(insideWindow),
			timeZone: TZ,
			windows: [wedWindow],
			overrides: []
		});
		expect(result?.toISOString()).toBe(at('2026-08-05T20:00:00-04:00').toISOString());
	});

	it('OFF before a window transitions at the window start', () => {
		const result = computeNextTransition({
			now: at(beforeWindow),
			timeZone: TZ,
			windows: [wedWindow],
			overrides: []
		});
		expect(result?.toISOString()).toBe(at('2026-08-05T16:00:00-04:00').toISOString());
	});

	it('OFF after the window wraps to the same window next week', () => {
		const result = computeNextTransition({
			now: at(afterWindow),
			timeZone: TZ,
			windows: [wedWindow],
			overrides: []
		});
		expect(result?.toISOString()).toBe(at('2026-08-12T16:00:00-04:00').toISOString());
	});

	it('a window ending at minute 1440 transitions at local midnight', () => {
		const lateWindow = win(3, 1380, 1440); // Wed 23:00–24:00
		const result = computeNextTransition({
			now: at('2026-08-05T23:30:00-04:00'),
			timeZone: TZ,
			windows: [lateWindow],
			overrides: []
		});
		expect(result?.toISOString()).toBe(at('2026-08-06T00:00:00-04:00').toISOString());
	});

	it('no windows and no overrides has no known transition (null)', () => {
		const result = computeNextTransition({
			now: at(insideWindow),
			timeZone: TZ,
			windows: [],
			overrides: []
		});
		expect(result).toBeNull();
	});
});

describe('computeNextTransition: overrides', () => {
	it('active extend past the window end transitions at effectiveUntil', () => {
		const result = computeNextTransition({
			now: at(afterWindow),
			timeZone: TZ,
			windows: [wedWindow],
			overrides: [ov('extend', '2026-08-05T22:00:00-04:00', insideWindow)]
		});
		expect(result?.toISOString()).toBe(at('2026-08-05T22:00:00-04:00').toISOString());
	});

	it('extend that outlives the window masks the window end (transition at effectiveUntil)', () => {
		const result = computeNextTransition({
			now: at(insideWindow),
			timeZone: TZ,
			windows: [wedWindow],
			overrides: [ov('extend', '2026-08-05T21:30:00-04:00', insideWindow)]
		});
		expect(result?.toISOString()).toBe(at('2026-08-05T21:30:00-04:00').toISOString());
	});

	it('block_now ending before the window end transitions back to ON at effectiveUntil', () => {
		const result = computeNextTransition({
			now: at(insideWindow),
			timeZone: TZ,
			windows: [wedWindow],
			overrides: [ov('block_now', '2026-08-05T19:00:00-04:00', insideWindow)]
		});
		expect(result?.toISOString()).toBe(at('2026-08-05T19:00:00-04:00').toISOString());
	});

	it('block_now outliving the window yields no transition until next week window start', () => {
		// OFF now (blocked); at the window end still OFF; at override end the
		// schedule is already OFF — so the next real change is next Wednesday 16:00.
		const result = computeNextTransition({
			now: at(insideWindow),
			timeZone: TZ,
			windows: [wedWindow],
			overrides: [ov('block_now', '2026-08-05T21:00:00-04:00', insideWindow)]
		});
		expect(result?.toISOString()).toBe(at('2026-08-12T16:00:00-04:00').toISOString());
	});

	it('allow_now outside every window transitions at effectiveUntil', () => {
		const result = computeNextTransition({
			now: at(afterWindow),
			timeZone: TZ,
			windows: [wedWindow],
			overrides: [ov('allow_now', '2026-08-05T22:30:00-04:00', afterWindow)]
		});
		expect(result?.toISOString()).toBe(at('2026-08-05T22:30:00-04:00').toISOString());
	});

	it('override ending beyond the 7-day horizon with no windows returns null', () => {
		const result = computeNextTransition({
			now: at(afterWindow),
			timeZone: TZ,
			windows: [],
			overrides: [ov('allow_now', '2026-08-15T22:00:00-04:00', afterWindow)]
		});
		expect(result).toBeNull();
	});

	it('agrees with computeDesiredState: state at the returned instant differs from now', () => {
		const input = {
			now: at(insideWindow),
			timeZone: TZ,
			windows: [wedWindow],
			overrides: [ov('block_now', '2026-08-05T19:00:00-04:00', insideWindow)]
		};
		const transition = computeNextTransition(input);
		expect(transition).not.toBeNull();
		expect(computeDesiredState({ ...input, now: transition! })).not.toBe(
			computeDesiredState(input)
		);
	});
});

describe('computeExtendAnchor', () => {
	it('ON inside a window anchors at the window end (current cutoff)', () => {
		const anchor = computeExtendAnchor({
			now: at(insideWindow),
			timeZone: TZ,
			windows: [wedWindow],
			overrides: []
		});
		expect(anchor.toISOString()).toBe(at('2026-08-05T20:00:00-04:00').toISOString());
	});

	it('OFF anchors at now', () => {
		const anchor = computeExtendAnchor({
			now: at(afterWindow),
			timeZone: TZ,
			windows: [wedWindow],
			overrides: []
		});
		expect(anchor.toISOString()).toBe(at(afterWindow).toISOString());
	});

	it('ON via allow_now anchors at the override end', () => {
		const anchor = computeExtendAnchor({
			now: at(afterWindow),
			timeZone: TZ,
			windows: [wedWindow],
			overrides: [ov('allow_now', '2026-08-05T22:30:00-04:00', afterWindow)]
		});
		expect(anchor.toISOString()).toBe(at('2026-08-05T22:30:00-04:00').toISOString());
	});
});

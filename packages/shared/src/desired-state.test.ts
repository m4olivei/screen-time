// Prove independence from the process/system timezone: everything below
// evaluates America/Toronto wall-clock time while the test process runs in UTC.
process.env.TZ = 'UTC';

import { describe, expect, it } from 'vitest';
import type { ScheduleWindow } from './db/entities/ScheduleWindow.js';
import type { Override, OverrideType } from './db/entities/Override.js';
import { computeDesiredState } from './desired-state.js';

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

/**
 * Reference week (America/Toronto, EDT, UTC-4):
 * - Wednesday 2026-08-05 has an allowed window 16:00–20:00 → [960, 1200).
 * - Friday 2026-08-07 23:00–24:00 and Saturday 2026-08-08 00:00–02:00 model a
 *   single "window spanning midnight" as two rows.
 */
const wedWindow = win(3, 960, 1200);
const friLate = win(5, 1380, 1440);
const satEarly = win(6, 0, 120);

describe('computeDesiredState: schedule windows', () => {
	const cases: Array<{
		name: string;
		now: string;
		windows: ScheduleWindow[];
		expected: 'ON' | 'OFF';
	}> = [
		{
			name: 'inside a window is ON',
			now: '2026-08-05T18:00:00-04:00', // Wed 18:00 Toronto
			windows: [wedWindow],
			expected: 'ON'
		},
		{
			name: 'outside every window is OFF',
			now: '2026-08-05T21:00:00-04:00', // Wed 21:00 Toronto
			windows: [wedWindow],
			expected: 'OFF'
		},
		{
			name: 'exact start minute is ON (start inclusive)',
			now: '2026-08-05T16:00:00-04:00', // Wed 16:00 Toronto
			windows: [wedWindow],
			expected: 'ON'
		},
		{
			name: 'exact end minute is OFF (end exclusive)',
			now: '2026-08-05T20:00:00-04:00', // Wed 20:00 Toronto
			windows: [wedWindow],
			expected: 'OFF'
		},
		{
			name: 'last minute before end is ON',
			now: '2026-08-05T19:59:00-04:00', // Wed 19:59 Toronto
			windows: [wedWindow],
			expected: 'ON'
		},
		{
			name: 'no windows at all is OFF',
			now: '2026-08-05T18:00:00-04:00',
			windows: [],
			expected: 'OFF'
		},
		{
			name: 'window on a different day is OFF',
			now: '2026-08-06T18:00:00-04:00', // Thu 18:00 Toronto
			windows: [wedWindow],
			expected: 'OFF'
		},
		{
			name: 'midnight-spanning pair: late Friday side is ON',
			now: '2026-08-07T23:30:00-04:00', // Fri 23:30 Toronto
			windows: [friLate, satEarly],
			expected: 'ON'
		},
		{
			name: 'midnight-spanning pair: midnight itself is ON (next row start inclusive)',
			now: '2026-08-08T00:00:00-04:00', // Sat 00:00 Toronto
			windows: [friLate, satEarly],
			expected: 'ON'
		},
		{
			name: 'midnight-spanning pair: early Saturday side is ON',
			now: '2026-08-08T01:30:00-04:00', // Sat 01:30 Toronto
			windows: [friLate, satEarly],
			expected: 'ON'
		},
		{
			name: 'midnight-spanning pair: after the Saturday end is OFF',
			now: '2026-08-08T02:00:00-04:00', // Sat 02:00 Toronto
			windows: [friLate, satEarly],
			expected: 'OFF'
		}
	];

	it.each(cases)('$name', ({ now, windows, expected }) => {
		expect(computeDesiredState({ now: new Date(now), timeZone: TZ, windows, overrides: [] })).toBe(
			expected
		);
	});
});

describe('computeDesiredState: overrides', () => {
	// Reference times around the Wednesday 16:00–20:00 window (EDT, UTC-4).
	const insideWindow = '2026-08-05T18:00:00-04:00'; // Wed 18:00
	const afterWindow = '2026-08-05T21:00:00-04:00'; // Wed 21:00
	const laterTonight = '2026-08-05T22:00:00-04:00'; // Wed 22:00
	const beforeWindow = '2026-08-05T10:00:00-04:00'; // Wed 10:00

	const cases: Array<{
		name: string;
		now: string;
		windows: ScheduleWindow[];
		overrides: Override[];
		expected: 'ON' | 'OFF';
	}> = [
		{
			name: 'block_now forces OFF inside a window',
			now: insideWindow,
			windows: [wedWindow],
			overrides: [ov('block_now', laterTonight, beforeWindow)],
			expected: 'OFF'
		},
		{
			name: 'allow_now forces ON outside every window',
			now: afterWindow,
			windows: [wedWindow],
			overrides: [ov('allow_now', laterTonight, afterWindow)],
			expected: 'ON'
		},
		{
			name: 'expired block_now is ignored (schedule says ON)',
			now: insideWindow,
			windows: [wedWindow],
			overrides: [ov('block_now', beforeWindow, beforeWindow)],
			expected: 'ON'
		},
		{
			name: 'expired allow_now is ignored (schedule says OFF)',
			now: afterWindow,
			windows: [wedWindow],
			overrides: [ov('allow_now', insideWindow, beforeWindow)],
			expected: 'OFF'
		},
		{
			name: 'override whose effectiveUntil equals now exactly is expired',
			now: afterWindow,
			windows: [wedWindow],
			overrides: [ov('allow_now', afterWindow, beforeWindow)],
			expected: 'OFF'
		},
		{
			name: 'extend keeps ON past the window end until effectiveUntil',
			now: afterWindow,
			windows: [wedWindow],
			overrides: [ov('extend', laterTonight, insideWindow)],
			expected: 'ON'
		},
		{
			name: 'extend during the window is ON (window already allows it)',
			now: insideWindow,
			windows: [wedWindow],
			overrides: [ov('extend', laterTonight, insideWindow)],
			expected: 'ON'
		},
		{
			name: 'expired extend is ignored (back to schedule: OFF)',
			now: laterTonight,
			windows: [wedWindow],
			overrides: [ov('extend', afterWindow, insideWindow)],
			expected: 'OFF'
		},
		{
			name: 'extend with no relevant window today behaves like allow_now',
			now: afterWindow,
			windows: [], // no windows at all
			overrides: [ov('extend', laterTonight, afterWindow)],
			expected: 'ON'
		},
		{
			name: 'precedence: later-created allow_now beats earlier block_now',
			now: afterWindow,
			windows: [wedWindow],
			overrides: [
				ov('block_now', laterTonight, '2026-08-05T20:30:00-04:00'),
				ov('allow_now', laterTonight, '2026-08-05T20:45:00-04:00')
			],
			expected: 'ON'
		},
		{
			name: 'precedence: later-created block_now beats earlier allow_now',
			now: insideWindow,
			windows: [wedWindow],
			overrides: [
				ov('allow_now', laterTonight, '2026-08-05T17:00:00-04:00'),
				ov('block_now', laterTonight, '2026-08-05T17:30:00-04:00')
			],
			expected: 'OFF'
		},
		{
			name: 'precedence: an expired later override does not shadow an active earlier one',
			now: afterWindow,
			windows: [wedWindow],
			overrides: [
				ov('allow_now', laterTonight, '2026-08-05T17:00:00-04:00'),
				ov('block_now', insideWindow, '2026-08-05T17:30:00-04:00') // already expired
			],
			expected: 'ON'
		}
	];

	it.each(cases)('$name', ({ now, windows, overrides, expected }) => {
		expect(computeDesiredState({ now: new Date(now), timeZone: TZ, windows, overrides })).toBe(
			expected
		);
	});
});

describe('computeDesiredState: DST transitions (America/Toronto, system TZ=UTC)', () => {
	// Sunday 2026-03-08: spring forward, 02:00 EST jumps to 03:00 EDT at 07:00Z.
	// Sunday 2026-11-01: fall back, 02:00 EDT returns to 01:00 EST at 06:00Z.
	const sunMorning = win(0, 540, 720); // Sunday 09:00–12:00
	const sunSkipped = win(0, 180, 240); // Sunday 03:00–04:00
	const sunAmbiguous = win(0, 60, 120); // Sunday 01:00–02:00

	const cases: Array<{
		name: string;
		now: string;
		windows: ScheduleWindow[];
		expected: 'ON' | 'OFF';
	}> = [
		{
			name: 'spring forward: 13:30Z is 09:30 EDT, inside 09:00-12:00',
			now: '2026-03-08T13:30:00Z',
			windows: [sunMorning],
			expected: 'ON'
		},
		{
			name: 'spring forward: 12:30Z is 08:30 EDT, still before the window',
			now: '2026-03-08T12:30:00Z',
			windows: [sunMorning],
			expected: 'OFF'
		},
		{
			name: 'spring forward: 07:15Z lands in 03:15 EDT (02:15 never exists)',
			now: '2026-03-08T07:15:00Z',
			windows: [sunSkipped],
			expected: 'ON'
		},
		{
			name: 'fall back: 13:30Z is 08:30 EST (same UTC time was ON in March)',
			now: '2026-11-01T13:30:00Z',
			windows: [sunMorning],
			expected: 'OFF'
		},
		{
			name: 'fall back: 14:30Z is 09:30 EST, inside 09:00-12:00',
			now: '2026-11-01T14:30:00Z',
			windows: [sunMorning],
			expected: 'ON'
		},
		{
			name: 'fall back: first pass through 01:30 (EDT) is ON',
			now: '2026-11-01T05:30:00Z',
			windows: [sunAmbiguous],
			expected: 'ON'
		},
		{
			name: 'fall back: second pass through 01:30 (EST) is ON again',
			now: '2026-11-01T06:30:00Z',
			windows: [sunAmbiguous],
			expected: 'ON'
		}
	];

	it.each(cases)('$name', ({ now, windows, expected }) => {
		expect(computeDesiredState({ now: new Date(now), timeZone: TZ, windows, overrides: [] })).toBe(
			expected
		);
	});
});

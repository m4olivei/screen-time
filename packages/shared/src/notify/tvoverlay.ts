/**
 * TvOverlay notification transport.
 *
 * POSTs JSON to the TvOverlay app's `/notify` endpoint on the TV over plain
 * HTTP on the LAN — no TLS, so unlike the UniFi client there is no
 * certificate exception to make and the global `fetch` is used directly.
 *
 * Field names follow TvOverlay's `json/notification.json` and README table
 * (`message`, `duration`, `smallIcon`), not the stale Postman collection.
 * The `id` is stable per threshold so re-sending the same threshold replaces
 * the overlay rather than stacking a second one.
 *
 * No retries and no logging: the caller decides what a `false` means.
 */
import { NOTIFY_TIMEOUT_MS, type Notice, type Notifier } from './notifier.js';

/** Material Design Icons name shown beside the message. */
const SMALL_ICON = 'mdi:timer-sand';
/** Screen corner the overlay is anchored to. */
const CORNER = 'top_end';

export function createTvOverlayNotifier(baseUrl: string): Notifier {
	const url = `${baseUrl.replace(/\/+$/, '')}/notify`;

	async function send(notice: Notice): Promise<boolean> {
		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					id: `screen-time-warning-${notice.thresholdMinutes}`,
					title: notice.title,
					message: notice.message,
					smallIcon: SMALL_ICON,
					corner: CORNER,
					duration: notice.durationSeconds
				}),
				signal: AbortSignal.timeout(NOTIFY_TIMEOUT_MS)
			});
			return response.ok;
		} catch {
			// Network error or timeout abort — a missed warning, never a rejection.
			return false;
		}
	}

	return { send };
}

/**
 * ntfy notification transport.
 *
 * POSTs to an ntfy topic URL with the message as the plain-text request body
 * and the title in the `Title` header, per ntfy's publishing API. ntfy.sh
 * presents a valid public certificate, so the global `fetch` is used directly.
 *
 * ntfy has no concept of a display duration, so `durationSeconds` is
 * deliberately dropped.
 *
 * No retries and no logging: the caller decides what a `false` means.
 */
import { NOTIFY_TIMEOUT_MS, type Notice, type Notifier } from './notifier.js';

export function createNtfyNotifier(topicUrl: string): Notifier {
	async function send(notice: Notice): Promise<boolean> {
		try {
			const response = await fetch(topicUrl, {
				method: 'POST',
				headers: { Title: notice.title },
				body: notice.message,
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

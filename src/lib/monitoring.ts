/**
 * Lightweight structured logging + failure alerting.
 *
 * Replaces bare `console.log`/`console.error` on the critical path so that:
 *   - every event is a single JSON line (greppable in Vercel logs), and
 *   - genuine failures (both AI providers down, WhatsApp send failed, webhook
 *     crash) can additionally fan out to an alert channel.
 *
 * Set ALERT_WEBHOOK_URL to a Slack/Discord/generic incoming-webhook URL to get
 * pinged on failures. If unset, alerting is a no-op and only logging happens.
 */

type Level = "info" | "warn" | "error";

export function logEvent(
  event: string,
  data: Record<string, unknown> = {},
  level: Level = "info"
): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...data,
  });

  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/**
 * Log an error AND (best-effort) push it to ALERT_WEBHOOK_URL.
 * Never throws — alerting must not break the request it's reporting on.
 */
export async function reportFailure(
  event: string,
  data: Record<string, unknown> = {}
): Promise<void> {
  logEvent(event, data, "error");

  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // `text` is what Slack/Discord render; the rest is there for other sinks.
      body: JSON.stringify({
        text: `⚠️ ${event}`,
        event,
        ...data,
      }),
    });
  } catch (err) {
    console.error("[monitoring] Failed to post alert webhook:", err);
  }
}

"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

/**
 * What a visit sends to Vercel: the page without what goes after "?" or "#". Searches, filters
 * and the links that reset a password carry data there that must not leave the app.
 */
export function withoutQuery(event: BeforeSendEvent): BeforeSendEvent {
  const url = new URL(event.url);
  url.search = "";
  url.hash = "";
  return { ...event, url: url.href };
}

/**
 * Visits counted by Vercel Web Analytics: no cookies, and the cable pages counted as one route
 * (`/cables/[id]`), not one per cable.
 */
export function WebAnalytics() {
  return <Analytics beforeSend={withoutQuery} />;
}

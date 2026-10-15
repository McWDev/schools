const formatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "2026-09-01" → "1 Sep 2026". Calendar dates carry no time zone, so format them in UTC. */
export function formatDate(value: string): string {
  return formatter.format(new Date(`${value}T00:00:00Z`));
}

export function formatRange(startsOn: string, endsOn: string): string {
  return `${formatDate(startsOn)} – ${formatDate(endsOn)}`;
}

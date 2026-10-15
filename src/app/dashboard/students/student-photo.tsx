/** A student's photo, or their initials. The image comes from an authorized route. */
export function StudentPhoto({
  studentId,
  name,
  hasPhoto,
  version,
  size = 40,
}: {
  studentId: string;
  name: string;
  hasPhoto: boolean;
  /** Changes when the photo does, so the browser fetches the new one. */
  version?: string;
  size?: number;
}) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  if (hasPhoto) {
    return (
      // Served by an authorized route handler, so next/image optimization is not used.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/students/${studentId}/photo${version ? `?v=${encodeURIComponent(version)}` : ""}`}
        alt={`Photo of ${name}`}
        width={size}
        height={size}
        className="bg-surface-muted ring-border shrink-0 rounded-full object-cover ring-1"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="bg-primary-soft text-primary inline-flex shrink-0 items-center justify-center rounded-full font-semibold"
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.36) }}
    >
      {initials || "?"}
    </span>
  );
}

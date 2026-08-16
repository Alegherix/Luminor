import { cn } from "~/lib/utils";

export function ResourceSparkline({
  values,
  tone = "muted",
}: {
  values: readonly number[];
  tone?: "muted" | "warning" | "danger";
}) {
  const width = 48;
  const height = 16;
  const series = values.length > 0 ? values : [0];
  const max = Math.max(0.4, ...series);
  const points = series
    .map((value, index) => {
      const x = series.length <= 1 ? 0 : (index / (series.length - 1)) * width;
      const y = height - (value / max) * (height - 2.5) - 1.25;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn(
        "shrink-0",
        tone === "danger" && "text-destructive",
        tone === "warning" && "text-warning",
        tone === "muted" && "text-muted-foreground/70",
      )}
      aria-hidden
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
    </svg>
  );
}

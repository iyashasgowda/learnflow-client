const MINUTES_PER_HOUR = 60;

export function formatDuration(minutes: number): string {
  if (minutes < MINUTES_PER_HOUR) return `${minutes} min`;
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  const rest = minutes % MINUTES_PER_HOUR;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

// The day with the highest value, for the text that stands in for a chart.
export function peak(dates: string[], values: number[]): { date: string; value: number } | null {
  let best: { date: string; value: number } | null = null;
  values.forEach((value, index) => {
    if (value > 0 && (best === null || value > best.value)) best = { date: dates[index] as string, value };
  });
  return best;
}

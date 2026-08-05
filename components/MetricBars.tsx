export function MetricBars({ metrics }: { metrics: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...metrics.map((metric) => metric.value));
  return (
    <div>
      {metrics.map((metric) => (
        <div className="metric-row" key={metric.label}>
          <span>{metric.label}</span>
          <div className="metric-track"><div className="metric-fill" style={{ width: `${Math.max(2, (metric.value / max) * 100)}%` }} /></div>
          <strong>{metric.value}</strong>
        </div>
      ))}
    </div>
  );
}

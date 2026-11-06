export function metrics() {
  const started = Date.now(),
    latencies = [];
  let requests = 0,
    failures = 0;
  return {
    observe(status, elapsed) {
      requests++;
      if (status >= 500) failures++;
      latencies.push(elapsed);
      if (latencies.length > 1000) latencies.shift();
    },
    snapshot() {
      const sorted = [...latencies].sort((a, b) => a - b);
      return {
        uptimeSeconds: Math.floor((Date.now() - started) / 1000),
        requests,
        serverErrors: failures,
        p95Ms: sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] || 0,
        rssBytes: process.memoryUsage().rss,
      };
    },
  };
}

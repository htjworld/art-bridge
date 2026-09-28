interface ToolMetric {
  calls: number;
  errors: number;
  totalLatencyMs: number;
  emptyResults: number;
  relaxLevelSum: number;   // 완화 레벨 합 (평균 계산용)
  relaxLevelCount: number;
}

const metrics = new Map<string, ToolMetric>();

function blank(): ToolMetric {
  return { calls: 0, errors: 0, totalLatencyMs: 0, emptyResults: 0, relaxLevelSum: 0, relaxLevelCount: 0 };
}

export function logToolCall(entry: {
  tool: string;
  latencyMs: number;
  resultCount: number;
  relaxLevel?: number;
  error?: string;
}): void {
  // 구조화 로그 한 줄 (Render 로그에서 수집/파싱 가능)
  console.log(JSON.stringify({ type: 'tool_call', ts: new Date().toISOString(), ...entry }));

  const m = metrics.get(entry.tool) ?? blank();
  m.calls++;
  m.totalLatencyMs += entry.latencyMs;
  if (entry.error) m.errors++;
  if (entry.resultCount === 0) m.emptyResults++;
  if (entry.relaxLevel !== undefined) {
    m.relaxLevelSum += entry.relaxLevel;
    m.relaxLevelCount++;
  }
  metrics.set(entry.tool, m);
}

export function getMetrics(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [tool, m] of metrics) {
    out[tool] = {
      calls: m.calls,
      errors: m.errors,
      errorRate: m.calls ? +(m.errors / m.calls).toFixed(3) : 0,
      avgLatencyMs: m.calls ? Math.round(m.totalLatencyMs / m.calls) : 0,
      emptyResultRate: m.calls ? +(m.emptyResults / m.calls).toFixed(3) : 0,
      avgRelaxLevel: m.relaxLevelCount ? +(m.relaxLevelSum / m.relaxLevelCount).toFixed(2) : 0,
    };
  }
  return out;
}

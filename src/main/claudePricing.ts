/**
 * Claude/OpenAI token pricing — pure resolution logic, extracted from index.ts so
 * it is unit-testable (no Electron / fs / fetch). The main process owns fetching &
 * caching the dynamic LiteLLM table; this module turns a (model, usage) pair into a
 * cost, and memoizes the per-model rate resolution.
 *
 * Why the memo matters: resolving a model that isn't an exact key does a fuzzy scan
 * over the whole ~1000-entry LiteLLM map. A cold token-stats scan calls this for
 * thousands of records, but across only a handful of distinct models — so caching
 * the resolved rate per model turns thousands of O(n log n) scans into a few.
 */

export type ModelPricingRates = { input: number; output: number; cacheRead?: number; cacheWrite?: number };

export interface PricingUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export function normalizePricingModel(model: string): string {
  return model.toLowerCase().replace(/^(anthropic|openai|github-copilot|openrouter)\//, "").trim();
}

export function ratesFromLiteLlmEntry(entry: Record<string, unknown>): ModelPricingRates | null {
  const input = typeof entry.input_cost_per_token === "number" ? entry.input_cost_per_token * 1_000_000 : undefined;
  const output = typeof entry.output_cost_per_token === "number" ? entry.output_cost_per_token * 1_000_000 : undefined;
  if (!input || !output) return null;
  const cacheRead = typeof entry.cache_read_input_token_cost === "number" ? entry.cache_read_input_token_cost * 1_000_000 : undefined;
  const cacheWrite = typeof entry.cache_creation_input_token_cost === "number" ? entry.cache_creation_input_token_cost * 1_000_000 : undefined;
  return { input, output, cacheRead, cacheWrite };
}

export function parseLiteLlmPricing(data: unknown): Map<string, ModelPricingRates> {
  const rates = new Map<string, ModelPricingRates>();
  if (!data || typeof data !== "object" || Array.isArray(data)) return rates;
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const parsed = ratesFromLiteLlmEntry(value as Record<string, unknown>);
    if (parsed) rates.set(normalizePricingModel(key), parsed);
  }
  return rates;
}

export function findDynamicPricingRate(rates: Map<string, ModelPricingRates> | null, model: string): ModelPricingRates | null {
  if (!rates || rates.size === 0) return null;
  const normalized = normalizePricingModel(model).replace(/_/g, "-");
  if (rates.has(normalized)) return rates.get(normalized)!;
  const candidates = Array.from(rates.entries())
    .filter(([key]) => normalized === key || normalized.includes(key) || key.includes(normalized))
    .sort((a, b) => b[0].length - a[0].length);
  return candidates[0]?.[1] ?? null;
}

export function resolveModelPricingRates(rates: Map<string, ModelPricingRates> | null, model: string): ModelPricingRates | null {
  const dynamic = findDynamicPricingRate(rates, model);
  if (dynamic) return dynamic;
  const normalized = normalizePricingModel(model).replace(/_/g, "-");

  if (normalized.includes("claude")) {
    if (normalized.includes("fable") || normalized.includes("mythos")) return { input: 10, output: 50, cacheWrite: 12.5, cacheRead: 1 };
    if (normalized.includes("opus-4-8") || normalized.includes("opus-4.8") || normalized.includes("opus-4-7") || normalized.includes("opus-4.7") || normalized.includes("opus-4-6") || normalized.includes("opus-4.6") || normalized.includes("opus-4-5") || normalized.includes("opus-4.5")) return { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 };
    if (normalized.includes("opus")) return { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 };
    if (normalized.includes("sonnet")) return { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 };
    if (normalized.includes("haiku-4-5") || normalized.includes("haiku-4.5")) return { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 };
    if (normalized.includes("haiku")) return { input: 0.8, output: 4, cacheWrite: 1, cacheRead: 0.08 };
  }

  if (normalized.includes("gpt-5.5") || normalized.includes("gpt-5-5")) return { input: 5, output: 30, cacheRead: 0.5, cacheWrite: 5 };
  if (normalized.includes("gpt-5.4-mini") || normalized.includes("gpt-5-4-mini")) return { input: 0.75, output: 4.5, cacheRead: 0.075, cacheWrite: 0.75 };
  if (normalized.includes("gpt-5.4") || normalized.includes("gpt-5-4")) return { input: 2.5, output: 15, cacheRead: 0.25, cacheWrite: 2.5 };
  if (normalized.includes("gpt-5-codex")) return { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 1.25 };
  if (normalized === "gpt-5" || normalized.startsWith("gpt-5-")) return { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 1.25 };
  if (normalized.includes("gpt-4.1-mini") || normalized.includes("gpt-4-1-mini")) return { input: 0.4, output: 1.6, cacheRead: 0.1, cacheWrite: 0.4 };
  if (normalized.includes("gpt-4.1-nano") || normalized.includes("gpt-4-1-nano")) return { input: 0.1, output: 0.4, cacheRead: 0.025, cacheWrite: 0.1 };
  if (normalized.includes("gpt-4.1") || normalized.includes("gpt-4-1")) return { input: 2, output: 8, cacheRead: 0.5, cacheWrite: 2 };
  if (normalized.includes("gpt-4o-mini")) return { input: 0.15, output: 0.6, cacheRead: 0.075, cacheWrite: 0.15 };
  if (normalized.includes("gpt-4o")) return { input: 2.5, output: 10, cacheRead: 1.25, cacheWrite: 2.5 };

  return null;
}

function costFromRates(rates: ModelPricingRates, usage: PricingUsage): number {
  const cacheWrite = rates.cacheWrite ?? rates.input * 1.25;
  const cacheRead = rates.cacheRead ?? rates.input * 0.1;
  return (
    usage.inputTokens * rates.input +
    usage.cacheCreationTokens * cacheWrite +
    usage.cacheReadTokens * cacheRead +
    usage.outputTokens * rates.output
  ) / 1_000_000;
}

export function computeClaudeCost(rates: Map<string, ModelPricingRates> | null, model: string, usage: PricingUsage): { costUsd: number; priced: boolean } {
  const resolved = resolveModelPricingRates(rates, model);
  if (!resolved) return { costUsd: 0, priced: false };
  return { costUsd: costFromRates(resolved, usage), priced: true };
}

/**
 * Memoizes per-model rate resolution. The cache is keyed by the raw model string
 * and reset whenever the dynamic table *instance* changes (first load / refresh),
 * so results are always consistent with the current table. Bounded by the number
 * of distinct model strings seen (a handful in practice).
 */
export class ModelPricingMemo {
  private memo = new Map<string, ModelPricingRates | null>();
  private source: Map<string, ModelPricingRates> | null = null;

  resolve(rates: Map<string, ModelPricingRates> | null, model: string): ModelPricingRates | null {
    if (this.source !== rates) {
      this.memo.clear();
      this.source = rates;
    }
    if (this.memo.has(model)) return this.memo.get(model)!;
    const resolved = resolveModelPricingRates(rates, model);
    this.memo.set(model, resolved);
    return resolved;
  }

  cost(rates: Map<string, ModelPricingRates> | null, model: string, usage: PricingUsage): { costUsd: number; priced: boolean } {
    const resolved = this.resolve(rates, model);
    if (!resolved) return { costUsd: 0, priced: false };
    return { costUsd: costFromRates(resolved, usage), priced: true };
  }
}

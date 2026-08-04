import { afterEach, describe, expect, it, vi } from "vitest";
import { buildModelsUrlCandidates, fetchProviderModels } from "../src/main/ccSwitchStore";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

describe("buildModelsUrlCandidates", () => {
  it("appends /v1/models to a plain base and offers a bare /models fallback", () => {
    expect(buildModelsUrlCandidates("https://api.example.com")).toEqual([
      "https://api.example.com/v1/models",
      "https://api.example.com/models"
    ]);
  });

  it("only needs /models when the base already ends in a version segment", () => {
    expect(buildModelsUrlCandidates("https://api.example.com/v1/")).toEqual(["https://api.example.com/v1/models"]);
    expect(buildModelsUrlCandidates("https://host/api/coding/paas/v4")).toEqual(["https://host/api/coding/paas/v4/models"]);
  });

  it("returns nothing for an empty base", () => {
    expect(buildModelsUrlCandidates("   ")).toEqual([]);
  });
});

describe("fetchProviderModels", () => {
  it("requires both a base url and an api key", async () => {
    expect(await fetchProviderModels({ baseUrl: "", apiKey: "x" })).toEqual({ ok: false, models: [], errorCode: "config" });
    expect(await fetchProviderModels({ baseUrl: "https://x", apiKey: "" })).toEqual({ ok: false, models: [], errorCode: "config" });
  });

  it("sends a bearer token (never in the URL) and returns sorted, de-duped ids", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: [{ id: "z-model" }, { id: "a-model" }, { id: "a-model" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchProviderModels({ baseUrl: "https://api.example.com", apiKey: "sk-secret" });
    expect(result).toEqual({ ok: true, models: ["a-model", "z-model"] });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example.com/v1/models");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer sk-secret");
    expect(String(url)).not.toContain("sk-secret");
  });

  it("maps 401 to an auth error and stops trying candidates", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}, 401));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchProviderModels({ baseUrl: "https://api.example.com", apiKey: "sk" });
    expect(result.errorCode).toBe("auth");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls through a 404 to the next candidate", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, 404))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: "m1" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchProviderModels({ baseUrl: "https://api.example.com", apiKey: "sk" });
    expect(result).toEqual({ ok: true, models: ["m1"] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderEditPanel } from "../src/renderer/clawd-migrated/components/claude-routing/ProviderEditPanel";
import { I18nProvider } from "../src/renderer/clawd-migrated/useI18n";

// Renders the real edit form (advanced options auto-open because a role model is
// set) to exercise the cc-switch model-mapping table: display name, actual model,
// and the 1M marker round-trip.

function renderPanel(env: Record<string, string>, onSave = vi.fn()) {
  render(
    <I18nProvider initialLocale="en">
      <ProviderEditPanel
        provider={{ id: "p1", name: "Provider 1", category: "custom", settingsConfig: { env } }}
        mode="edit"
        open
        onSave={onSave}
        onClose={vi.fn()}
      />
    </I18nProvider>
  );
  return onSave;
}

const baseEnv = { ANTHROPIC_BASE_URL: "https://api.example.test", ANTHROPIC_AUTH_TOKEN: "sk-token" };

beforeEach(() => {
  if (typeof globalThis.requestAnimationFrame !== "function") {
    globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0) as unknown as number;
    globalThis.cancelAnimationFrame = id => clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
  }
  document.documentElement.setAttribute("data-theme", "light");
});

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
});

describe("provider model mapping (cc-switch parity)", () => {
  it("parses a stored [1M] marker back into a checked toggle + base model, and populates the display name", () => {
    renderPanel({
      ...baseEnv,
      ANTHROPIC_DEFAULT_SONNET_MODEL: "my-sonnet[1M]",
      ANTHROPIC_DEFAULT_SONNET_MODEL_NAME: "My Sonnet"
    });

    expect((screen.getByRole("textbox", { name: "Sonnet Actual Request Model" }) as HTMLInputElement).value).toBe("my-sonnet");
    expect((screen.getByRole("textbox", { name: "Sonnet Display Name" }) as HTMLInputElement).value).toBe("My Sonnet");
    expect((screen.getByRole("checkbox", { name: "Sonnet 1M" }) as HTMLInputElement).checked).toBe(true);
  });

  it("omits the 1M toggle for Haiku (no 1M context in the lineup)", () => {
    renderPanel({ ...baseEnv, ANTHROPIC_DEFAULT_HAIKU_MODEL: "my-haiku" });
    expect(screen.getByRole("checkbox", { name: "Sonnet 1M" })).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: "Haiku 1M" })).toBeNull();
  });

  it("appends the [1M] marker to the role model when the toggle is switched on", () => {
    const onSave = renderPanel({ ...baseEnv, ANTHROPIC_DEFAULT_SONNET_MODEL: "plain-sonnet" });

    const toggle = screen.getByRole("checkbox", { name: "Sonnet 1M" }) as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    fireEvent.click(toggle);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0];
    expect(saved.settingsConfig.env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe("plain-sonnet[1M]");
  });

  it("writes the display name to the *_MODEL_NAME env key on save", () => {
    const onSave = renderPanel({ ...baseEnv, ANTHROPIC_DEFAULT_OPUS_MODEL: "opus-real" });

    fireEvent.change(screen.getByRole("textbox", { name: "Opus Display Name" }), { target: { value: "Fancy Opus" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const saved = onSave.mock.calls[0][0];
    expect(saved.settingsConfig.env.ANTHROPIC_DEFAULT_OPUS_MODEL_NAME).toBe("Fancy Opus");
    // Editing the display name must not disturb the actual model value.
    expect(saved.settingsConfig.env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe("opus-real");
  });
});

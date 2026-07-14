// @vitest-environment jsdom
import { fireEvent, cleanup, render, screen, waitFor } from "@testing-library/react";
import { EditorView } from "codemirror";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderEditPanel } from "../src/renderer/clawd-migrated/components/claude-routing/ProviderEditPanel";
import { I18nProvider } from "../src/renderer/clawd-migrated/useI18n";

const SECRET = "sk-should-not-be-visible";

beforeEach(() => {
  if (typeof globalThis.requestAnimationFrame !== "function") {
    globalThis.requestAnimationFrame = (callback: FrameRequestCallback) =>
      setTimeout(() => callback(Date.now()), 0) as unknown as number;
    globalThis.cancelAnimationFrame = id => clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
  }
  document.documentElement.setAttribute("data-theme", "light");
});

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
});

describe("provider secret visibility", () => {
  it("does not mount the plaintext JSON editor until the user explicitly reveals it", async () => {
    render(
      <I18nProvider initialLocale="en">
        <ProviderEditPanel
          provider={{
            id: "private-provider",
            name: "Private provider",
            category: "custom",
            settingsConfig: { env: { ANTHROPIC_AUTH_TOKEN: SECRET, ANTHROPIC_BASE_URL: "https://api.example.test" } }
          }}
          mode="edit"
          onSave={vi.fn()}
          onClose={vi.fn()}
        />
      </I18nProvider>
    );

    const passwordField = screen.getByDisplayValue(SECRET) as HTMLInputElement;
    expect(passwordField.type).toBe("password");
    expect(document.querySelector(".cm-editor")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show config" }));

    await waitFor(() => expect(document.querySelector(".cm-editor")).not.toBeNull());
    const editor = EditorView.findFromDOM(document.querySelector(".cm-editor") as HTMLElement);
    expect(editor).not.toBeNull();
    if (!editor) return;
    expect(editor.state.doc.toString()).toContain(SECRET);
    expect(screen.getByRole("button", { name: "Hide config" })).toBeTruthy();
  });

  it.each(["ftp://api.example.test", "https://api.example.test/${ENDPOINT_ID}"])("blocks an unroutable API endpoint: %s", endpoint => {
    const onSave = vi.fn();
    render(
      <I18nProvider initialLocale="en">
        <ProviderEditPanel
          provider={{
            id: "invalid-endpoint-provider",
            name: "Invalid endpoint provider",
            category: "custom",
            settingsConfig: { env: { ANTHROPIC_AUTH_TOKEN: SECRET, ANTHROPIC_BASE_URL: endpoint } }
          }}
          mode="edit"
          onSave={onSave}
          onClose={vi.fn()}
        />
      </I18nProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("API endpoint must be a valid HTTP(S) URL without unfilled template parameters")).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });
});

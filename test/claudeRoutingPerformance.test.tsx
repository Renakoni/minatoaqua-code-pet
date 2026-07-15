// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../src/renderer/clawd-migrated/useI18n";

const providerIconRender = vi.hoisted(() => vi.fn());
const providerEditorRender = vi.hoisted(() => vi.fn());

vi.mock("../src/renderer/clawd-migrated/components/claude-routing/ProviderIcon", () => ({
  ProviderIcon: (props: { name: string }) => {
    providerIconRender(props.name);
    return null;
  }
}));

vi.mock("../src/renderer/clawd-migrated/components/claude-routing/ProviderEditPanel", () => ({
  ProviderEditPanel: (props: unknown) => {
    providerEditorRender(props);
    return null;
  }
}));

import { ClaudeRoutingPanel } from "../src/renderer/clawd-migrated/components/claude-routing/ClaudeRoutingPanel";

afterEach(() => {
  cleanup();
  providerIconRender.mockReset();
  providerEditorRender.mockReset();
  Reflect.deleteProperty(window, "companion");
});

describe("Claude routing render isolation", () => {
  it("opens the provider editor without re-rendering the sortable provider cards", async () => {
    const providers = Array.from({ length: 40 }, (_, index) => ({
      id: `provider-${index}`,
      name: `Provider ${index}`,
      category: "custom",
      sortIndex: index,
      settingsConfig: { env: { ANTHROPIC_BASE_URL: `https://provider-${index}.example.test` } }
    }));
    Reflect.set(window, "companion", {
      listClaudeProviders: vi.fn(async () => ({
        ok: true,
        source: "local",
        providers,
        currentId: providers[0].id,
        hasCommonConfig: false
      })),
      onCcSwitchChanged: vi.fn(() => vi.fn()),
      reorderClaudeProviders: vi.fn(async () => ({ ok: true })),
      saveClaudeProvider: vi.fn(),
      deleteClaudeProvider: vi.fn(),
      duplicateClaudeProvider: vi.fn(),
      switchClaudeProvider: vi.fn(),
      testClaudeProvider: vi.fn(),
      pickTerminalDirectory: vi.fn(),
      openClaudeProviderTerminal: vi.fn()
    });

    render(
      <I18nProvider initialLocale="en">
        <ClaudeRoutingPanel />
      </I18nProvider>
    );

    await screen.findByText("Provider 39");
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(providerEditorRender).toHaveBeenCalledWith(expect.objectContaining({ mode: "add", visible: false }));
    providerIconRender.mockClear();
    providerEditorRender.mockClear();

    fireEvent.click(screen.getByRole("button", { name: /Add provider/i }));
    expect(document.querySelector(".ccs-provider-editor-loading")).toBeNull();
    await waitFor(() => expect(providerEditorRender).toHaveBeenCalledWith(expect.objectContaining({ mode: "add", visible: true })));

    expect(providerIconRender).not.toHaveBeenCalled();

    const editorProps = providerEditorRender.mock.calls.at(-1)?.[0] as { onClose: () => void };
    providerEditorRender.mockClear();
    act(() => editorProps.onClose());
    expect(providerEditorRender).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(providerEditorRender).toHaveBeenCalledWith(expect.objectContaining({ mode: "add", visible: false }));
    });
  });

  it("merges a saved provider without re-reading the full provider list", async () => {
    const provider = {
      id: "provider-1",
      name: "Provider 1",
      category: "custom",
      sortIndex: 0,
      settingsConfig: { env: { ANTHROPIC_BASE_URL: "https://provider-1.example.test" } }
    };
    const savedProvider = {
      ...provider,
      id: "provider-2",
      name: "Provider 2",
      sortIndex: 1
    };
    const listClaudeProviders = vi.fn(async () => ({
      ok: true,
      source: "local",
      providers: [provider],
      currentId: provider.id,
      hasCommonConfig: false
    }));
    const saveClaudeProvider = vi.fn(async () => ({ ok: true, provider: savedProvider }));
    Reflect.set(window, "companion", {
      listClaudeProviders,
      onCcSwitchChanged: vi.fn(() => vi.fn()),
      reorderClaudeProviders: vi.fn(async () => ({ ok: true })),
      saveClaudeProvider,
      deleteClaudeProvider: vi.fn(),
      duplicateClaudeProvider: vi.fn(),
      switchClaudeProvider: vi.fn(),
      testClaudeProvider: vi.fn(),
      pickTerminalDirectory: vi.fn(),
      openClaudeProviderTerminal: vi.fn()
    });

    render(
      <I18nProvider initialLocale="en">
        <ClaudeRoutingPanel />
      </I18nProvider>
    );

    await screen.findByText("Provider 1");
    fireEvent.click(screen.getByRole("button", { name: /Add provider/i }));
    await waitFor(() => expect(providerEditorRender).toHaveBeenCalled());
    const editorProps = providerEditorRender.mock.calls.at(-1)?.[0] as {
      onSave: (provider: typeof savedProvider) => void;
    };

    act(() => editorProps.onSave(savedProvider));

    await screen.findByText("Provider 2");
    expect(saveClaudeProvider).toHaveBeenCalledTimes(1);
    expect(listClaudeProviders).toHaveBeenCalledTimes(1);
  });
});

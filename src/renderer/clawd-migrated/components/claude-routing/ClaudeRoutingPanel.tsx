import { useMemo, useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import type { CompanionSettings } from "../../../shared/events";
import { useI18n } from "../../useI18n";
import { SortableClaudeProviderCard } from "./ProviderCard";
import { ProviderEditPanel } from "./ProviderEditPanel";
import type { ClaudeProvider, LegacyRoute } from "./types";

type ClaudeRouteCompanionApi = typeof window.companion & {
  applyClaudeRoute?: (routeId: string) => Promise<unknown>;
  testClaudeRoute?: (routeId: string) => Promise<unknown>;
  openClaudeRouteTerminal?: (routeId: string) => Promise<unknown>;
};

function formatI18n(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((text, [key, value]) => text.split(`{${key}}`).join(String(value)), template);
}

export function ClaudeRoutingPanel({
  settings,
  updateSettings
}: {
  settings: CompanionSettings;
  updateSettings: (next: Partial<CompanionSettings>) => void;
  connection?: unknown;
}) {
  const { t, locale } = useI18n();
  const legacyRoutes = ((settings.claudeRoutes ?? []) as LegacyRoute[]);
  const storedProviders = (settings.claudeProviders ?? null) as Record<string, ClaudeProvider> | null;
  const currentProviderId = (settings.currentClaudeProviderId ?? settings.activeClaudeRouteId ?? "") as string;
  const [editingProvider, setEditingProvider] = useState<ClaudeProvider | null>(null);
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const companion = window.companion as ClaudeRouteCompanionApi;

  function providerFromLegacy(route: LegacyRoute, index: number): ClaudeProvider {
    const official = route.id === "claude-official" || /official/i.test(route.name);
    return {
      id: route.id,
      name: route.name,
      category: official ? "official" : "third_party",
      websiteUrl: route.baseUrl,
      notes: route.baseUrl,
      createdAt: Date.now() + index,
      sortIndex: index,
      icon: official ? "anthropic" : undefined,
      iconColor: official ? "#d97757" : "#f97316",
      settingsConfig: {
        env: {
          ANTHROPIC_BASE_URL: route.baseUrl,
          ANTHROPIC_AUTH_TOKEN: route.apiKeyMasked
        }
      }
    };
  }

  function normalizeProviders() {
    if (storedProviders && Object.keys(storedProviders).length > 0) return storedProviders;
    return Object.fromEntries(legacyRoutes.map((route, index) => [route.id, providerFromLegacy(route, index)])) as Record<string, ClaudeProvider>;
  }

  const providers = normalizeProviders();
  const sortedProviders = useMemo(() => Object.values(providers).sort((a, b) => {
    if (a.sortIndex !== undefined && b.sortIndex !== undefined) return a.sortIndex - b.sortIndex;
    if (a.sortIndex !== undefined) return -1;
    if (b.sortIndex !== undefined) return 1;
    const timeA = a.createdAt ?? 0;
    const timeB = b.createdAt ?? 0;
    if (timeA && timeB && timeA !== timeB) return timeA - timeB;
    return a.name.localeCompare(b.name, locale === "zh" ? "zh-CN" : "en-US");
  }), [providers, locale]);
  const effectiveCurrentId = currentProviderId || sortedProviders[0]?.id || "";
  const currentProvider = providers[effectiveCurrentId] ?? sortedProviders[0];
  const providerSummary = currentProvider
    ? formatI18n(t("routing.providerCountCurrent", "{count} providers · Current {name}"), { count: sortedProviders.length, name: currentProvider.name })
    : formatI18n(t("routing.providerCount", "{count} providers"), { count: sortedProviders.length });
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function saveProviders(nextProviders: Record<string, ClaudeProvider>, nextCurrentId = effectiveCurrentId) {
    updateSettings({
      claudeProviders: nextProviders,
      currentClaudeProviderId: nextCurrentId,
      claudeRoutes: undefined,
      activeClaudeRouteId: undefined
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sortedProviders.findIndex(provider => provider.id === active.id);
    const newIndex = sortedProviders.findIndex(provider => provider.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(sortedProviders, oldIndex, newIndex);
    const next = { ...providers };
    reordered.forEach((provider, index) => {
      next[provider.id] = { ...next[provider.id], sortIndex: index };
    });
    saveProviders(next);
    setStatus(t("routing.orderUpdated", "Order updated"));
  }

  function createEmptyProvider(): ClaudeProvider {
    const now = Date.now();
    return {
      id: `provider-${now.toString(36)}`,
      name: t("routing.newProvider", "New provider"),
      category: "custom",
      createdAt: now,
      sortIndex: sortedProviders.length,
      iconColor: "#f97316",
      settingsConfig: { env: { ANTHROPIC_BASE_URL: "" } }
    };
  }

  function closeEditor() {
    setCreating(false);
    setEditingProvider(null);
  }

  function saveProvider(provider: ClaudeProvider, originalId?: string) {
    const next = { ...providers };
    if (originalId && originalId !== provider.id) delete next[originalId];
    next[provider.id] = provider;
    saveProviders(next, effectiveCurrentId === originalId ? provider.id : effectiveCurrentId || provider.id);
    closeEditor();
  }

  function removeProvider(provider: ClaudeProvider) {
    if (sortedProviders.length <= 1) return;
    const next = { ...providers };
    delete next[provider.id];
    const fallback = sortedProviders.find(item => item.id !== provider.id)?.id || "";
    saveProviders(next, effectiveCurrentId === provider.id ? fallback : effectiveCurrentId);
  }

  async function handleSwitch(provider: ClaudeProvider) {
    const result = await companion.applyClaudeRoute?.(provider.id);
    if ((result as any)?.liveApply?.ok === false) {
      setStatus((result as any).liveApply.error ?? t("routing.applyFailed", "Apply failed"));
      return;
    }
    saveProviders(providers, provider.id);
    setStatus((result as any)?.liveApply?.path ? t("routing.wroteGlobalSettings", "Wrote Claude Code global settings") : (result as any)?.activeRoute ? t("routing.switched", "Switched") : t("routing.setCurrent", "Set as current provider"));
  }

  async function handleTest(provider: ClaudeProvider) {
    const result = await companion.testClaudeRoute?.(provider.id);
    setStatus((result as any)?.message ?? ((result as any)?.ok ? t("routing.testComplete", "Test complete") : t("routing.testFailed", "Test failed")));
  }

  async function handleTerminal(provider: ClaudeProvider) {
    const result = await companion.openClaudeRouteTerminal?.(provider.id);
    setStatus((result as any)?.ok ? t("routing.terminalOpened", "Terminal opened") : (result as any)?.error ?? t("routing.terminalFailed", "Failed to open terminal"));
  }

  return (
    <section className="ccs-provider-board">
      <header className="ccs-provider-board-header">
        <div className="ccs-provider-board-title">
          <h3>{t("routing.title", "Claude Code routing")}</h3>
          <p>{providerSummary}</p>
        </div>
        <button className="cc-switch-add" onClick={() => { setCreating(true); setEditingProvider(null); }} title={t("routing.addProvider", "Add provider")} aria-label={t("routing.addProvider", "Add provider")}><Plus size={18} /></button>
      </header>

      {status ? <div className="ccs-provider-status">{status}</div> : null}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sortedProviders.map(provider => provider.id)} strategy={verticalListSortingStrategy}>
          <div className="ccs-provider-list">
            {sortedProviders.map(provider => (
              <SortableClaudeProviderCard
                key={provider.id}
                provider={provider}
                isCurrent={provider.id === effectiveCurrentId}
                canRemove={sortedProviders.length > 1}
                onSwitch={handleSwitch}
                onEdit={setEditingProvider}
                onTest={handleTest}
                onTerminal={handleTerminal}
                onRemove={removeProvider}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {creating ? <ProviderEditPanel provider={createEmptyProvider()} mode="add" onSave={saveProvider} onClose={closeEditor} /> : null}
      {editingProvider ? <ProviderEditPanel provider={editingProvider} mode="edit" onSave={saveProvider} onClose={closeEditor} /> : null}
    </section>
  );
}

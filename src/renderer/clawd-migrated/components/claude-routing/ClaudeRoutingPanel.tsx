import { useMemo, useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { CompanionSettings } from "../../../shared/events";
import { SortableClaudeProviderCard } from "./ProviderCard";
import { ProviderEditPanel } from "./ProviderEditPanel";
import type { ClaudeProvider, LegacyRoute } from "./types";

type ClaudeRouteCompanionApi = typeof window.companion & {
  applyClaudeRoute?: (routeId: string) => Promise<unknown>;
  testClaudeRoute?: (routeId: string) => Promise<unknown>;
  openClaudeRouteTerminal?: (routeId: string) => Promise<unknown>;
};

export function ClaudeRoutingPanel({
  settings,
  updateSettings
}: {
  settings: CompanionSettings;
  updateSettings: (next: Partial<CompanionSettings>) => void;
  connection?: unknown;
}) {
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
    return a.name.localeCompare(b.name, "zh-CN");
  }), [providers]);
  const effectiveCurrentId = currentProviderId || sortedProviders[0]?.id || "";
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
    setStatus("排序已更新");
  }

  function createEmptyProvider(): ClaudeProvider {
    const now = Date.now();
    return {
      id: `provider-${now.toString(36)}`,
      name: "新供应商",
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
      setStatus((result as any).liveApply.error ?? "应用失败");
      return;
    }
    saveProviders(providers, provider.id);
    setStatus((result as any)?.liveApply?.path ? "已写入 Claude Code 全局设置" : (result as any)?.activeRoute ? "已切换" : "已设为当前供应商");
  }

  async function handleTest(provider: ClaudeProvider) {
    const result = await companion.testClaudeRoute?.(provider.id);
    setStatus((result as any)?.message ?? ((result as any)?.ok ? "检测完成" : "检测失败"));
  }

  async function handleTerminal(provider: ClaudeProvider) {
    const result = await companion.openClaudeRouteTerminal?.(provider.id);
    setStatus((result as any)?.ok ? "终端已打开" : (result as any)?.error ?? "打开终端失败");
  }

  return (
    <section className="ccs-provider-board">
      <header className="ccs-provider-board-header">
        <div><h3>Claude Code 路由</h3></div>
        <button className="cc-switch-add" onClick={() => { setCreating(true); setEditingProvider(null); }} title="添加供应商">+</button>
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

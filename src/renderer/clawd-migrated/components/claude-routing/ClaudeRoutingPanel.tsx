import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import type { ClaudeProviderListResult, ClaudeProviderTestResult } from "../../../shared/events";
import { useI18n } from "../../useI18n";
import { ConfirmDialog } from "./ConfirmDialog";
import { SortableClaudeProviderCard } from "./ProviderCard";
import type { ClaudeProvider } from "./types";

// The editor pulls in CodeMirror and the preset catalog; load it on demand.
const ProviderEditPanel = lazy(() => import("./ProviderEditPanel").then(module => ({ default: module.ProviderEditPanel })));

type LegacyTerminalApi = typeof window.companion & {
  openClaudeRouteTerminal?: (routeId: string) => Promise<unknown>;
};

function formatI18n(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((text, [key, value]) => text.split(`{${key}}`).join(String(value)), template);
}

function createEmptyProvider(sortIndex: number, name: string): ClaudeProvider {
  return {
    id: "",
    name,
    category: "custom",
    createdAt: Date.now(),
    sortIndex,
    iconColor: "#f97316",
    settingsConfig: { env: { ANTHROPIC_BASE_URL: "", ANTHROPIC_AUTH_TOKEN: "" } }
  };
}

export function ClaudeRoutingPanel(_props: { settings?: unknown; updateSettings?: unknown; connection?: unknown } = {}) {
  const { t, locale } = useI18n();
  const companion = window.companion;
  const [listing, setListing] = useState<ClaudeProviderListResult | null>(null);
  const [orderOverride, setOrderOverride] = useState<string[] | null>(null);
  const [editingProvider, setEditingProvider] = useState<ClaudeProvider | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ClaudeProvider | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await companion.listClaudeProviders();
      setListing(result);
      setOrderOverride(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }, [companion]);

  useEffect(() => {
    void refresh();
    const unsubscribe = companion.onCcSwitchChanged?.(() => { void refresh(); });
    return () => { unsubscribe?.(); };
  }, [companion, refresh]);

  const providers = useMemo(() => listing?.providers ?? [], [listing]);
  const currentId = listing?.currentId ?? "";
  const isCcSwitch = listing?.source === "cc-switch";

  const sortedProviders = useMemo(() => {
    const base = [...providers].sort((a, b) => {
      if (a.sortIndex !== undefined && b.sortIndex !== undefined && a.sortIndex !== b.sortIndex) return a.sortIndex - b.sortIndex;
      if (a.sortIndex !== undefined && b.sortIndex === undefined) return -1;
      if (a.sortIndex === undefined && b.sortIndex !== undefined) return 1;
      const timeA = a.createdAt ?? 0;
      const timeB = b.createdAt ?? 0;
      if (timeA && timeB && timeA !== timeB) return timeA - timeB;
      return a.name.localeCompare(b.name, locale === "zh" ? "zh-CN" : "en-US");
    });
    if (!orderOverride) return base;
    const byId = new Map(base.map(provider => [provider.id, provider]));
    const ordered = orderOverride.map(id => byId.get(id)).filter((provider): provider is ClaudeProvider => Boolean(provider));
    for (const provider of base) if (!orderOverride.includes(provider.id)) ordered.push(provider);
    return ordered;
  }, [providers, orderOverride, locale]);

  const currentProvider = providers.find(provider => provider.id === currentId) ?? sortedProviders[0];
  const providerSummary = currentProvider
    ? formatI18n(t("routing.providerCountCurrent", "{count} 个供应商 · 当前 {name}"), { count: sortedProviders.length, name: currentProvider.name })
    : formatI18n(t("routing.providerCount", "{count} 个供应商"), { count: sortedProviders.length });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sortedProviders.findIndex(provider => provider.id === active.id);
    const newIndex = sortedProviders.findIndex(provider => provider.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(sortedProviders, oldIndex, newIndex).map(provider => provider.id);
    setOrderOverride(reordered);
    void companion.reorderClaudeProviders(reordered).then(result => {
      if (!result?.ok) setStatus(result?.error ?? t("routing.orderFailed", "排序保存失败"));
      else setStatus(t("routing.orderUpdated", "已更新排序"));
      void refresh();
    });
  }

  function closeEditor() {
    setCreating(false);
    setEditingProvider(null);
  }

  async function saveProvider(provider: ClaudeProvider, originalId?: string) {
    const result = await companion.saveClaudeProvider(provider, originalId);
    if (!result.ok) {
      setStatus(result.error ?? t("routing.saveFailed", "保存失败"));
      return;
    }
    setStatus(originalId ? t("routing.providerUpdated", "供应商已更新") : t("routing.providerAdded", "供应商已添加"));
    closeEditor();
    void refresh();
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const result = await companion.deleteClaudeProvider(pendingDelete.id);
    setStatus(result.ok ? t("routing.providerDeleted", "供应商已删除") : result.error ?? t("routing.deleteFailed", "删除失败"));
    setPendingDelete(null);
    void refresh();
  }

  async function handleDuplicate(provider: ClaudeProvider) {
    const result = await companion.duplicateClaudeProvider(provider.id);
    setStatus(result.ok ? t("routing.providerDuplicated", "已复制供应商") : result.error ?? t("routing.duplicateFailed", "复制失败"));
    void refresh();
  }

  async function handleSwitch(provider: ClaudeProvider) {
    const result = await companion.switchClaudeProvider(provider.id);
    if (!result.ok) {
      setStatus(result.error ?? t("routing.applyFailed", "切换失败"));
      return;
    }
    const warningText = result.warnings && result.warnings.length > 0 ? ` (${result.warnings.join(", ")})` : "";
    setStatus(`${formatI18n(t("routing.switchedTo", "已切换到 {name}，已写入 Claude Code 全局配置"), { name: provider.name })}${warningText}`);
    void refresh();
  }

  function describeTest(result: ClaudeProviderTestResult) {
    if (!result.reachable) {
      return `${t("routing.testUnreachable", "无法连接")}${result.error ? `: ${result.error}` : ""}`;
    }
    const latency = typeof result.latencyMs === "number" ? `${result.latencyMs} ms` : "";
    if (result.authorized) return `${t("routing.testOk", "连接正常")} · ${latency} · HTTP ${result.status}`;
    return `${t("routing.testReachable", "可达（鉴权未通过）")} · ${latency} · HTTP ${result.status}`;
  }

  async function handleTest(provider: ClaudeProvider) {
    setTestingId(provider.id);
    try {
      const result = await companion.testClaudeProvider({ id: provider.id });
      setStatus(`${provider.name}: ${describeTest(result)}`);
    } finally {
      setTestingId(null);
    }
  }

  async function handleTerminal(provider: ClaudeProvider) {
    const legacy = companion as LegacyTerminalApi;
    const result = await legacy.openClaudeRouteTerminal?.(provider.id);
    setStatus((result as { ok?: boolean; error?: string })?.ok ? t("routing.terminalOpened", "已打开终端") : (result as { error?: string })?.error ?? t("routing.terminalFailed", "打开终端失败"));
  }

  return (
    <section className="ccs-provider-board">
      <header className="ccs-provider-board-header">
        <div className="ccs-provider-board-title">
          <h3>
            {t("routing.title", "Claude Code 路由")}
            {isCcSwitch ? (
              <em className="ccs-source-badge" title={listing?.dbPath ?? ""}>cc-switch</em>
            ) : null}
          </h3>
          <p>{providerSummary}</p>
        </div>
        <button
          className="cc-switch-add"
          onClick={() => { setCreating(true); setEditingProvider(null); }}
          title={t("routing.addProvider", "添加供应商")}
          aria-label={t("routing.addProvider", "添加供应商")}
        ><Plus size={18} /></button>
      </header>

      {status ? <div className="ccs-provider-status">{status}</div> : null}
      {listing?.readError ? <div className="ccs-provider-status">{t("routing.dbReadError", "读取 cc-switch 数据库失败")}: {listing.readError}</div> : null}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sortedProviders.map(provider => provider.id)} strategy={verticalListSortingStrategy}>
          <div className="ccs-provider-list">
            {sortedProviders.map(provider => (
              <SortableClaudeProviderCard
                key={provider.id}
                provider={provider}
                isCurrent={provider.id === currentId}
                canRemove={sortedProviders.length > 1 && provider.id !== currentId}
                testing={testingId === provider.id}
                onSwitch={handleSwitch}
                onEdit={setEditingProvider}
                onDuplicate={handleDuplicate}
                onTest={handleTest}
                onTerminal={handleTerminal}
                onRemove={setPendingDelete}
              />
            ))}
            {sortedProviders.length === 0 && listing ? (
              <div className="ccs-provider-empty">{t("routing.noProviders", "还没有供应商，点击右上角添加")}</div>
            ) : null}
          </div>
        </SortableContext>
      </DndContext>

      {creating || editingProvider ? (
        <Suspense fallback={null}>
          <ProviderEditPanel
            provider={editingProvider ?? createEmptyProvider(sortedProviders.length, t("routing.newProvider", "新供应商"))}
            mode={editingProvider ? "edit" : "add"}
            hasCommonConfig={listing?.hasCommonConfig}
            onSave={(provider, originalId) => { void saveProvider(provider, originalId); }}
            onClose={closeEditor}
            onTestEndpoint={(baseUrl, apiKey) => companion.testClaudeProvider({ baseUrl, apiKey })}
          />
        </Suspense>
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          title={t("routing.deleteProvider", "删除供应商")}
          cancelLabel={t("common.cancel", "取消")}
          confirmLabel={t("common.delete", "删除")}
          danger
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => { void confirmDelete(); }}
        >
          <p>{formatI18n(t("routing.deleteProviderMessage", '确定要删除供应商 "{name}" 吗？此操作无法撤销。'), { name: pendingDelete.name })}</p>
        </ConfirmDialog>
      ) : null}
    </section>
  );
}

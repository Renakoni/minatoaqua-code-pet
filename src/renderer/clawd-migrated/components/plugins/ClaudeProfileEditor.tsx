import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Code2, Package, Search, Server, Trash2 } from "lucide-react";
import type {
  ClaudeProfileInventory,
  ClaudeProfileResource,
  ClaudeProfileSaveInput
} from "../../../../shared/claudeProfiles";
import { useVirtualRows } from "./useVirtualRows";

type ResourceTab = "skills" | "plugins" | "mcpServers";

const ROW_HEIGHT = 64;
const OVERSCAN = 5;

export function ClaudeProfileEditor({
  initial,
  inventory,
  protectedProfile,
  canDelete,
  busy,
  hideSensitiveContent,
  zh,
  onCancel,
  onSave,
  onDelete
}: {
  initial: ClaudeProfileSaveInput;
  inventory: ClaudeProfileInventory;
  protectedProfile: boolean;
  canDelete: boolean;
  busy: boolean;
  hideSensitiveContent: boolean;
  zh: boolean;
  onCancel: () => void;
  onSave: (input: ClaudeProfileSaveInput) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState<ClaudeProfileSaveInput>(() => ({
    ...initial,
    skills: [...initial.skills],
    plugins: [...initial.plugins],
    mcpServers: [...initial.mcpServers]
  }));
  const [activeTab, setActiveTab] = useState<ResourceTab>("skills");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  const tabs = [
    { id: "skills" as const, label: "Skills", icon: Code2 },
    { id: "plugins" as const, label: "Plugins", icon: Package },
    { id: "mcpServers" as const, label: "MCP", icon: Server }
  ];
  const availableResources = inventory[activeTab];
  const availableIds = useMemo(() => new Set(availableResources.map(resource => resource.id)), [availableResources]);
  const resources = useMemo<ClaudeProfileResource[]>(() => [
    ...availableResources,
    ...draft[activeTab]
      .filter(resourceId => !availableIds.has(resourceId))
      .map(resourceId => ({
        id: resourceId,
        kind: activeTab === "skills" ? "skill" as const : activeTab === "plugins" ? "plugin" as const : "mcp" as const,
        name: resourceId.replace(/^[^:]+:/, ""),
        description: zh ? "当前环境中已不存在" : "No longer available in the current environment",
        enabled: false
      }))
  ], [activeTab, availableIds, availableResources, draft, zh]);
  const selected = useMemo(() => new Set(draft[activeTab]), [activeTab, draft]);
  const filtered = useMemo(() => {
    const needle = deferredQuery.trim().toLocaleLowerCase();
    if (!needle) return resources;
    return resources.filter(resource => [resource.name, resource.description, resource.detail]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase()
      .includes(needle));
  }, [deferredQuery, resources]);

  useEffect(() => setQuery(""), [activeTab]);

  function setMembership(ids: string[]) {
    setDraft(current => ({ ...current, [activeTab]: ids }));
  }

  function toggleResource(resourceId: string) {
    const next = new Set(selected);
    if (next.has(resourceId)) next.delete(resourceId);
    else next.add(resourceId);
    setMembership(resources.filter(resource => next.has(resource.id)).map(resource => resource.id));
  }

  const selectedFilteredCount = filtered.reduce((count, resource) => count + Number(selected.has(resource.id)), 0);
  const allFilteredSelected = filtered.length > 0 && selectedFilteredCount === filtered.length;
  const someFilteredSelected = selectedFilteredCount > 0 && !allFilteredSelected;

  function toggleFiltered() {
    const next = new Set(selected);
    for (const resource of filtered) {
      if (allFilteredSelected) next.delete(resource.id);
      else next.add(resource.id);
    }
    setMembership(resources.filter(resource => next.has(resource.id)).map(resource => resource.id));
  }

  const title = initial.id ? (zh ? "编辑配置方案" : "Edit profile") : (zh ? "新建配置方案" : "New profile");
  const activeTabLabel = tabs.find(tab => tab.id === activeTab)?.label ?? activeTab;

  return (
    <div className="claude-profile-editor">
      <header className="claude-profile-editor-header">
        <button type="button" className="claude-profile-icon-button" onClick={onCancel} disabled={busy} aria-label={zh ? "返回" : "Back"}>
          <ArrowLeft size={17} />
        </button>
        <div>
          <h2>{title}</h2>
          <p>{zh ? "保存只更新方案内容，不会修改 Claude Code。" : "Saving updates the profile only. Claude Code is unchanged."}</p>
        </div>
        <div className="claude-profile-editor-actions">
          {initial.id && !protectedProfile ? (
            <button type="button" className="claude-profile-text-button danger" onClick={onDelete} disabled={busy || !canDelete} title={!canDelete ? (zh ? "先应用其他方案" : "Apply another profile first") : undefined}>
              <Trash2 size={15} /> {zh ? "删除" : "Delete"}
            </button>
          ) : null}
          <button type="button" className="claude-profile-text-button" onClick={onCancel} disabled={busy}>{zh ? "取消" : "Cancel"}</button>
          <button
            type="button"
            className="claude-profile-primary-button"
            onClick={() => onSave({ ...draft, name: draft.name.trim(), description: draft.description?.trim() || undefined })}
            disabled={busy || !draft.name.trim()}
          >
            {busy ? (zh ? "保存中..." : "Saving...") : (zh ? "保存" : "Save")}
          </button>
        </div>
      </header>

      <section className="claude-profile-fields">
        <label>
          <span>{zh ? "名称" : "Name"}</span>
          <input
            value={draft.name}
            onChange={event => setDraft(current => ({ ...current, name: event.target.value }))}
            maxLength={64}
            disabled={busy || protectedProfile}
            autoFocus={!protectedProfile}
          />
        </label>
        <label>
          <span>{zh ? "说明" : "Description"}</span>
          <input
            value={draft.description ?? ""}
            onChange={event => setDraft(current => ({ ...current, description: event.target.value }))}
            placeholder={zh ? "可选" : "Optional"}
            maxLength={240}
            disabled={busy}
          />
        </label>
      </section>

      <nav className="claude-resource-subtabs compact claude-profile-editor-tabs" aria-label={zh ? "资源类型" : "Resource type"}>
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button type="button" key={tab.id} className={`claude-resource-subtab ${activeTab === tab.id ? "active" : ""}`} onClick={() => setActiveTab(tab.id)}>
              <Icon size={16} />
              <span><b>{tab.label}</b></span>
              <small>{draft[tab.id].length}/{inventory[tab.id].length}</small>
            </button>
          );
        })}
      </nav>

      <section className="claude-profile-editor-toolbar">
        <div className="claude-resource-search dark">
          <Search size={16} />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder={zh ? `搜索 ${activeTabLabel}` : `Search ${activeTabLabel}`} />
        </div>
        <label className="claude-profile-select-filtered">
          <IndeterminateCheckbox
            checked={allFilteredSelected}
            mixed={someFilteredSelected}
            onChange={toggleFiltered}
            disabled={filtered.length === 0 || busy}
          />
          <span>{zh ? "选择筛选结果" : "Select filtered"}</span>
          <small>{selectedFilteredCount}/{filtered.length}</small>
        </label>
      </section>

      <section className="claude-profile-resource-frame" aria-busy={busy}>
        {filtered.length === 0 ? (
          <div className="claude-resource-empty">{zh ? "没有匹配的资源。" : "No matching resources."}</div>
        ) : (
          <VirtualResourceList
            items={filtered}
            selected={selected}
            availableIds={availableIds}
            hideSensitiveContent={hideSensitiveContent}
            zh={zh}
            resetKey={`${activeTab}:${deferredQuery}`}
            onToggle={toggleResource}
          />
        )}
      </section>

      <footer className="claude-profile-editor-summary">
        <span>{zh ? "已选择" : "Selected"}</span>
        <strong>{draft.skills.length} Skills</strong>
        <strong>{draft.plugins.length} Plugins</strong>
        <strong>{draft.mcpServers.length} MCP</strong>
      </footer>
    </div>
  );
}

function IndeterminateCheckbox({
  checked,
  mixed,
  disabled,
  onChange
}: {
  checked: boolean;
  mixed: boolean;
  disabled: boolean;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = mixed;
  }, [mixed]);
  return <input ref={ref} type="checkbox" checked={checked} disabled={disabled} onChange={onChange} />;
}

function VirtualResourceList({
  items,
  selected,
  availableIds,
  hideSensitiveContent,
  zh,
  resetKey,
  onToggle
}: {
  items: ClaudeProfileResource[];
  selected: Set<string>;
  availableIds: Set<string>;
  hideSensitiveContent: boolean;
  zh: boolean;
  resetKey: string;
  onToggle: (resourceId: string) => void;
}) {
  const virtual = useVirtualRows(items, ROW_HEIGHT, resetKey, OVERSCAN);

  return (
    <div ref={virtual.viewportRef} className="claude-profile-virtual-list" onScroll={event => virtual.onScroll(event.currentTarget.scrollTop)}>
      <div className="claude-profile-virtual-space" style={{ height: virtual.totalHeight }}>
        {virtual.visible.map((resource, offset) => {
          const index = virtual.start + offset;
          const available = availableIds.has(resource.id);
          const description = hideSensitiveContent
            ? (zh ? "资源详情已隐藏" : "Resource details hidden")
            : resource.description ?? resource.detail ?? (zh ? "Claude Code 资源" : "Claude Code resource");
          return (
            <label
              key={resource.id}
              className="claude-profile-resource-option"
              style={{ height: ROW_HEIGHT, transform: `translateY(${index * ROW_HEIGHT}px)` }}
              data-resource-id={resource.id}
            >
              <input type="checkbox" checked={selected.has(resource.id)} onChange={() => onToggle(resource.id)} />
              <span className="claude-profile-resource-copy">
                <strong>{resource.name}</strong>
                <small title={description}>{description}</small>
              </span>
              <span className={`claude-profile-live-state ${available && resource.enabled ? "active" : "idle"}`}>
                {!available ? (zh ? "已不可用" : "Unavailable") : resource.enabled ? (zh ? "当前启用" : "Active now") : (zh ? "当前未启用" : "Inactive now")}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

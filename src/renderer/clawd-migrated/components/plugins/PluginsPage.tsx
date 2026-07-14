import React, { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  Code2,
  Copy,
  Package,
  Pencil,
  Plus,
  PlugZap,
  RefreshCw,
  Search,
  Server
} from "lucide-react";
import { toast } from "sonner";
import type {
  ClaudeProfile,
  ClaudeProfileResource,
  ClaudeProfileSaveInput,
  ClaudeProfilesSnapshot
} from "../../../../shared/claudeProfiles";
import type { CompanionSettings } from "../../../shared/events";
import { useI18n } from "../../useI18n";
import { ConfirmDialog } from "../claude-routing/ConfirmDialog";
import { RoutingToaster } from "../claude-routing/RoutingToaster";
import { ClaudeProfileEditor } from "./ClaudeProfileEditor";
import { useVirtualRows } from "./useVirtualRows";

type ResourceTab = "skills" | "plugins" | "mcpServers";
type BusyAction = "refresh" | "save" | "delete" | "apply" | null;

const emptySnapshot: ClaudeProfilesSnapshot = {
  schemaVersion: 1,
  profiles: [{ id: "default", name: "Default", skills: [], plugins: [], mcpServers: [], isProtected: true, createdAt: 0, updatedAt: 0 }],
  appliedProfileId: "default",
  inventory: { skills: [], plugins: [], mcpServers: [], scannedAt: 0 },
  drift: { profileId: "default", isDrifted: false, skills: false, plugins: false, mcpServers: false },
  mcpStatus: "ready"
};

type EditorState = {
  key: string;
  initial: ClaudeProfileSaveInput;
  protectedProfile: boolean;
};

export function PluginsPage({ settings }: { settings: CompanionSettings; updateSettings: (s: Partial<CompanionSettings>) => void }) {
  const { locale } = useI18n();
  const zh = locale === "zh";
  const [activeTab, setActiveTab] = useState<ResourceTab>("skills");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [snapshot, setSnapshot] = useState<ClaudeProfilesSnapshot>(emptySnapshot);
  const [selectedProfileId, setSelectedProfileId] = useState("default");
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  async function refresh(force = false) {
    setBusyAction("refresh");
    setLoadError(null);
    try {
      const next = await window.companion.getClaudeProfiles(force);
      setSnapshot(next ?? emptySnapshot);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
      setBusyAction(null);
    }
  }

  useEffect(() => { void refresh(false); }, []);

  useEffect(() => {
    const appliedProfileId = snapshot.appliedProfileId;
    setSelectedProfileId(appliedProfileId && snapshot.profiles.some(profile => profile.id === appliedProfileId)
      ? appliedProfileId
      : snapshot.profiles[0]?.id ?? "");
  }, [snapshot.appliedProfileId, snapshot.profiles]);

  useEffect(() => setQuery(""), [activeTab]);

  const selectedProfile = snapshot.profiles.find(profile => profile.id === selectedProfileId) ?? snapshot.profiles[0];
  const editorProfile = editor?.initial.id
    ? snapshot.profiles.find(profile => profile.id === editor.initial.id)
    : undefined;
  const profileActionsAvailable = snapshot.mcpStatus === "ready" && !loading && !loadError;

  const tabs = [
    { id: "skills" as const, label: "Skills", icon: Code2 },
    { id: "plugins" as const, label: "Plugins", icon: Package },
    { id: "mcpServers" as const, label: "MCP", icon: Server }
  ];
  const activeTabLabel = tabs.find(tab => tab.id === activeTab)?.label ?? activeTab;
  const items = snapshot.inventory[activeTab];
  const selectedIds = useMemo(() => new Set(selectedProfile?.[activeTab] ?? []), [activeTab, selectedProfile]);
  const filteredItems = useMemo(() => {
    const needle = deferredQuery.trim().toLocaleLowerCase();
    if (!needle) return items;
    return items.filter(item => [item.name, item.description, item.detail]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase()
      .includes(needle));
  }, [deferredQuery, items]);

  function startEdit(profile: ClaudeProfile) {
    setActionError(null);
    setEditor({
      key: `edit:${profile.id}:${profile.updatedAt}`,
      initial: profileInput(profile),
      protectedProfile: profile.isProtected
    });
  }

  function startCreate(copyCurrent: boolean) {
    const source = copyCurrent ? selectedProfile : undefined;
    setNewMenuOpen(false);
    setActionError(null);
    setEditor({
      key: `create:${copyCurrent ? source?.id ?? "empty" : "empty"}:${Date.now()}`,
      initial: {
        name: source ? nextCopyName(source.name, snapshot.profiles) : "",
        ...(source?.description ? { description: source.description } : {}),
        skills: source ? [...source.skills] : [],
        plugins: source ? [...source.plugins] : [],
        mcpServers: source ? [...source.mcpServers] : []
      },
      protectedProfile: false
    });
  }

  async function saveProfile(input: ClaudeProfileSaveInput) {
    setBusyAction("save");
    setActionError(null);
    const result = await window.companion.saveClaudeProfile(input);
    if (!result.ok) {
      setBusyAction(null);
      const message = issueMessage(result.issues, zh);
      setActionError(message);
      toast.error(message);
      return;
    }
    setSnapshot(result.snapshot);
    setEditor(null);
    const profileName = result.snapshot.profiles.find(profile => profile.id === result.profileId)?.name ?? input.name;
    await switchProfile(result.profileId, profileName);
  }

  async function deleteProfile(profileId: string) {
    const profile = snapshot.profiles.find(item => item.id === profileId);
    if (!profile) return;
    setDeleteConfirm(false);
    if (profile.id === snapshot.appliedProfileId) {
      const fallback = snapshot.profiles.find(item => item.id === "default");
      if (!fallback || !await switchProfile(fallback.id, fallback.name, false)) return;
    }
    setBusyAction("delete");
    setActionError(null);
    const result = await window.companion.deleteClaudeProfile(profile.id);
    setBusyAction(null);
    if (!result.ok) {
      const message = issueMessage(result.issues, zh);
      setActionError(message);
      toast.error(message);
      return;
    }
    setSnapshot(result.snapshot);
    setSelectedProfileId(result.snapshot.appliedProfileId ?? result.snapshot.profiles[0]?.id ?? "");
    setEditor(null);
    toast.success(zh ? "配置方案已删除" : "Profile deleted");
  }

  async function switchProfile(profileId: string, profileName: string, notify = true) {
    setBusyAction("apply");
    setActionError(null);
    const result = await window.companion.applyClaudeProfile(profileId);
    setBusyAction(null);
    if (!result.ok) {
      const message = issueMessage(result.issues, zh);
      setActionError(message);
      toast.error(message);
      return false;
    }
    setSnapshot(result.snapshot);
    setSelectedProfileId(result.profileId);
    if (notify) toast.success(zh ? `已成功切换：${profileName}` : `Switched to: ${profileName}`);
    return true;
  }

  if (editor) {
    return (
      <div className="claude-resources-page claude-resources-page-dark claude-profiles-page">
        <RoutingToaster />
        <ClaudeProfileEditor
          key={editor.key}
          initial={editor.initial}
          inventory={snapshot.inventory}
          protectedProfile={editor.protectedProfile}
          canDelete={Boolean(editor.initial.id && !editor.protectedProfile)}
          busy={busyAction === "save" || busyAction === "delete" || busyAction === "apply"}
          hideSensitiveContent={settings.hideSensitiveContent}
          zh={zh}
          onCancel={() => setEditor(null)}
          onSave={input => void saveProfile(input)}
          onDelete={() => setDeleteConfirm(true)}
        />
        {actionError ? <section className="connection-error"><PlugZap size={18} />{actionError}</section> : null}
        {deleteConfirm && editorProfile ? (
          <ConfirmDialog
            title={zh ? "删除配置方案？" : "Delete profile?"}
            cancelLabel={zh ? "取消" : "Cancel"}
            confirmLabel={zh ? "删除" : "Delete"}
            danger
            onCancel={() => setDeleteConfirm(false)}
            onConfirm={() => void deleteProfile(editorProfile.id)}
          >
            <p>{editorProfile.id === snapshot.appliedProfileId
              ? (zh ? `将先切换到 Default，然后永久删除“${editorProfile.name}”。` : `Default will become current, then “${editorProfile.name}” will be permanently deleted.`)
              : (zh ? `“${editorProfile.name}”将被永久删除。` : `“${editorProfile.name}” will be permanently deleted.`)}</p>
          </ConfirmDialog>
        ) : null}
      </div>
    );
  }

  return (
    <div className="claude-resources-page claude-resources-page-dark claude-profiles-page">
      <RoutingToaster />
      <section className="claude-profile-toolbar">
        <label className="claude-profile-picker">
          <span>{zh ? "当前方案" : "Current profile"}</span>
          <div>
            <select
              value={selectedProfile?.id ?? ""}
              onChange={event => {
                const profile = snapshot.profiles.find(item => item.id === event.target.value);
                if (profile) void switchProfile(profile.id, profile.name);
              }}
              disabled={!profileActionsAvailable || busyAction !== null}
            >
              {snapshot.profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
            </select>
            <ChevronDown size={15} aria-hidden="true" />
          </div>
        </label>

        <div className="claude-profile-toolbar-actions">
          <button type="button" className="claude-profile-icon-button" onClick={() => selectedProfile && startEdit(selectedProfile)} disabled={!profileActionsAvailable || !selectedProfile || busyAction !== null} aria-label={zh ? "编辑配置方案" : "Edit profile"} title={zh ? "编辑" : "Edit"}>
            <Pencil size={16} />
          </button>
          <div className="claude-profile-new-menu" onBlur={event => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setNewMenuOpen(false);
          }}>
            <button type="button" className="claude-profile-icon-button" onClick={() => setNewMenuOpen(open => !open)} disabled={!profileActionsAvailable || busyAction !== null} aria-label={zh ? "新建配置方案" : "New profile"} aria-haspopup="menu" aria-expanded={newMenuOpen} title={zh ? "新建" : "New"}>
              <Plus size={17} />
            </button>
            {newMenuOpen ? (
              <div className="claude-profile-new-options" role="menu">
                <button type="button" role="menuitem" onClick={() => startCreate(false)}><Plus size={15} /><span><b>{zh ? "空白方案" : "Empty profile"}</b><small>{zh ? "从零开始选择" : "Start with no resources"}</small></span></button>
                <button type="button" role="menuitem" onClick={() => startCreate(true)} disabled={!selectedProfile}><Copy size={15} /><span><b>{zh ? "复制当前方案" : "Copy selected"}</b><small>{selectedProfile?.name}</small></span></button>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {snapshot.mcpStatus !== "ready" ? (
        <section className="claude-profile-unavailable"><AlertTriangle size={16} />{snapshot.mcpStatus === "config-unreadable" ? (zh ? "暂时无法读取 ~/.claude.json，方案操作已暂停。" : "~/.claude.json is temporarily unreadable. Profile actions are paused.") : (zh ? "MCP 保全清单暂时不可用，方案操作已暂停。" : "The MCP preservation inventory is unavailable. Profile actions are paused.")}</section>
      ) : null}
      {loadError || actionError ? <section className="connection-error"><PlugZap size={18} />{loadError ?? actionError}</section> : null}

      <nav className="claude-resource-subtabs compact" aria-label={zh ? "资源类型" : "Resource type"}>
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button type="button" key={tab.id} className={`claude-resource-subtab ${activeTab === tab.id ? "active" : ""}`} onClick={() => setActiveTab(tab.id)}>
              <Icon size={16} />
              <span><b>{tab.label}</b></span>
              <small>{snapshot.inventory[tab.id].length}</small>
            </button>
          );
        })}
      </nav>

      <section className="claude-resource-list-toolbar">
        <div className="claude-resource-search dark">
          <Search size={16} />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder={zh ? `搜索 ${activeTabLabel}` : `Search ${activeTabLabel}`} />
        </div>
        <button type="button" className="claude-resource-search-refresh" onClick={() => void refresh(true)} disabled={busyAction !== null} aria-label={zh ? "刷新" : "Refresh"} title={zh ? "刷新" : "Refresh"}>
          <RefreshCw size={17} className={busyAction === "refresh" ? "spinning" : undefined} />
        </button>
      </section>

      <ProfileResourceTable
        items={filteredItems}
        selectedIds={selectedIds}
        loading={loading}
        emptyLabel={emptyText(activeTab, zh)}
        hideSensitiveContent={settings.hideSensitiveContent}
        zh={zh}
        resetKey={`${activeTab}:${deferredQuery}:${selectedProfileId}`}
      />

      <p className="note claude-resource-path-note dark">
        {zh ? "全局用户范围" : "Global user scope"}
        {snapshot.inventory.scannedAt ? ` · ${new Date(snapshot.inventory.scannedAt).toLocaleTimeString()}` : ""}
      </p>

    </div>
  );
}

function ProfileResourceTable({
  items,
  selectedIds,
  loading,
  emptyLabel,
  hideSensitiveContent,
  zh,
  resetKey
}: {
  items: ClaudeProfileResource[];
  selectedIds: Set<string>;
  loading: boolean;
  emptyLabel: string;
  hideSensitiveContent: boolean;
  zh: boolean;
  resetKey: string;
}) {
  const rowHeight = 76;
  const virtual = useVirtualRows(items, rowHeight, resetKey);
  return (
    <section ref={virtual.viewportRef} className="claude-resource-table" aria-busy={loading} onScroll={event => virtual.onScroll(event.currentTarget.scrollTop)}>
      {loading ? (
        <div className="claude-resource-empty">{zh ? "正在读取 Claude Code 配置方案..." : "Loading Claude Code profiles..."}</div>
      ) : items.length === 0 ? (
        <div className="claude-resource-empty">{emptyLabel}</div>
      ) : (
        <>
          <div className="claude-resource-table-head">
            <span>{zh ? "资源" : "Resource"}</span>
            <span>{zh ? "当前环境" : "Live state"}</span>
            <span>{zh ? "方案" : "Profile"}</span>
          </div>
          <div className="claude-profile-readonly-space" style={{ height: virtual.totalHeight }}>
            {virtual.visible.map((item, offset) => {
              const index = virtual.start + offset;
              return (
                <ResourceRow
                  key={item.id}
                  item={item}
                  included={selectedIds.has(item.id)}
                  hideSensitiveContent={hideSensitiveContent}
                  zh={zh}
                  style={{ height: rowHeight, transform: `translateY(${index * rowHeight}px)` }}
                />
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

function ResourceRow({ item, included, hideSensitiveContent, zh, style }: { item: ClaudeProfileResource; included: boolean; hideSensitiveContent: boolean; zh: boolean; style?: React.CSSProperties }) {
  const description = hideSensitiveContent
    ? fallbackDescription(item.kind, zh)
    : item.description ?? item.detail ?? fallbackDescription(item.kind, zh);
  return (
    <article className="claude-resource-row claude-profile-readonly-row" style={style} data-resource-id={item.id}>
      <div className="claude-resource-row-main">
        <div className="claude-resource-name-line"><strong>{item.name}</strong></div>
        <p title={description}>{description}</p>
      </div>
      <div className="claude-resource-row-origin">
        <span>{zh ? "CLAUDE CODE" : "CLAUDE CODE"}</span>
        <strong>{item.enabled ? (zh ? "当前启用" : "Active now") : (zh ? "当前未启用" : "Inactive now")}</strong>
      </div>
      <div className={`claude-resource-status ${included ? "active" : "idle"}`}>
        <span>{included ? (zh ? "已选择" : "Included") : (zh ? "未选择" : "Not included")}</span>
      </div>
    </article>
  );
}

function profileInput(profile: ClaudeProfile): ClaudeProfileSaveInput {
  return {
    id: profile.id,
    name: profile.name,
    ...(profile.description ? { description: profile.description } : {}),
    skills: [...profile.skills],
    plugins: [...profile.plugins],
    mcpServers: [...profile.mcpServers]
  };
}

function nextCopyName(sourceName: string, profiles: ClaudeProfile[]) {
  const names = new Set(profiles.map(profile => profile.name.toLocaleLowerCase()));
  let candidate = `${sourceName} copy`;
  let index = 2;
  while (names.has(candidate.toLocaleLowerCase())) candidate = `${sourceName} copy ${index++}`;
  return candidate;
}

function issueMessage(issues: Array<{ message: string }>, zh: boolean) {
  return issues[0]?.message ?? (zh ? "操作失败。" : "The operation failed.");
}

function fallbackDescription(kind: ClaudeProfileResource["kind"], zh: boolean) {
  if (kind === "skill") return "Claude Code Skill";
  if (kind === "plugin") return "Claude Code Plugin";
  return zh ? "Claude Code MCP 服务器" : "Claude Code MCP server";
}

function emptyText(tab: ResourceTab, zh: boolean) {
  if (tab === "skills") return zh ? "没有发现可由全局方案管理的个人 Skills。" : "No personal Skills are available for global profiles.";
  if (tab === "plugins") return zh ? "没有发现用户范围的 Plugins。" : "No user-scope Plugins are available.";
  return zh ? "没有发现全局 MCP Servers。" : "No global MCP servers are available.";
}

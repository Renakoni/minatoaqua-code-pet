import React, { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
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
import {
  createEmptyClaudeProfilesSnapshot,
  type ClaudeProfile,
  type ClaudeProfileResource,
  type ClaudeProfileSaveInput,
  type ClaudeProfilesSnapshot
} from "../../../../shared/claudeProfiles";
import type { CompanionSettings } from "../../../shared/events";
import { useI18n } from "../../useI18n";
import { ConfirmDialog } from "../claude-routing/ConfirmDialog";
import { RoutingToaster } from "../claude-routing/RoutingToaster";
import { ClaudeProfileEditor } from "./ClaudeProfileEditor";
import {
  filterProfileResources,
  unavailableProfileResources,
  type ClaudeProfileResourceTab
} from "./claudeProfileResources";
import { useVirtualRows } from "./useVirtualRows";

type ResourceTab = ClaudeProfileResourceTab;
type BusyAction = "refresh" | "save" | "delete" | "apply" | null;

const emptySnapshot: ClaudeProfilesSnapshot = createEmptyClaudeProfilesSnapshot();

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
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileQuery, setProfileQuery] = useState("");
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
  const profileOptions = useMemo(() => {
    const needle = profileQuery.trim().toLocaleLowerCase();
    return snapshot.profiles
      .filter(profile => !needle || profile.name.toLocaleLowerCase().includes(needle))
      .sort((left, right) => {
        if (left.id === selectedProfile?.id) return -1;
        if (right.id === selectedProfile?.id) return 1;
        const groupDelta = profileNameSortGroup(left.name) - profileNameSortGroup(right.name);
        return groupDelta || left.name.localeCompare(right.name, "en", { numeric: true, sensitivity: "base" });
      });
  }, [profileQuery, selectedProfile?.id, snapshot.profiles]);

  const tabs = [
    { id: "skills" as const, label: "Skills", icon: Code2 },
    { id: "plugins" as const, label: "Plugins", icon: Package },
    { id: "mcpServers" as const, label: "MCP", icon: Server }
  ];
  const activeTabLabel = tabs.find(tab => tab.id === activeTab)?.label ?? activeTab;
  const items = useMemo(() => {
    const availableResources = snapshot.inventory[activeTab];
    const memberIds = selectedProfile?.[activeTab] ?? [];
    const members = new Set(memberIds);
    return [
      ...availableResources.filter(item => members.has(item.id)),
      ...unavailableProfileResources(memberIds, availableResources, activeTab, zh)
    ];
  }, [activeTab, selectedProfile, snapshot.inventory, zh]);
  const filteredItems = useMemo(
    () => filterProfileResources(items, deferredQuery, settings.hideSensitiveContent),
    [deferredQuery, items, settings.hideSensitiveContent]
  );

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
      <div className="claude-profile-top-row">
        <section className="claude-profile-toolbar">
          <div className="claude-profile-picker">
            <span>{zh ? "方案" : "Profile"}</span>
            <div className="claude-profile-dropdown" onBlur={event => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setProfileMenuOpen(false);
            }} onKeyDown={event => {
              if (event.key === "Escape") setProfileMenuOpen(false);
            }}>
              <button
                type="button"
                className="claude-profile-select-button"
                onClick={() => {
                  setNewMenuOpen(false);
                  if (!profileMenuOpen) setProfileQuery("");
                  setProfileMenuOpen(!profileMenuOpen);
                }}
                disabled={!profileActionsAvailable || busyAction !== null}
                aria-haspopup="listbox"
                aria-expanded={profileMenuOpen}
                aria-label={zh ? `方案：${selectedProfile?.name ?? ""}` : `Profile: ${selectedProfile?.name ?? ""}`}
              >
                <span>{selectedProfile?.name ?? ""}</span>
                <ChevronDown size={15} aria-hidden="true" />
              </button>
              {profileMenuOpen ? (
                <div className="claude-profile-options">
                  <label className="claude-profile-options-search">
                    <Search size={13} aria-hidden="true" />
                    <input
                      value={profileQuery}
                      onChange={event => setProfileQuery(event.target.value)}
                      placeholder={zh ? "搜索方案" : "Search profiles"}
                      aria-label={zh ? "搜索方案" : "Search profiles"}
                      autoFocus
                    />
                  </label>
                  <div className="claude-profile-options-list" role="listbox" aria-label={zh ? "配置方案" : "Profiles"}>
                    {profileOptions.length === 0 ? (
                      <span className="claude-profile-options-empty">{zh ? "没有匹配方案" : "No matching profiles"}</span>
                    ) : profileOptions.map(profile => {
                      const current = profile.id === selectedProfile?.id;
                      return (
                        <button
                          type="button"
                          role="option"
                          aria-selected={current}
                          key={profile.id}
                          className={current ? "current" : undefined}
                          onClick={() => {
                            setProfileMenuOpen(false);
                            if (!current || snapshot.drift.isDrifted) void switchProfile(profile.id, profile.name);
                          }}
                        >
                          <span>{profile.name}</span>
                          {current ? <Check size={13} aria-hidden="true" /> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="claude-profile-toolbar-actions">
            <button type="button" className="claude-profile-icon-button" onClick={() => selectedProfile && startEdit(selectedProfile)} disabled={!profileActionsAvailable || !selectedProfile || busyAction !== null} aria-label={zh ? "编辑配置方案" : "Edit profile"} title={zh ? "编辑" : "Edit"}>
              <Pencil size={16} />
            </button>
            <div className="claude-profile-new-menu" onBlur={event => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setNewMenuOpen(false);
            }}>
              <button type="button" className="claude-profile-icon-button" onClick={() => {
                setProfileMenuOpen(false);
                setNewMenuOpen(open => !open);
              }} disabled={!profileActionsAvailable || busyAction !== null} aria-label={zh ? "新建配置方案" : "New profile"} aria-haspopup="menu" aria-expanded={newMenuOpen} title={zh ? "新建" : "New"}>
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

        <nav className="claude-resource-subtabs compact claude-profile-resource-tabs" aria-label={zh ? "资源类型" : "Resource type"}>
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button type="button" key={tab.id} className={`claude-resource-subtab ${activeTab === tab.id ? "active" : ""}`} onClick={() => setActiveTab(tab.id)}>
                <Icon size={16} />
                <span><b>{tab.label}</b></span>
                <small>{selectedProfile?.[tab.id].length ?? 0}</small>
              </button>
            );
          })}
        </nav>
      </div>

      {snapshot.mcpStatus !== "ready" ? (
        <section className="claude-profile-unavailable"><AlertTriangle size={16} />{snapshot.mcpStatus === "config-unreadable" ? (zh ? "暂时无法读取 ~/.claude.json，方案操作已暂停。" : "~/.claude.json is temporarily unreadable. Profile actions are paused.") : (zh ? "MCP 保全清单暂时不可用，方案操作已暂停。" : "The MCP preservation inventory is unavailable. Profile actions are paused.")}</section>
      ) : null}
      {loadError || actionError ? <section className="connection-error"><PlugZap size={18} />{loadError ?? actionError}</section> : null}

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
  loading,
  emptyLabel,
  hideSensitiveContent,
  zh,
  resetKey
}: {
  items: ClaudeProfileResource[];
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

function ResourceRow({ item, hideSensitiveContent, zh, style }: { item: ClaudeProfileResource; hideSensitiveContent: boolean; zh: boolean; style?: React.CSSProperties }) {
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
      <div className="claude-resource-status active">
        <span>{zh ? "已启用" : "Enabled"}</span>
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

function profileNameSortGroup(name: string) {
  const first = name.trim().charAt(0);
  if (!first || /^[0-9]$/.test(first) || !/^\p{L}$/u.test(first)) return 0;
  if (/^[A-Za-z]$/.test(first)) return 1;
  return 2;
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
  if (tab === "skills") return zh ? "当前方案未启用 Skills。" : "No Skills are enabled in this profile.";
  if (tab === "plugins") return zh ? "当前方案未启用 Plugins。" : "No Plugins are enabled in this profile.";
  return zh ? "当前方案未启用 MCP。" : "No MCP servers are enabled in this profile.";
}

// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { Play, RefreshCw, Search, Terminal, TriangleAlert } from "lucide-react";
import type { ClaudeSessionDetail, ClaudeSessionIndexItem, ClaudeSessionSnapshot } from "../../../shared/events";
import { useI18n } from "../../useI18n";

const emptySnapshot: ClaudeSessionSnapshot = {
  sessions: [],
  scannedAt: 0,
  projectsDir: "~/.claude/projects"
};

export function SessionsPage() {
  const { locale } = useI18n();
  const zh = locale === "zh";
  const [snapshot, setSnapshot] = useState<ClaudeSessionSnapshot>(emptySnapshot);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [detail, setDetail] = useState<ClaudeSessionDetail | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh(force = false) {
    setLoading(true);
    setError(null);
    try {
      const next = await window.companion.getClaudeSessions(force);
      const safe = next ?? emptySnapshot;
      setSnapshot(safe);
      setSelectedPath(current => current ?? safe.sessions?.[0]?.filePath ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  const filteredSessions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return snapshot.sessions;
    return snapshot.sessions.filter(session => [
      session.title,
      session.firstPrompt,
      session.projectName,
      session.projectPath,
      session.sessionId,
      session.model,
      session.branch
    ].filter(Boolean).join(" ").toLowerCase().includes(needle));
  }, [query, snapshot.sessions]);

  const selected = filteredSessions.find(session => session.filePath === selectedPath) ?? filteredSessions[0] ?? null;
  const previewMessages = useMemo(() => {
    return (detail?.messages ?? []).filter(message => {
      const text = message.text.trim();
      if (!text) return false;
      if (/^(PowerShell|Bash|Shell|cmd)$/i.test(text)) return false;
      return message.role === "user" || message.role === "assistant";
    });
  }, [detail?.messages]);

  useEffect(() => {
    if (!selected?.filePath) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    window.companion.getClaudeSessionDetail(selected.filePath)
      .then(next => { if (!cancelled) setDetail(next); })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [selected?.filePath]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function resumeSession(session: ClaudeSessionIndexItem) {
    const command = `claude --resume ${session.sessionId}`;
    try {
      const result = await window.companion.resumeClaudeSession(session.sessionId, session.projectPath);
      if (result?.ok) {
        setToast(zh ? "已打开终端恢复会话" : "Opened terminal to resume");
        return;
      }
      await navigator.clipboard.writeText(result?.command || command);
      setToast(zh ? "终端未打开，已复制恢复命令" : "Could not open terminal; command copied");
    } catch {
      await navigator.clipboard.writeText(command);
      setToast(zh ? "已复制恢复命令" : "Resume command copied");
    }
  }

  return (
    <div className="claude-sessions-page">
      <nav className="session-viewer-toolbar">
        <div className="session-viewer-search">
          <Search size={16} />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder={zh ? "搜索会话、项目或 session id..." : "Search sessions, projects, or session id..."} />
          <span>{formatSessionCount(filteredSessions.length, snapshot.sessions.length, zh)}</span>
        </div>
        <button onClick={() => void refresh(true)} disabled={loading} title={zh ? "刷新" : "Refresh"}>
          <RefreshCw size={17} />
        </button>
      </nav>

      {error ? <section className="session-viewer-error"><TriangleAlert size={16} />{error}</section> : null}

      <section className="session-viewer-layout">
        <aside className="session-viewer-list">
          {loading ? (
            <div className="session-viewer-empty">{zh ? "正在扫描 ~/.claude/projects..." : "Scanning ~/.claude/projects..."}</div>
          ) : filteredSessions.length === 0 ? (
            <div className="session-viewer-empty">{zh ? "没有发现 Claude Code 历史会话。" : "No Claude Code sessions found."}</div>
          ) : filteredSessions.map(session => (
            <button key={session.filePath} className={`session-viewer-row ${selected?.filePath === session.filePath ? "active" : ""}`} onClick={() => setSelectedPath(session.filePath)}>
              <strong>{compactTitle(session.title)}</strong>
              <p className="session-viewer-project-path">{session.projectPath || session.projectName}</p>
              <footer>
                <em className={session.status}>{session.status}</em>
                <span>{session.messageCount} {zh ? "条事件" : "events"}</span>
                <time>{formatTime(session.lastMessageAt)}</time>
              </footer>
            </button>
          ))}
        </aside>

        <article className="session-viewer-detail">
          {selected ? (
            <>
              <header>
                <div>
                  <h2>{selected.title}</h2>
                </div>
                <div className="session-viewer-actions">
                  <button className="session-resume-button" onClick={() => void resumeSession(selected)}><Play size={14} />{zh ? "恢复" : "Resume"}</button>
                </div>
              </header>

              <div className="session-viewer-meta">
                <Meta label="Model" value={selected.model || unknownValue(zh)} />
                <Meta label={zh ? "Git 分支" : "Git branch"} value={selected.branch || unknownValue(zh)} />
                <Meta label={zh ? "消息" : "Messages"} value={String(detail?.totalMessages ?? selected.messageCount)} />
                <Meta label={zh ? "最后活动" : "Last activity"} value={formatDateTime(selected.lastMessageAt)} />
              </div>

              <div className="session-message-list" aria-busy={detailLoading}>
                {detailLoading ? <div className="session-viewer-empty small">{zh ? "加载消息中..." : "Loading messages..."}</div> : null}
                {!detailLoading && previewMessages.length === 0 ? <div className="session-viewer-empty small">{zh ? "没有可预览的消息。" : "No messages to preview."}</div> : null}
                {previewMessages.map(message => (
                  <section key={message.id} className={`session-message-row ${message.role}`}>
                    <div>
                      <strong>{roleLabel(message.role, zh)}</strong>
                      {message.timestamp ? <time>{formatTime(message.timestamp)}</time> : null}
                    </div>
                    <p>{message.text}</p>
                  </section>
                ))}
              </div>
            </>
          ) : (
            <div className="session-viewer-empty"><Terminal size={18} />{zh ? "选择一个会话查看详情。" : "Select a session to view details."}</div>
          )}
        </article>
      </section>

      {toast ? <div className="session-toast">{toast}</div> : null}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function compactTitle(title: string) {
  const normalized = (title || "").replace(/\s+/g, " ").trim();
  return normalized || "Untitled session";
}

function formatSessionCount(filtered: number, total: number, zh: boolean) {
  if (filtered === total) return zh ? `${total} 项` : `${total} items`;
  return zh ? `${filtered} / ${total} 项` : `${filtered} / ${total} items`;
}

function unknownValue(zh: boolean) {
  return zh ? "未知" : "unknown";
}

function roleLabel(role: string, zh: boolean) {
  if (role === "assistant") return "Claude";
  if (!zh) return role;
  if (role === "user") return "用户";
  if (role === "system") return "记录";
  return role;
}

function shortId(id: string) {
  return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

function formatTime(timestamp: number) {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(timestamp: number) {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleString();
}

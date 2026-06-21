import { PetEvent } from "../../shared/events";

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return <span className={ok ? "doctor-pill ok" : "doctor-pill bad"}>{label}</span>;
}

export function DoctorPanel({ events, eventPort, startedAt }: { events: PetEvent[]; eventPort: number; startedAt: number }) {
  const latest = events[0];
  const connected = Boolean(latest && Date.now() - latest.timestamp < 90_000);
  const rows = [
    ["事件服务", `监听 ${eventPort}`, true],
    ["最近连接", connected ? "90 秒内收到事件" : "等待 Claude Code 事件", connected],
    ["Hook 配置", "手动 hooks 模式", true],
    ["Hook 命令", "scripts/hook-forwarder.js", true],
    ["Forwarder", "scripts/hook-forwarder.js", true],
    ["自动启动", "未开启", true],
    ["自动更新", "未开启", true],
    ["更新状态", "等待自动检查", true],
    ["插件", "0/0 已启用, 0 manifest 错误", true]
  ] as const;

  return (
    <div className="panel-group-card">
      <div className="panel-header">
        <h3 className="panel-title">诊断中心</h3>
        <button className="ghost-btn">重新检查</button>
      </div>
      <div className="doctor-grid">
        {rows.map(([name, value, ok]) => (
          <div key={name} className="doctor-row">
            <strong>{name}</strong>
            <p title={String(value)}>{value}</p>
            <StatusPill ok={!!ok} label={ok ? "OK" : "Check"} />
          </div>
        ))}
      </div>
      <div className="panel-divider" />
      <div className="doctor-summary">
        <div><strong>版本</strong><span>0.1.0</span></div>
        <div><strong>最近事件</strong><span>{latest?.title ?? "暂无"}</span></div>
        <div><strong>生成时间</strong><span>{new Date(startedAt).toLocaleString()}</span></div>
      </div>
      {!connected && <p className="note">可在 hooks 区域使用安装/修复按钮重新配置 Claude Code hooks。</p>}
    </div>
  );
}

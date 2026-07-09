export interface PermissionRequestView {
  id: string;
  tool: string;
  detail?: string;
}

interface PermissionCardProps {
  request: PermissionRequestView;
  queueCount?: number;
  onAllow: () => void;
  onDeny: () => void;
}

type RiskLevel = "low" | "medium" | "high";

const riskLabels: Record<RiskLevel, string> = { low: "Low", medium: "Review", high: "Caution" };

/** Longest raw detail we render — the scroll box shows it, but a pathological
 *  mega-string (a whole file, a 1MB patch) is capped so layout/perf stay sane. */
const DETAIL_CAP = 1200;

function getRiskLevel(tool: string, detail: string): RiskLevel {
  const value = `${tool} ${detail}`.toLowerCase();
  if (/bash|shell|powershell|cmd|terminal|rm |sudo|curl|wget|del /.test(value)) return "high";
  if (/edit|write|notebookedit|multiedit|apply/.test(value)) return "medium";
  return "low";
}

/** A short human action for the headline, so the card reads as intent, not internals. */
function actionForTool(tool: string): string {
  const t = tool.toLowerCase();
  if (t === "bash" || t === "shell") return "Run a command";
  if (t === "edit" || t === "write" || t === "multiedit" || t === "update") return "Edit a file";
  if (t === "notebookedit") return "Edit a notebook";
  if (t === "read") return "Read a file";
  if (t === "webfetch") return "Fetch a URL";
  if (t === "websearch") return "Search the web";
  if (t === "applypatch") return "Apply a patch";
  if (t === "mcp") return "Use an MCP tool";
  return `Use ${tool}`;
}

export function PermissionCard({ request, queueCount = 0, onAllow, onDeny }: PermissionCardProps) {
  const rawDetail = (request.detail ?? "").trim();
  const detail = rawDetail.length > DETAIL_CAP ? `${rawDetail.slice(0, DETAIL_CAP)}…` : rawDetail;
  const risk = getRiskLevel(request.tool, rawDetail);

  return (
    <section className={`pet-bubble permission-card risk-${risk}`} aria-label="Permission request" role="alertdialog">
      <header className="permission-head">
        <span className="permission-eyebrow">
          <span className="permission-dot" aria-hidden="true" />
          Permission request
        </span>
        <span className="permission-risk">{riskLabels[risk]}</span>
      </header>

      <div className="permission-body">
        <p className="permission-action">{actionForTool(request.tool)}</p>
        <span className="permission-tool-chip">{request.tool || "Tool"}</span>
      </div>

      {detail ? <pre className="permission-detail">{detail}</pre> : null}

      <footer className="permission-foot">
        {queueCount > 1 ? <span className="permission-queue">+{queueCount - 1} more waiting</span> : <span />}
        <div className="permission-actions">
          <button type="button" className="permission-deny" onClick={onDeny}>Deny</button>
          <button type="button" className="permission-allow" onClick={onAllow}>Allow</button>
        </div>
      </footer>
    </section>
  );
}

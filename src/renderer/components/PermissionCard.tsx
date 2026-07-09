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

const riskLabels: Record<RiskLevel, string> = {
  low: "Low risk",
  medium: "Medium risk",
  high: "High risk"
};

function getRiskLevel(request: PermissionRequestView): RiskLevel {
  const value = `${request.tool} ${request.detail ?? ""}`.toLowerCase();
  if (/bash|shell|powershell|cmd|terminal/.test(value)) return "high";
  if (/edit|write|notebookedit/.test(value)) return "medium";
  return "low";
}

export function PermissionCard({ request, queueCount = 0, onAllow, onDeny }: PermissionCardProps) {
  const risk = getRiskLevel(request);
  const detail = request.detail ?? "Waiting for permission";

  return (
    <section className={`permission-card risk-${risk}`} aria-label="Permission request">
      <div className="permission-card-topline">
        <span className="permission-label">Permission</span>
        <span className="permission-risk">{riskLabels[risk]}</span>
      </div>
      <div className="permission-tool">{request.tool || "Tool request"}</div>
      <div className="permission-detail">{detail}</div>
      {queueCount > 1 ? <div className="permission-queue">{queueCount - 1} more waiting</div> : null}
      <div className="permission-actions">
        <button type="button" className="permission-deny" onClick={onDeny}>Deny</button>
        <button type="button" className="permission-allow" onClick={onAllow}>Allow</button>
      </div>
    </section>
  );
}

import { PetEvent } from "../../shared/events";

interface PermissionCardProps {
  event: PetEvent | null;
}

type RiskLevel = "low" | "medium" | "high";

const riskLabels: Record<RiskLevel, string> = {
  low: "Low risk",
  medium: "Medium risk",
  high: "High risk"
};

function getRiskLevel(event: PetEvent | null): RiskLevel {
  const value = `${event?.tool ?? ""} ${event?.detail ?? ""}`.toLowerCase();

  if (/bash|shell|powershell|cmd|terminal/.test(value)) return "high";
  if (/edit|write|notebookedit/.test(value)) return "medium";
  return "low";
}

export function PermissionCard({ event }: PermissionCardProps) {
  const risk = getRiskLevel(event);
  const tool = event?.tool ?? "Tool request";
  const detail = event?.detail ?? event?.message ?? "Waiting for permission";

  return (
    <section className={`permission-card risk-${risk}`} aria-label="Permission request">
      <div className="permission-card-topline">
        <span className="permission-label">Permission</span>
        <span className="permission-risk">{riskLabels[risk]}</span>
      </div>
      <div className="permission-tool">{tool}</div>
      <div className="permission-detail">{detail}</div>
      <div className="permission-actions" aria-label="Permission actions preview">
        <button disabled>Allow</button>
        <button disabled>Deny</button>
      </div>
    </section>
  );
}

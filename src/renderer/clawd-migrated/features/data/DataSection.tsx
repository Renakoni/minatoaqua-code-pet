// @ts-nocheck
import React from "react";
import { Code2, Gauge } from "lucide-react";
import { useI18n } from "../../useI18n";
import { StatsPanel } from "../../components/StatsPanel";
import { TokenPanel } from "./TokenPanel";

export function DataSection({ persistedStats }: { persistedStats: any }) {
  const { t } = useI18n();

  return (
    <section className="data-workbench">
      <section className="workbench-section data-runtime-section">
        <header className="workbench-section-head">
          <div>
            <span>Runtime</span>
            <h2>{t("sections.runtimeStats", "运行统计")}</h2>
          </div>
          <Gauge size={18} />
        </header>
        {persistedStats ? <StatsPanel stats={persistedStats} /> : <p className="note">{t("common.loading", "加载中...")}</p>}
      </section>

      <section className="workbench-section data-token-section">
        <header className="workbench-section-head">
          <div>
            <span>Claude Code</span>
            <h2>{t("sections.tokenUsage", "Token 用量")}</h2>
          </div>
          <Code2 size={18} />
        </header>
        <TokenPanel />
      </section>
    </section>
  );
}

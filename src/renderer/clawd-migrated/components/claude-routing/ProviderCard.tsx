import React from "react";
import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import { Activity, Check, GripVertical, Pencil, Play, Terminal, Trash2 } from "lucide-react";
import { useI18n } from "../../useI18n";
import type { ClaudeProvider, DragHandleProps } from "./types";

type ProviderActionHandlers = {
  onSwitch: (provider: ClaudeProvider) => void;
  onEdit: (provider: ClaudeProvider) => void;
  onTest: (provider: ClaudeProvider) => void;
  onTerminal: (provider: ClaudeProvider) => void;
  onRemove: (provider: ClaudeProvider) => void;
};

function ProviderIconBlock({ provider }: { provider: ClaudeProvider }) {
  const label = provider.icon === "anthropic" ? "AI" : provider.name.slice(0, 1).toUpperCase();
  return (
    <div className="ccs-provider-icon" style={{ color: provider.iconColor || undefined }}>
      {label}
    </div>
  );
}

function ClaudeProviderActions({
  provider,
  isCurrent,
  canRemove,
  onSwitch,
  onEdit,
  onTest,
  onTerminal,
  onRemove
}: {
  provider: ClaudeProvider;
  isCurrent: boolean;
  canRemove: boolean;
} & ProviderActionHandlers) {
  const { t } = useI18n();

  return (
    <div className="ccs-provider-actions-inner">
      <span className={isCurrent ? "ccs-provider-action-wrap disabled" : "ccs-provider-action-wrap"}>
        <button className={`ccs-provider-main-action ${isCurrent ? "current" : ""}`} onClick={() => onSwitch(provider)} disabled={isCurrent} title={isCurrent ? t("routing.currentRoute", "Current route") : t("routing.switchRoute", "Switch route")}>
          {isCurrent ? <Check size={16} /> : <Play size={16} />}
          <span>{isCurrent ? t("routing.inUse", "In use") : t("routing.switch", "Switch")}</span>
        </button>
      </span>
      <div className="ccs-provider-icon-actions">
        <button onClick={() => onEdit(provider)} title={t("common.edit", "Edit")}><Pencil size={16} /></button>
        <button onClick={() => onTest(provider)} title={t("routing.testConnection", "Test connection")}><Activity size={16} /></button>
        <button onClick={() => onTerminal(provider)} title={t("routing.openTerminal", "Open terminal")}><Terminal size={16} /></button>
        <button onClick={() => onRemove(provider)} disabled={!canRemove} title={t("common.delete", "Delete")}><Trash2 size={16} /></button>
      </div>
    </div>
  );
}

function ClaudeProviderCard({
  provider,
  isCurrent,
  canRemove,
  dragHandleProps,
  onSwitch,
  onEdit,
  onTest,
  onTerminal,
  onRemove
}: {
  provider: ClaudeProvider;
  isCurrent: boolean;
  canRemove: boolean;
  dragHandleProps?: DragHandleProps;
} & ProviderActionHandlers) {
  const { t } = useI18n();
  const displayUrl = provider.notes || provider.websiteUrl || provider.settingsConfig.env?.ANTHROPIC_BASE_URL || t("routing.noEndpoint", "No endpoint configured");
  const isOfficial = provider.category === "official";
  const isRouted = provider.category !== "official" && provider.settingsConfig.env?.ANTHROPIC_BASE_URL;
  const categoryLabel = isOfficial ? t("routing.categoryOfficial", "Official") : isRouted ? t("routing.categoryRouted", "Routed") : t("routing.categoryUnconfigured", "Unconfigured");

  return (
    <div className={`ccs-provider-card ${isCurrent ? "active" : ""} ${dragHandleProps?.isDragging ? "dragging" : ""}`}>
      <div className="ccs-provider-gradient" />
      <div className="ccs-provider-content">
        <div className="ccs-provider-left">
          <button className="ccs-drag-handle" aria-label={t("routing.dragSort", "Drag to reorder")} {...(dragHandleProps?.attributes ?? {})} {...(dragHandleProps?.listeners ?? {})}>
            <GripVertical size={16} />
          </button>
          <ProviderIconBlock provider={provider} />
          <div className="ccs-provider-main">
            <div className="ccs-provider-titleline">
              <h3>{provider.name}</h3>
              <span>{categoryLabel}</span>
            </div>
            <button className="ccs-provider-url" type="button" title={displayUrl}>{displayUrl}</button>
          </div>
        </div>
        <div className="ccs-provider-actions">
          <ClaudeProviderActions
            provider={provider}
            isCurrent={isCurrent}
            canRemove={canRemove}
            onSwitch={onSwitch}
            onEdit={onEdit}
            onTest={onTest}
            onTerminal={onTerminal}
            onRemove={onRemove}
          />
        </div>
      </div>
    </div>
  );
}

export function SortableClaudeProviderCard({
  provider,
  isCurrent,
  canRemove,
  onSwitch,
  onEdit,
  onTest,
  onTerminal,
  onRemove
}: {
  provider: ClaudeProvider;
  isCurrent: boolean;
  canRemove: boolean;
} & ProviderActionHandlers) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: provider.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  return (
    <div ref={setNodeRef} style={style}>
      <ClaudeProviderCard
        provider={provider}
        isCurrent={isCurrent}
        canRemove={canRemove}
        dragHandleProps={{ attributes, listeners, isDragging }}
        onSwitch={onSwitch}
        onEdit={onEdit}
        onTest={onTest}
        onTerminal={onTerminal}
        onRemove={onRemove}
      />
    </div>
  );
}

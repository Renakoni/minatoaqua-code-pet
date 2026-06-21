import React from "react";
import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import { Activity, Check, GripVertical, Pencil, Play, Terminal, Trash2 } from "lucide-react";
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
  return (
    <div className="ccs-provider-actions-inner">
      <span className={isCurrent ? "ccs-provider-action-wrap disabled" : "ccs-provider-action-wrap"}>
        <button className={`ccs-provider-main-action ${isCurrent ? "current" : ""}`} onClick={() => onSwitch(provider)} disabled={isCurrent} title={isCurrent ? "使用中" : "启用"}>
          {isCurrent ? <Check size={16} /> : <Play size={16} />}
          <span>{isCurrent ? "使用中" : "启用"}</span>
        </button>
      </span>
      <div className="ccs-provider-icon-actions">
        <button onClick={() => onEdit(provider)} title="编辑"><Pencil size={16} /></button>
        <button onClick={() => onTest(provider)} title="检测连通"><Activity size={16} /></button>
        <button onClick={() => onTerminal(provider)} title="打开终端"><Terminal size={16} /></button>
        <button onClick={() => onRemove(provider)} disabled={!canRemove} title="删除"><Trash2 size={16} /></button>
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
  const displayUrl = provider.notes || provider.websiteUrl || provider.settingsConfig.env?.ANTHROPIC_BASE_URL || "未配置接口地址";
  const isOfficial = provider.category === "official";
  const isRouted = provider.category !== "official" && provider.settingsConfig.env?.ANTHROPIC_BASE_URL;

  return (
    <div className={`ccs-provider-card ${isCurrent ? "active" : ""} ${dragHandleProps?.isDragging ? "dragging" : ""}`}>
      <div className="ccs-provider-gradient" />
      <div className="ccs-provider-content">
        <div className="ccs-provider-left">
          <button className="ccs-drag-handle" aria-label="拖拽排序" {...(dragHandleProps?.attributes ?? {})} {...(dragHandleProps?.listeners ?? {})}>
            <GripVertical size={16} />
          </button>
          <ProviderIconBlock provider={provider} />
          <div className="ccs-provider-main">
            <div className="ccs-provider-titleline">
              <h3>{provider.name}</h3>
              {isOfficial ? <span>不支持路由</span> : isRouted ? <span>需要路由</span> : null}
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

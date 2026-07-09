import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { useI18n } from "../../useI18n";
import { iconList } from "./icons";
import { getIconMetadata, searchIcons } from "./icons/metadata";
import { ProviderIcon } from "./ProviderIcon";

/**
 * Icon picker modal ported from cc-switch's IconPicker: keyword search over
 * the brand icon registry, grid of icons with display names.
 */
export function IconPicker({
  value,
  onSelect,
  onClose
}: {
  value?: string;
  onSelect: (icon: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");

  const filteredIcons = useMemo(() => (query.trim() ? searchIcons(query.trim()) : iconList), [query]);

  return (
    <div className="ccs-confirm-backdrop" role="presentation" onClick={onClose}>
      <div className="ccs-icon-picker" role="dialog" aria-modal="true" aria-label={t("routing.iconPickerTitle", "选择图标")} onClick={event => event.stopPropagation()}>
        <header>
          <h3>{t("routing.iconPickerTitle", "选择图标")}</h3>
          <input
            autoFocus
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={t("routing.iconPickerSearch", "输入图标名称…")}
            aria-label={t("routing.iconPickerSearch", "输入图标名称…")}
          />
          <button type="button" className="ccs-icon-picker-close" onClick={onClose} aria-label={t("common.cancel", "取消")}><X size={16} /></button>
        </header>
        <div className="ccs-icon-picker-grid">
          {filteredIcons.map(iconName => {
            const meta = getIconMetadata(iconName);
            return (
              <button
                key={iconName}
                type="button"
                className={`ccs-icon-picker-item ${value === iconName ? "active" : ""}`}
                title={meta?.displayName || iconName}
                onClick={() => { onSelect(iconName); onClose(); }}
              >
                <ProviderIcon icon={iconName} name={meta?.displayName || iconName} size={28} />
                <span>{meta?.displayName || iconName}</span>
              </button>
            );
          })}
          {filteredIcons.length === 0 ? (
            <div className="ccs-icon-picker-empty">{t("routing.iconPickerNoResults", "未找到匹配的图标")}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

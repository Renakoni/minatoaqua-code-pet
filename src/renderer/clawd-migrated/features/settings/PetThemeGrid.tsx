import React, { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useI18n } from "../../useI18n";
import { SpritesheetSprite } from "../../../components/SpritesheetSprite";
import minatoAquaCover from "../../../assets/themes/minato-aqua-cover.png";
import type { PetPackManifest } from "../../../../shared/petPack";
import { spritesheetAssetsFromPack } from "../../../../shared/petPackAssets";
import { BUILTIN_PET_THEME_ID, packIdFromThemeId } from "../../../../shared/petThemeCatalog";
import { displayedSpriteHeight } from "../../../../shared/spriteFrame";
import { listPetThemes, type PetThemeDefinition } from "../../utils/petThemes";
import { PetImportDialog } from "./PetImportDialog";

const REMOVE_ARM_TIMEOUT_MS = 4000;

const builtinCovers: Record<string, string> = {
  [BUILTIN_PET_THEME_ID]: minatoAquaCover
};

/**
 * Theme picker for Settings → Desktop Pet: built-in themes, installed pet
 * packs (with a safely two-step remove), and the import entry (file picker
 * and drag-drop). Selection and removal are separate sibling buttons; the
 * armed remove state shows visible confirmation text, is announced via a
 * live region, disarms on blur/Escape/timeout, and the active theme only
 * changes after a deletion actually succeeded.
 */
export function PetThemeGrid({ activeThemeId, petPacks, onSelectTheme, refreshPetPacks }: {
  activeThemeId: string;
  petPacks: PetPackManifest[];
  onSelectTheme: (themeId: string) => void;
  refreshPetPacks: () => void;
}) {
  const { t } = useI18n();
  const [importZipPath, setImportZipPath] = useState<string | null>(null);
  const [armedRemoveId, setArmedRemoveId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  // Visible notices lead with a localized headline; raw main-process strings
  // (filesystem errors, cleanup warnings) are technical detail only.
  const [notice, setNotice] = useState<{ headline: string; detail?: string } | null>(null);
  const [statusMessage, setStatusMessage] = useState("");

  // A stale first click must never turn a later stray click into a deletion.
  useEffect(() => {
    if (!armedRemoveId) return;
    const timer = setTimeout(() => setArmedRemoveId(null), REMOVE_ARM_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [armedRemoveId]);

  function disarm() {
    setArmedRemoveId(null);
  }

  async function handleRemove(theme: PetThemeDefinition) {
    if (removingId) return;
    if (armedRemoveId !== theme.id) {
      setArmedRemoveId(theme.id);
      setStatusMessage(t("petImport.removeConfirm", "再次点击确认移除"));
      return;
    }
    setArmedRemoveId(null);
    setRemovingId(theme.id);
    try {
      const packId = packIdFromThemeId(theme.id);
      const result = packId
        ? await window.companion.removePetPack(packId)
        : { ok: false as const, error: t("petImport.removeFailed", "移除失败") };
      if (result.ok) {
        // Only a successful deletion may change the selection; the pet
        // window falls back gracefully during the refresh.
        if (activeThemeId === theme.id) onSelectTheme(BUILTIN_PET_THEME_ID);
        setNotice(null);
        setStatusMessage(t("petImport.removed", "已移除"));
      } else {
        setNotice({ headline: t("petImport.removeFailed", "移除失败"), detail: result.error });
        setStatusMessage(t("petImport.removeFailed", "移除失败"));
      }
    } catch {
      setNotice({ headline: t("petImport.removeFailed", "移除失败") });
      setStatusMessage(t("petImport.removeFailed", "移除失败"));
    } finally {
      setRemovingId(null);
      refreshPetPacks();
    }
  }

  async function beginImportFromPicker() {
    try {
      const zipPath = await window.companion.pickPetPackFile();
      if (zipPath) setImportZipPath(zipPath);
    } catch {
      setNotice({ headline: t("petImport.ipcFailed", "导入服务不可用，请重试") });
      setStatusMessage(t("petImport.ipcFailed", "导入服务不可用，请重试"));
    }
  }

  function beginImportFromDrop(event: React.DragEvent) {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    const zipPath = window.companion.getPetPackFilePath(file);
    if (zipPath) setImportZipPath(zipPath);
  }

  function handleImported(themeId: string, warning?: string) {
    setImportZipPath(null);
    setNotice(warning ? { headline: t("petImport.installedWithWarning", "已安装，但有警告"), detail: warning } : null);
    setStatusMessage(warning ? t("petImport.installedWithWarning", "已安装，但有警告") : t("petImport.installedStatus", "已安装"));
    refreshPetPacks();
    onSelectTheme(themeId);
  }

  return (
    <>
      <div className="pet-theme-grid" onDragOver={event => event.preventDefault()} onDrop={beginImportFromDrop}>
        {listPetThemes(petPacks).map(theme => {
          const packId = packIdFromThemeId(theme.id);
          const pack = packId ? petPacks.find(candidate => candidate.id === packId) : undefined;
          const armed = armedRemoveId === theme.id;
          return (
            <div
              key={theme.id}
              className="pet-theme-card-wrap"
              onKeyDown={event => { if (event.key === "Escape") disarm(); }}
            >
              <button
                type="button"
                className={`pet-theme-card ${activeThemeId === theme.id ? "active" : ""}`}
                onClick={() => { disarm(); onSelectTheme(theme.id); }}
              >
                {pack ? <PackThemeCover pack={pack} /> : <img src={builtinCovers[theme.id]} alt="" draggable={false} />}
                <span className="pet-theme-card-copy">
                  <strong>{theme.displayName}</strong>
                  <small>{pack ? t("petImport.importedTheme", "导入宠物") : theme.characterName}</small>
                </span>
              </button>
              {pack ? (
                <button
                  type="button"
                  className={`pet-theme-remove ${armed ? "armed" : ""}`}
                  disabled={removingId !== null}
                  aria-label={armed ? t("petImport.removeConfirm", "再次点击确认移除") : t("petImport.remove", "移除")}
                  onClick={() => void handleRemove(theme)}
                  onBlur={() => { if (armed) disarm(); }}
                >
                  {armed ? <span className="pet-theme-remove-label">{t("petImport.removeArmedLabel", "确认移除")}</span> : <Trash2 size={13} />}
                </button>
              ) : null}
            </div>
          );
        })}
        <button type="button" className="pet-theme-card pet-theme-import-card" onClick={() => void beginImportFromPicker()}>
          <span className="pet-theme-import-mark"><Plus size={22} /></span>
          <span className="pet-theme-card-copy">
            <strong>{t("petImport.importCard", "导入宠物")}</strong>
            <small>{t("petImport.importHint", "Codex 宠物包 (.zip)")}</small>
          </span>
        </button>
      </div>
      <p className="pet-theme-status" role="status" aria-live="polite">{statusMessage}</p>
      {notice ? (
        <p className="pet-theme-notice">
          {notice.headline}
          {notice.detail ? <small className="pet-theme-notice-detail">{notice.detail}</small> : null}
        </p>
      ) : null}
      {importZipPath ? (
        <PetImportDialog zipPath={importZipPath} onClose={() => setImportZipPath(null)} onInstalled={handleImported} />
      ) : null}
    </>
  );
}

// Theme-card cover for an imported pack: the sheet's first idle frame,
// rendered statically through the same sprite component the pet uses.
function PackThemeCover({ pack }: { pack: PetPackManifest }) {
  const assets = spritesheetAssetsFromPack(pack);
  const idle = assets.animations.idle;
  const width = 96;
  const height = displayedSpriteHeight(assets.cellWidth, assets.cellHeight, width);
  if (!idle) return <span className="pet-theme-cover-sprite" style={{ width, height }} />;
  return (
    <span className="pet-theme-cover-sprite" style={{ width, height }}>
      <SpritesheetSprite
        sheetUrl={assets.sheetUrl}
        columns={assets.columns}
        rows={assets.rows}
        row={idle.row}
        frameCount={1}
        frameDurationMs={160}
        width={width}
        height={height}
        alt=""
      />
    </span>
  );
}

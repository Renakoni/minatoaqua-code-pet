import { useEffect, useRef, useState } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { json } from "@codemirror/lang-json";
import { oneDark } from "@codemirror/theme-one-dark";

/**
 * CodeMirror-based JSON editor, mirroring cc-switch's settingsConfig editor.
 * Controlled component: external `value` changes replace the document unless
 * the editor itself produced them.
 *
 * Syntax theme follows the app's data-theme: the default (light) highlight
 * suits the light panel, and oneDark is layered in for dark mode — otherwise
 * CodeMirror's light-tuned token colors render garishly on the dark surface.
 * A transparent background is forced after oneDark so the editor keeps sitting
 * on the panel's --ccs-editor-raised surface rather than oneDark's own near
 * black.
 */
function readDarkTheme(): boolean {
  return document.documentElement.getAttribute("data-theme") === "dark";
}

export function JsonConfigEditor({
  value,
  onChange,
  ariaLabel
}: {
  value: string;
  onChange: (next: string) => void;
  ariaLabel?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  const lastEmittedRef = useRef(value);
  onChangeRef.current = onChange;
  valueRef.current = value;
  const [dark, setDark] = useState(readDarkTheme);

  useEffect(() => {
    const observer = new MutationObserver(() => setDark(readDarkTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  // Rebuild the editor when the theme flips. `value` stays out of the deps
  // (that would rebuild on every keystroke); the latest text is read from
  // valueRef, so a theme swap preserves what the user has typed.
  useEffect(() => {
    if (!containerRef.current) return;
    const view = new EditorView({
      parent: containerRef.current,
      state: EditorState.create({
        doc: valueRef.current,
        extensions: [
          basicSetup,
          json(),
          EditorView.lineWrapping,
          ...(dark ? [oneDark] : []),
          EditorView.theme({
            "&": { backgroundColor: "transparent" },
            ".cm-scroller": { backgroundColor: "transparent" }
          }),
          EditorView.updateListener.of(update => {
            if (!update.docChanged) return;
            const text = update.state.doc.toString();
            lastEmittedRef.current = text;
            onChangeRef.current(text);
          })
        ]
      })
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [dark]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (value === lastEmittedRef.current) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    lastEmittedRef.current = value;
    view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
  }, [value]);

  return <div className="ccs-json-editor" ref={containerRef} role="textbox" aria-label={ariaLabel} />;
}

import { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { json } from "@codemirror/lang-json";

/**
 * CodeMirror-based JSON editor, mirroring cc-switch's settingsConfig editor.
 * Controlled component: external `value` changes replace the document unless
 * the editor itself produced them.
 */
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
  const lastEmittedRef = useRef(value);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current) return;
    const view = new EditorView({
      parent: containerRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          json(),
          EditorView.lineWrapping,
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
    // The editor owns its document after mount; `value` sync happens below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

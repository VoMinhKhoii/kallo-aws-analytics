'use client';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { Compartment } from '@codemirror/state';
import { html } from '@codemirror/lang-html';
import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark';
import { syntaxHighlighting } from '@codemirror/language';

export interface CodeEditorHandle { insert(text: string): void; focus(): void }

// The console's own grounds in both themes; only the syntax colours switch.
const frame = EditorView.theme({
  '&': { height: '100%', fontSize: '12.5px', color: 'var(--console-ink)', backgroundColor: 'var(--console-surface)' },
  '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', lineHeight: '1.6' },
  '.cm-gutters': { color: 'var(--console-faint)', backgroundColor: 'var(--console-surface)', borderRight: '1px solid var(--console-rule)' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--console-hover)' },
  '.cm-cursor': { borderLeftColor: 'var(--console-ink)' },
  '&.cm-focused': { outline: 'none' },
});
const darkSyntax = syntaxHighlighting(oneDarkHighlightStyle);
const isDark = () => document.documentElement.classList.contains('dark');

/** The HTML body editor: highlighting, tag completion, wrapping. Cmd/Ctrl+S is the page's. */
export const CodeEditor = forwardRef<CodeEditorHandle, { value: string; onChange: (value: string) => void; readOnly?: boolean; label: string }>(
  function CodeEditor({ value, onChange, readOnly = false, label }, ref) {
    const host = useRef<HTMLDivElement>(null);
    const view = useRef<EditorView | null>(null);
    const latest = useRef(onChange);
    latest.current = onChange;

    useEffect(() => {
      const theme = new Compartment();
      const v = new EditorView({
        parent: host.current!,
        doc: value,
        extensions: [
          basicSetup, html(), theme.of(isDark() ? darkSyntax : []), frame, EditorView.lineWrapping,
          EditorView.editable.of(!readOnly),
          EditorView.contentAttributes.of({ 'aria-label': label }),
          EditorView.updateListener.of(u => { if (u.docChanged) latest.current(u.state.doc.toString()); }),
        ],
      });
      view.current = v;
      // Follow the dashboard's light/dark toggle (a class on <html>).
      const watch = new MutationObserver(() => v.dispatch({ effects: theme.reconfigure(isDark() ? darkSyntax : []) }));
      watch.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      return () => { watch.disconnect(); v.destroy(); view.current = null; };
      // The editor owns its document; `value` only seeds it and syncs below.
    }, [readOnly, label]);

    // A new value from outside (template, translation, language switch).
    useEffect(() => {
      const v = view.current;
      if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
    }, [value]);

    useImperativeHandle(ref, () => ({
      insert(text: string) {
        const v = view.current; if (!v) return;
        const { from, to } = v.state.selection.main;
        const line = v.state.doc.lineAt(from);
        // Blocks go on their own line; inline bits (tags, links) go at the cursor.
        const block = text.startsWith('<') && !text.startsWith('<a ') && from === to && line.text.trim() !== '';
        const insert = block ? '\n' + text : text;
        v.dispatch({ changes: { from: block ? line.to : from, to: block ? line.to : to, insert }, selection: { anchor: (block ? line.to : from) + insert.length }, scrollIntoView: true });
        v.focus();
      },
      focus() { view.current?.focus(); },
    }), []);

    return <div ref={host} className="h-full min-h-0 overflow-hidden" />;
  });

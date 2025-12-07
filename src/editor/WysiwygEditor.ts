import { EditorState, Extension, StateEffect } from '@codemirror/state';
import { EditorView, ViewPlugin, ViewUpdate, Decoration, DecorationSet, WidgetType, keymap } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { history, historyKeymap, undo, redo } from '@codemirror/commands';
import { defaultKeymap } from '@codemirror/commands';
import { syntaxTree } from '@codemirror/language';

/**
 * Checkbox Widget for task lists
 */
class CheckboxWidget extends WidgetType {
    checked: boolean;
    pos: number;

    constructor(checked: boolean, pos: number) {
        super();
        this.checked = checked;
        this.pos = pos;
    }

    toDOM(view: EditorView): HTMLElement {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = this.checked;
        checkbox.className = 'cm-mw-checkbox';
        checkbox.setAttribute('data-pos', String(this.pos));

        // Make it interactive
        checkbox.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const pos = this.pos;
            const doc = view.state.doc;
            const line = doc.lineAt(pos);
            const lineText = line.text;

            // Find the [ ] or [x] in the line
            const taskMatch = lineText.match(/^(\s*[-*]\s+)\[([ x])\]/);
            if (taskMatch) {
                const bracketStart = line.from + taskMatch[1].length;
                const newChar = this.checked ? ' ' : 'x';
                view.dispatch({
                    changes: { from: bracketStart + 1, to: bracketStart + 2, insert: newChar },
                });
            }
        });

        return checkbox;
    }

    eq(other: CheckboxWidget): boolean {
        return other.checked === this.checked && other.pos === this.pos;
    }

    ignoreEvent(): boolean {
        return false;
    }
}

/**
 * True WYSIWYG Editor for Markwhen event descriptions
 *
 * Features:
 * - Inline formatting (bold, italic show as formatted, not as **text**)
 * - Syntax revealed only when cursor is on that line
 * - Full undo/redo support (Ctrl+Z, Ctrl+Shift+Z)
 * - Markdown language support
 */

// Decoration styles for formatted text
const boldMark = Decoration.mark({ class: 'cm-mw-bold' });
const italicMark = Decoration.mark({ class: 'cm-mw-italic' });
const strikeMark = Decoration.mark({ class: 'cm-mw-strikethrough' });
const codeMark = Decoration.mark({ class: 'cm-mw-code' });
const codeBlockMark = Decoration.mark({ class: 'cm-mw-codeblock' });
const codeBlockLineMark = Decoration.line({ class: 'cm-mw-codeblock-line' });
const linkMark = Decoration.mark({ class: 'cm-mw-link' });
const headingMark = Decoration.mark({ class: 'cm-mw-heading' });

// Hide decoration (makes text invisible but keeps it in document)
const hiddenMark = Decoration.mark({ class: 'cm-mw-hidden' });

/**
 * WYSIWYG ViewPlugin - handles inline decorations
 */
const wysiwygPlugin = ViewPlugin.fromClass(class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate) {
        if (update.docChanged || update.selectionSet || update.viewportChanged) {
            this.decorations = this.buildDecorations(update.view);
        }
    }

    buildDecorations(view: EditorView): DecorationSet {
        const decorations: any[] = [];
        const doc = view.state.doc;
        const cursorLine = view.state.selection.main.head;
        const cursorLineNumber = doc.lineAt(cursorLine).number;

        // First pass: identify code block ranges
        const codeBlockRanges: Array<{ start: number; end: number; startLine: number; endLine: number; lang: string }> = [];
        let inCodeBlock = false;
        let codeBlockStart = 0;
        let codeBlockStartLine = 0;
        let codeBlockLang = '';

        for (let i = 1; i <= doc.lines; i++) {
            const line = doc.line(i);
            const lineText = line.text;
            const fenceMatch = lineText.match(/^```(\w*)\s*$/);

            if (fenceMatch) {
                if (!inCodeBlock) {
                    // Opening fence
                    inCodeBlock = true;
                    codeBlockStart = line.from;
                    codeBlockStartLine = i;
                    codeBlockLang = fenceMatch[1] || '';
                } else {
                    // Closing fence
                    codeBlockRanges.push({
                        start: codeBlockStart,
                        end: line.to,
                        startLine: codeBlockStartLine,
                        endLine: i,
                        lang: codeBlockLang,
                    });
                    inCodeBlock = false;
                }
            }
        }

        // Process each line
        for (let i = 1; i <= doc.lines; i++) {
            const line = doc.line(i);
            const lineText = line.text;
            const isActiveLine = i === cursorLineNumber;

            // Check if this line is inside a code block
            const inBlock = codeBlockRanges.find(r => i >= r.startLine && i <= r.endLine);
            if (inBlock) {
                const isOpeningFence = i === inBlock.startLine;
                const isClosingFence = i === inBlock.endLine;
                const isFenceLine = isOpeningFence || isClosingFence;
                const cursorInBlock = cursorLineNumber >= inBlock.startLine && cursorLineNumber <= inBlock.endLine;

                // Add line decoration for code block background
                decorations.push(codeBlockLineMark.range(line.from));

                if (isFenceLine && !cursorInBlock) {
                    // Hide fence lines when cursor is not in the block
                    decorations.push(hiddenMark.range(line.from, line.to));
                } else if (!isFenceLine) {
                    // Style code content
                    if (line.to > line.from) {
                        decorations.push(codeBlockMark.range(line.from, line.to));
                    }
                }

                continue; // Skip other processing for code block lines
            }

            // Bold: **text** or __text__
            this.processPattern(
                lineText, line.from,
                /(\*\*|__)(.+?)\1/g,
                decorations, isActiveLine,
                boldMark, 2
            );

            // Italic: *text* or _text_ (but not ** or __)
            this.processPattern(
                lineText, line.from,
                /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)|(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g,
                decorations, isActiveLine,
                italicMark, 1
            );

            // Strikethrough: ~~text~~
            this.processPattern(
                lineText, line.from,
                /~~(.+?)~~/g,
                decorations, isActiveLine,
                strikeMark, 2
            );

            // Inline code: `text`
            this.processPattern(
                lineText, line.from,
                /`([^`]+)`/g,
                decorations, isActiveLine,
                codeMark, 1
            );

            // Headers: # ## ### etc (only hide # when not on line)
            const headerMatch = lineText.match(/^(#{1,6})\s/);
            if (headerMatch && !isActiveLine) {
                const hashLen = headerMatch[1].length;
                // Hide the hashes and space
                decorations.push(hiddenMark.range(line.from, line.from + hashLen + 1));
                // Style the rest as heading
                if (line.to > line.from + hashLen + 1) {
                    decorations.push(headingMark.range(line.from + hashLen + 1, line.to));
                }
            } else if (headerMatch && isActiveLine) {
                // Just style as heading, show syntax
                decorations.push(headingMark.range(line.from, line.to));
            }

            // Links: [text](url) - hide URL when not on line
            const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
            let linkMatch;
            while ((linkMatch = linkRegex.exec(lineText)) !== null) {
                const fullStart = line.from + linkMatch.index;
                const fullEnd = fullStart + linkMatch[0].length;
                const textStart = fullStart + 1;
                const textEnd = textStart + linkMatch[1].length;

                if (!isActiveLine) {
                    // Hide [ before text
                    decorations.push(hiddenMark.range(fullStart, textStart));
                    // Style link text
                    decorations.push(linkMark.range(textStart, textEnd));
                    // Hide ](url)
                    decorations.push(hiddenMark.range(textEnd, fullEnd));
                } else {
                    // Show full syntax but style the text part
                    decorations.push(linkMark.range(textStart, textEnd));
                }
            }

            // Task lists: - [ ] or - [x]
            const taskMatch = lineText.match(/^(\s*[-*]\s+)\[([ x])\](\s*)/);
            if (taskMatch) {
                const bulletStart = line.from;
                const bracketStart = line.from + taskMatch[1].length;
                const bracketEnd = bracketStart + 3; // [ ] or [x] is 3 chars
                const fullMatchEnd = line.from + taskMatch[0].length;
                const isChecked = taskMatch[2] === 'x';

                if (!isActiveLine) {
                    // Replace the entire "- [ ] " with just "• " + checkbox
                    // Hide the "- " bullet and "[ ] " syntax
                    decorations.push(hiddenMark.range(bulletStart, bracketStart));
                    // Replace [ ] or [x] with checkbox widget
                    decorations.push(Decoration.replace({
                        widget: new CheckboxWidget(isChecked, line.from),
                    }).range(bracketStart, bracketEnd));
                    // If checked, strike through the rest of the line
                    if (isChecked && line.to > fullMatchEnd) {
                        decorations.push(strikeMark.range(fullMatchEnd, line.to));
                    }
                } else {
                    // On active line - show syntax but still style checked items
                    if (isChecked && line.to > fullMatchEnd) {
                        decorations.push(strikeMark.range(fullMatchEnd, line.to));
                    }
                }
            }
        }

        // Sort decorations by position
        decorations.sort((a, b) => a.from - b.from);

        return Decoration.set(decorations, true);
    }

    /**
     * Process a regex pattern and add decorations
     */
    processPattern(
        lineText: string,
        lineFrom: number,
        pattern: RegExp,
        decorations: any[],
        isActiveLine: boolean,
        formatMark: Decoration,
        markerLen: number
    ) {
        let match;
        while ((match = pattern.exec(lineText)) !== null) {
            const start = lineFrom + match.index;
            const end = start + match[0].length;
            const contentStart = start + markerLen;
            const contentEnd = end - markerLen;

            if (!isActiveLine) {
                // Hide opening marker
                decorations.push(hiddenMark.range(start, contentStart));
                // Apply formatting to content
                if (contentEnd > contentStart) {
                    decorations.push(formatMark.range(contentStart, contentEnd));
                }
                // Hide closing marker
                decorations.push(hiddenMark.range(contentEnd, end));
            } else {
                // Show markers but still apply formatting
                decorations.push(formatMark.range(contentStart, contentEnd));
            }
        }
    }
}, {
    decorations: v => v.decorations
});

/**
 * Theme for WYSIWYG decorations
 */
const wysiwygTheme = EditorView.theme({
    '&': {
        fontSize: '14px',
        fontFamily: 'var(--font-text)',
    },
    '.cm-content': {
        padding: '12px',
        minHeight: '200px',
        caretColor: 'var(--text-normal)',
    },
    '.cm-cursor': {
        borderLeftColor: 'var(--text-normal)',
    },
    '.cm-line': {
        padding: '2px 0',
    },
    '.cm-mw-bold': {
        fontWeight: 'bold',
    },
    '.cm-mw-italic': {
        fontStyle: 'italic',
    },
    '.cm-mw-strikethrough': {
        textDecoration: 'line-through',
    },
    '.cm-mw-code': {
        fontFamily: 'var(--font-monospace)',
        backgroundColor: 'var(--background-secondary)',
        padding: '1px 4px',
        borderRadius: '3px',
    },
    '.cm-mw-codeblock': {
        fontFamily: 'var(--font-monospace)',
        fontSize: '13px',
    },
    '.cm-mw-codeblock-line': {
        backgroundColor: 'var(--background-secondary)',
        borderLeft: '3px solid var(--interactive-accent)',
        paddingLeft: '8px',
    },
    '.cm-mw-link': {
        color: 'var(--text-accent)',
        textDecoration: 'underline',
        cursor: 'pointer',
    },
    '.cm-mw-heading': {
        fontWeight: 'bold',
        fontSize: '1.2em',
    },
    '.cm-mw-hidden': {
        fontSize: '0',
        width: '0',
        display: 'inline',
        color: 'transparent',
    },
    '.cm-mw-checkbox': {
        width: '16px',
        height: '16px',
        marginRight: '6px',
        marginLeft: '2px',
        cursor: 'pointer',
        verticalAlign: 'middle',
        accentColor: 'var(--interactive-accent)',
    },
    '.cm-focused': {
        outline: 'none',
    },
    '.cm-scroller': {
        overflow: 'auto',
    },
});

/**
 * Create WYSIWYG extensions bundle
 */
export function createWysiwygExtensions(): Extension[] {
    return [
        markdown(),
        history(),
        keymap.of([
            ...defaultKeymap,
            ...historyKeymap,
        ]),
        wysiwygPlugin,
        wysiwygTheme,
        EditorView.lineWrapping,
    ];
}

/**
 * WysiwygEditor class - wraps CodeMirror for easy use
 */
export class WysiwygEditor {
    private view: EditorView;
    private container: HTMLElement;

    constructor(container: HTMLElement, initialContent: string = '') {
        this.container = container;

        const state = EditorState.create({
            doc: initialContent,
            extensions: createWysiwygExtensions(),
        });

        this.view = new EditorView({
            state,
            parent: container,
        });
    }

    /**
     * Get current content
     */
    getContent(): string {
        return this.view.state.doc.toString();
    }

    /**
     * Set content
     */
    setContent(content: string): void {
        this.view.dispatch({
            changes: {
                from: 0,
                to: this.view.state.doc.length,
                insert: content,
            },
        });
    }

    /**
     * Focus the editor
     */
    focus(): void {
        this.view.focus();
    }

    /**
     * Destroy the editor
     */
    destroy(): void {
        this.view.destroy();
    }

    /**
     * Insert text at cursor
     */
    insertAtCursor(text: string): void {
        const pos = this.view.state.selection.main.head;
        this.view.dispatch({
            changes: { from: pos, insert: text },
            selection: { anchor: pos + text.length },
        });
    }

    /**
     * Wrap selection with markers (for bold, italic, etc.)
     */
    wrapSelection(before: string, after: string): void {
        const { from, to } = this.view.state.selection.main;
        const selected = this.view.state.sliceDoc(from, to);

        this.view.dispatch({
            changes: {
                from,
                to,
                insert: before + selected + after,
            },
            selection: { anchor: from + before.length + selected.length + after.length },
        });
    }

    /**
     * Undo
     */
    undo(): void {
        undo(this.view);
    }

    /**
     * Redo
     */
    redo(): void {
        redo(this.view);
    }

    /**
     * Get EditorView for advanced operations
     */
    getView(): EditorView {
        return this.view;
    }
}

# Plainview Taken from obsidian-plaintext view

<https://github.com/dbarenholz/obsidian-plaintext/blob/master/src/view.ts>

```ts
import { TFile, TextFileView, WorkspaceLeaf } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { basicExtensions, languageExtension } from './codemirror';

/**
 * The plaintext view shows a plaintext file, hence it extends the text file view.
 * Rewritten to use CM6.
 *
 * Code from here: https://github.com/Zachatoo/obsidian-css-editor/blob/main/src/CssEditorView.ts
 *
 * @version 0.3.0
 * @author dbarenholz
 */
export class PlaintextView extends TextFileView {
 private editorView: EditorView;
 private editorState: EditorState;
 file: TFile;

 constructor(leaf: WorkspaceLeaf) {
  super(leaf);

  this.editorState = EditorState.create({
   extensions: [
    basicExtensions,
    // TODO: Figure out how to nicely set language modes.
    languageExtension,
    EditorView.updateListener.of((update) => {
     if (update.docChanged) {
      this.save(false);
     }
    }),
   ],
  });

  this.editorView = new EditorView({
   state: this.editorState,
   parent: this.contentEl,
  });
 }

 /**
  * Gets the type of this view.
  * We use `extension-view`, where extension is the file extension.
  * This is also used in main.ts, where the view types are registered and deregistered.
  *
  * @returns The view-type constructed fron the file extension if it exists, otherwise "text/plain".
  */
 getViewType(): string {
  return this.file ? `${this.file.extension}-view` : 'text/plain';
 }

 /**
  * A string identifier of the Lucide icon that is shown in the tab of this view.
  * We use "file-code".
  *
  * @returns The string "file-code".
  */
 getIcon(): string {
  return 'file-code';
 }

 /**
  * Gets the text to display in the header of the tab.
  * This is the filename if it exists.
  *
  * @returns The filename if it exists, otherwise "(no file)".
  */
 getDisplayText(): string {
  return this.file ? this.file.basename : '(no file)';
 }

 /**
  * Grabs data from the editor.
  * This essentially implements the getViewData method.
  *
  * @returns Content in the editor.
  */
 getEditorData(): string {
  return this.editorView.state.doc.toString();
 }

 /**
  * Method that dispatches editor data.
  * This essentially implements the setViewData method.
  *
  * @param data Content to set in the view.
  */
 dispatchEditorData(data: string) {
  this.editorView.dispatch({
   changes: {
    from: 0,
    to: this.editorView.state.doc.length,
    insert: data,
   },
  });
 }

 /**
  * Gets the data from the editor.
  * This will be called to save the editor contents to the file.
  *
  * @returns A string representing the content of the editor.
  */
 getViewData(): string {
  return this.getEditorData();
 }

 /**
  * Set the data to the editor.
  * This is used to load the file contents.
  *
  * If clear is set, then it means we're opening a completely different file.
  * In that case, you should call clear(), or implement a slightly more efficient
  * clearing mechanism given the new data to be set.
  *
  * @param data data to load
  * @param clear whether or not to clear the editor
  */
 setViewData(data: string, clear: boolean): void {
  if (clear) {
   // Note: this.clear() destroys the editor completely - this is inaccurate
   // as we only want to change the editor data.
   this.dispatchEditorData('');
  }

  this.dispatchEditorData(data);
 }

 /**
  * Clear the editor.
  *
  * This is called when we're about to open a completely different file,
  * so it's best to clear any editor states like undo-redo history,
  * and any caches/indexes associated with the previous file contents.
  */
 clear(): void {
  this.editorView.destroy();
 }
}
```

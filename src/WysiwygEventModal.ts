import { App, Modal, ButtonComponent, setIcon } from 'obsidian';
import { Event } from '@markwhen/parser';
import { WysiwygEditor } from './editor/WysiwygEditor';

/**
 * Date/time state for the picker
 */
interface DateTimeState {
	fromDate: string;  // YYYY-MM-DD
	fromTime: string;  // HH:MM or empty
	toDate: string;    // YYYY-MM-DD or empty
	toTime: string;    // HH:MM or empty
	isRange: boolean;
	hasFromTime: boolean;
	hasToTime: boolean;
}

/**
 * WysiwygEventModal - Modal for editing Markwhen events with a true WYSIWYG editor
 *
 * Features:
 * - True WYSIWYG editing (see formatted text, syntax hidden until cursor is on line)
 * - Full undo/redo support (Ctrl+Z, Ctrl+Shift+Z)
 * - Formatting toolbar
 * - CodeMirror 6 based
 * - Date/time picker for event dates
 */
export class WysiwygEventModal extends Modal {
	event: Event;
	sourceData: string;
	eventTitle: string;
	eventDescription: string;
	onSave: (newTitle: string, newDescription: string, newDateRange?: string) => void;
	isExpanded: boolean = false;
	editor: WysiwygEditor | null = null;
	titleInput: HTMLInputElement | null = null;
	dateState: DateTimeState;
	datePickerContainer: HTMLElement | null = null;

	constructor(
		app: App,
		event: Event,
		sourceData: string,
		onSave: (newTitle: string, newDescription: string, newDateRange?: string) => void
	) {
		super(app);
		this.event = event;
		this.sourceData = sourceData;
		this.onSave = onSave;

		const { title, description } = this.parseEventFromSource();
		this.eventTitle = title;
		this.eventDescription = description;

		// Initialize date state from event
		this.dateState = this.parseDateFromEvent();
	}

	/**
	 * Parse date/time from the event's ISO dates
	 */
	parseDateFromEvent(): DateTimeState {
		const event = this.event as any;
		const fromIso = event.dateRangeIso?.fromDateTimeIso;
		const toIso = event.dateRangeIso?.toDateTimeIso;

		const parseIso = (iso: string | undefined): { date: string; time: string; hasTime: boolean } => {
			if (!iso) return { date: '', time: '', hasTime: false };
			try {
				const d = new Date(iso);
				const date = d.toISOString().split('T')[0];
				const hours = d.getHours();
				const minutes = d.getMinutes();
				const hasTime = hours !== 0 || minutes !== 0;
				const time = hasTime ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}` : '';
				return { date, time, hasTime };
			} catch {
				return { date: '', time: '', hasTime: false };
			}
		};

		const from = parseIso(fromIso);
		const to = parseIso(toIso);

		// Check if it's a range (different dates or both have times that differ)
		const isRange = from.date !== to.date || (from.hasTime && to.hasTime && from.time !== to.time);

		return {
			fromDate: from.date,
			fromTime: from.time,
			toDate: to.date,
			toTime: to.time,
			isRange,
			hasFromTime: from.hasTime,
			hasToTime: to.hasTime,
		};
	}

	parseEventFromSource(): { title: string; description: string } {
		const event = this.event as any;
		const dateFrom = event.dateRangeInText?.from ?? 0;
		const dateTo = event.dateRangeInText?.to ?? 0;

		let lineStart = dateFrom;
		while (lineStart > 0 && this.sourceData[lineStart - 1] !== '\n') {
			lineStart--;
		}

		let lineEnd = dateTo;
		while (lineEnd < this.sourceData.length && this.sourceData[lineEnd] !== '\n') {
			lineEnd++;
		}

		const firstLine = this.sourceData.substring(lineStart, lineEnd);

		// Find the colon AFTER the date part ends, not the first colon
		// (times like "10:30am" have colons too!)
		const dateEndInLine = dateTo - lineStart;
		const afterDatePart = firstLine.substring(dateEndInLine);
		const colonInRest = afterDatePart.indexOf(':');

		let title = 'Event';
		if (colonInRest !== -1) {
			const afterColon = afterDatePart.substring(colonInRest + 1).trim();
			title = afterColon.replace(/#\w+/g, '').trim() || 'Event';
		} else {
			// No colon after date - maybe the whole rest is the title
			const restTrimmed = afterDatePart.trim();
			if (restTrimmed) {
				title = restTrimmed.replace(/#\w+/g, '').trim() || 'Event';
			}
		}

		let descriptionStart = lineEnd + 1;
		let descriptionEnd = descriptionStart;

		while (descriptionEnd < this.sourceData.length) {
			const nextLineEnd = this.sourceData.indexOf('\n', descriptionEnd);
			const nextLine = nextLineEnd === -1
				? this.sourceData.substring(descriptionEnd)
				: this.sourceData.substring(descriptionEnd, nextLineEnd);

			if (this.looksLikeNewEvent(nextLine) || this.looksLikeSection(nextLine)) {
				break;
			}

			descriptionEnd = nextLineEnd === -1 ? this.sourceData.length : nextLineEnd + 1;
		}

		const description = this.sourceData.substring(descriptionStart, descriptionEnd).trim();
		return { title, description };
	}

	looksLikeNewEvent(line: string): boolean {
		const trimmed = line.trim();
		if (!trimmed) return false;

		const datePatterns = [
			/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/,
			/^\d{1,2}[-/]\d{1,2}[-/]\d{4}/,
			/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i,
			/^now\b/i,
			/^today\b/i,
			/^tomorrow\b/i,
			/^\d+\s+(day|week|month|year)s?\s+(ago|from now)/i,
		];

		return datePatterns.some(pattern => pattern.test(trimmed));
	}

	looksLikeSection(line: string): boolean {
		return line.trim().toLowerCase().startsWith('section ');
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('markwhen-wysiwyg-modal');

		// Make modal wider by default
		this.modalEl.addClass('mw-wysiwyg-modal-container');

		// Header
		const headerEl = contentEl.createDiv({ cls: 'mw-wysiwyg-header' });

		const titleSection = headerEl.createDiv({ cls: 'mw-wysiwyg-title-section' });

		// Editable title input
		this.titleInput = titleSection.createEl('input', {
			type: 'text',
			value: this.eventTitle,
			cls: 'mw-wysiwyg-title-input',
			attr: { placeholder: 'Event title...' }
		});

		// Date/time picker section
		this.datePickerContainer = titleSection.createDiv({ cls: 'mw-date-picker-section' });
		this.renderDatePicker();

		const event = this.event as any;
		if (event.tags && event.tags.length > 0) {
			const tagsEl = titleSection.createDiv({ cls: 'mw-wysiwyg-tags' });
			event.tags.forEach((tag: string) => {
				tagsEl.createSpan({ text: '#' + tag, cls: 'mw-tag' });
			});
		}

		// Expand button
		const expandBtn = headerEl.createDiv({ cls: 'mw-expand-btn' });
		setIcon(expandBtn, 'maximize-2');
		expandBtn.onclick = () => this.toggleExpand();

		// Toolbar
		const toolbar = contentEl.createDiv({ cls: 'mw-wysiwyg-toolbar' });
		this.createToolbar(toolbar);

		// Editor container
		const editorContainer = contentEl.createDiv({ cls: 'mw-wysiwyg-editor-container' });

		// Info label
		const infoLabel = editorContainer.createDiv({ cls: 'mw-editor-info' });
		infoLabel.setText('WYSIWYG Editor - formatting shows inline. Click a line to see/edit markdown syntax.');

		// Create WYSIWYG editor
		const editorWrapper = editorContainer.createDiv({ cls: 'mw-wysiwyg-editor-wrapper' });
		this.editor = new WysiwygEditor(editorWrapper, this.eventDescription);

		// Focus editor
		setTimeout(() => this.editor?.focus(), 100);

		// Actions
		const actions = contentEl.createDiv({ cls: 'mw-wysiwyg-actions' });

		new ButtonComponent(actions)
			.setButtonText('Save')
			.setCta()
			.onClick(() => this.saveAndClose());

		new ButtonComponent(actions)
			.setButtonText('Cancel')
			.onClick(() => this.close());
	}

	createToolbar(toolbar: HTMLElement) {
		const buttons: Array<{ icon: string; title: string; action: () => void }> = [
			{ icon: 'bold', title: 'Bold (Ctrl+B)', action: () => this.editor?.wrapSelection('**', '**') },
			{ icon: 'italic', title: 'Italic (Ctrl+I)', action: () => this.editor?.wrapSelection('*', '*') },
			{ icon: 'strikethrough', title: 'Strikethrough', action: () => this.editor?.wrapSelection('~~', '~~') },
			{ icon: 'heading-1', title: 'Heading 1', action: () => this.insertLinePrefix('# ') },
			{ icon: 'heading-2', title: 'Heading 2', action: () => this.insertLinePrefix('## ') },
			{ icon: 'heading-3', title: 'Heading 3', action: () => this.insertLinePrefix('### ') },
			{ icon: 'list', title: 'Bullet List', action: () => this.insertLinePrefix('- ') },
			{ icon: 'list-ordered', title: 'Numbered List', action: () => this.insertLinePrefix('1. ') },
			{ icon: 'check-square', title: 'Task', action: () => this.insertLinePrefix('- [ ] ') },
			{ icon: 'code', title: 'Inline Code', action: () => this.editor?.wrapSelection('`', '`') },
			{ icon: 'link', title: 'Link', action: () => this.insertLink() },
			{ icon: 'quote', title: 'Blockquote', action: () => this.insertLinePrefix('> ') },
		];

		buttons.forEach(btn => {
			const btnEl = toolbar.createDiv({ cls: 'mw-toolbar-btn', attr: { title: btn.title } });
			setIcon(btnEl, btn.icon);
			btnEl.onclick = () => {
				btn.action();
				this.editor?.focus();
			};
		});

		// Separator
		toolbar.createDiv({ cls: 'mw-toolbar-separator' });

		// Undo/Redo in toolbar too
		const undoEl = toolbar.createDiv({ cls: 'mw-toolbar-btn', attr: { title: 'Undo (Ctrl+Z)' } });
		setIcon(undoEl, 'undo');
		undoEl.onclick = () => { this.editor?.undo(); this.editor?.focus(); };

		const redoEl = toolbar.createDiv({ cls: 'mw-toolbar-btn', attr: { title: 'Redo (Ctrl+Shift+Z)' } });
		setIcon(redoEl, 'redo');
		redoEl.onclick = () => { this.editor?.redo(); this.editor?.focus(); };
	}

	insertLinePrefix(prefix: string) {
		if (!this.editor) return;
		const view = this.editor.getView();
		const pos = view.state.selection.main.head;
		const line = view.state.doc.lineAt(pos);

		view.dispatch({
			changes: { from: line.from, insert: prefix },
			selection: { anchor: pos + prefix.length },
		});
	}

	insertLink() {
		if (!this.editor) return;
		const view = this.editor.getView();
		const { from, to } = view.state.selection.main;
		const selected = view.state.sliceDoc(from, to);

		if (selected) {
			const linkText = `[${selected}](url)`;
			view.dispatch({
				changes: { from, to, insert: linkText },
				selection: { anchor: from + selected.length + 3, head: from + selected.length + 6 },
			});
		} else {
			const linkText = '[text](url)';
			view.dispatch({
				changes: { from, insert: linkText },
				selection: { anchor: from + 1, head: from + 5 },
			});
		}
	}

	toggleExpand() {
		this.isExpanded = !this.isExpanded;
		if (this.isExpanded) {
			this.modalEl.addClass('mw-wysiwyg-expanded');
		} else {
			this.modalEl.removeClass('mw-wysiwyg-expanded');
		}
	}

	/**
	 * Render the date/time picker UI - Clean compact design
	 */
	renderDatePicker() {
		if (!this.datePickerContainer) return;
		this.datePickerContainer.empty();

		const container = this.datePickerContainer;

		// Main row: From [datetime] → To [datetime]
		const pickerRow = container.createDiv({ cls: 'mw-datetime-picker' });

		// From section
		const fromSection = pickerRow.createDiv({ cls: 'mw-datetime-section' });

		const fromLabel = fromSection.createDiv({ cls: 'mw-datetime-label' });
		fromLabel.createSpan({ text: 'From' });

		const fromInputGroup = fromSection.createDiv({ cls: 'mw-datetime-input-group' });

		// Combined datetime-local input for From
		const fromDatetimeValue = this.dateState.fromDate +
			(this.dateState.hasFromTime && this.dateState.fromTime ? 'T' + this.dateState.fromTime : 'T00:00');

		const fromInput = fromInputGroup.createEl('input', {
			type: 'datetime-local',
			value: fromDatetimeValue,
			cls: 'mw-datetime-input',
		});

		fromInput.addEventListener('change', (e) => {
			const value = (e.target as HTMLInputElement).value;
			if (value) {
				const [date, time] = value.split('T');
				this.dateState.fromDate = date;
				this.dateState.fromTime = time;
				this.dateState.hasFromTime = time !== '00:00';

				// If not a range, sync to date
				if (!this.dateState.isRange) {
					this.dateState.toDate = date;
					this.dateState.toTime = time;
					this.dateState.hasToTime = this.dateState.hasFromTime;
				}
				this.updateDateDisplay();
			}
		});

		// Arrow separator
		const arrow = pickerRow.createDiv({ cls: 'mw-datetime-arrow' });
		arrow.setText('→');

		// To section
		const toSection = pickerRow.createDiv({ cls: 'mw-datetime-section' });

		const toLabel = toSection.createDiv({ cls: 'mw-datetime-label' });
		toLabel.createSpan({ text: 'To' });

		const toInputGroup = toSection.createDiv({ cls: 'mw-datetime-input-group' });

		const toDatetimeValue = (this.dateState.toDate || this.dateState.fromDate) +
			(this.dateState.hasToTime && this.dateState.toTime ? 'T' + this.dateState.toTime : 'T00:00');

		const toInput = toInputGroup.createEl('input', {
			type: 'datetime-local',
			value: toDatetimeValue,
			cls: 'mw-datetime-input',
		});

		toInput.addEventListener('change', (e) => {
			const value = (e.target as HTMLInputElement).value;
			if (value) {
				const [date, time] = value.split('T');
				this.dateState.toDate = date;
				this.dateState.toTime = time;
				this.dateState.hasToTime = time !== '00:00';
				this.dateState.isRange = true;
				this.updateDateDisplay();
			}
		});

		// Store references for updating
		(this as any)._fromInput = fromInput;
		(this as any)._toInput = toInput;

		// Display summary below
		const summaryEl = container.createDiv({ cls: 'mw-datetime-summary' });
		(this as any)._summaryEl = summaryEl;
		this.updateDateDisplay();
	}

	/**
	 * Update the date display summary
	 */
	updateDateDisplay() {
		const summaryEl = (this as any)._summaryEl as HTMLElement;
		if (!summaryEl) return;

		summaryEl.empty();

		const { fromDate, fromTime, toDate, toTime, hasFromTime, hasToTime } = this.dateState;

		// Format for display
		const formatDate = (date: string, time: string, hasTime: boolean) => {
			if (!date) return '';
			const d = new Date(date + 'T12:00:00'); // Noon to avoid timezone issues
			const dateStr = d.toLocaleDateString('en-US', {
				month: 'short',
				day: 'numeric',
				year: 'numeric'
			});
			if (hasTime && time && time !== '00:00') {
				const [h, m] = time.split(':');
				const hour = parseInt(h);
				const ampm = hour >= 12 ? 'PM' : 'AM';
				const hour12 = hour % 12 || 12;
				return `${dateStr} ${hour12}:${m} ${ampm}`;
			}
			return dateStr;
		};

		const fromStr = formatDate(fromDate, fromTime, hasFromTime);
		const toStr = formatDate(toDate || fromDate, toTime, hasToTime);

		// Determine if it's a range
		const sameDateTime = fromDate === (toDate || fromDate) &&
			((!hasFromTime && !hasToTime) || (fromTime === toTime));

		if (sameDateTime) {
			summaryEl.createSpan({ text: fromStr, cls: 'mw-summary-text' });
		} else {
			summaryEl.createSpan({ text: fromStr, cls: 'mw-summary-text' });
			summaryEl.createSpan({ text: ' → ', cls: 'mw-summary-arrow' });
			summaryEl.createSpan({ text: toStr, cls: 'mw-summary-text' });
		}
	}

	/**
	 * Convert date state to Markwhen date string format
	 */
	dateStateToString(): string {
		const { fromDate, fromTime, toDate, toTime, isRange, hasFromTime, hasToTime } = this.dateState;

		let result = fromDate;
		if (hasFromTime && fromTime) {
			result += ` ${fromTime}`;
		}

		if (isRange) {
			const endDate = toDate || fromDate;
			if (hasToTime && toTime) {
				// If same date, just add end time
				if (endDate === fromDate && hasFromTime) {
					result += `-${toTime}`;
				} else {
					result += `/${endDate} ${toTime}`;
				}
			} else if (endDate !== fromDate) {
				result += `/${endDate}`;
			}
		}

		return result;
	}

	saveAndClose() {
		if (this.editor && this.titleInput) {
			const newTitle = this.titleInput.value.trim() || 'Event';
			const newDescription = this.editor.getContent();
			const newDateRange = this.dateStateToString();
			this.onSave(newTitle, newDescription, newDateRange);
		}
		this.close();
	}

	close() {
		if (this.editor) {
			this.editor.destroy();
			this.editor = null;
		}

		try {
			super.close();
		} catch (e) {
			console.debug('[Markwhen] Modal close error (suppressed):', e);
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

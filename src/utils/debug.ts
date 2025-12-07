import { App, TFile } from 'obsidian';

/**
 * Debug utility that writes logs to a debug.log file in the vault root.
 * Makes it easier to review plugin behavior by checking a file rather than console.
 *
 * Usage:
 *   const debug = new DebugLog(this.app);
 *   debug.log('Message here', { someData: 123 });
 *   debug.clear(); // Clear the log file
 */
export class DebugLog {
	private app: App;
	private logPath = 'debug.log';
	private enabled = true;

	constructor(app: App, enabled = true) {
		this.app = app;
		this.enabled = enabled;
	}

	async log(message: string, data?: any): Promise<void> {
		if (!this.enabled) return;

		const timestamp = new Date().toISOString();
		let logLine = `[${timestamp}] ${message}`;

		if (data !== undefined) {
			try {
				logLine += '\n' + JSON.stringify(data, null, 2);
			} catch {
				logLine += '\n[Unable to stringify data]';
			}
		}
		logLine += '\n---\n';

		// Also log to console
		console.log('[Markwhen Debug]', message, data);

		try {
			const file = this.app.vault.getAbstractFileByPath(this.logPath);
			if (file instanceof TFile) {
				const existing = await this.app.vault.read(file);
				await this.app.vault.modify(file, existing + logLine);
			} else {
				await this.app.vault.create(this.logPath, logLine);
			}
		} catch (e) {
			console.error('[Markwhen Debug] Failed to write to debug.log:', e);
		}
	}

	async clear(): Promise<void> {
		try {
			const file = this.app.vault.getAbstractFileByPath(this.logPath);
			if (file instanceof TFile) {
				await this.app.vault.modify(file, '# Debug Log\nCleared at ' + new Date().toISOString() + '\n\n');
			}
		} catch (e) {
			console.error('[Markwhen Debug] Failed to clear debug.log:', e);
		}
	}
}

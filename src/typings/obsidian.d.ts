import 'obsidian';

declare module 'obsidian' {
	interface Vault {
		getAbstractFileByPathInsensitive(path: string): TAbstractFile | null;
	}
}

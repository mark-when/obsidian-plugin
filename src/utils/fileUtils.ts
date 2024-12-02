export function getDefaultFileName() {
	return `Markwhen ${new Date()
		.toLocaleString('en-US', { hour12: false })
		.replace(/\//g, '-')
		.replace(/:/g, '.')
		.replace(/,/, '')}.mw`; // TODO: improve this
}

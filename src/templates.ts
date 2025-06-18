import calendar from '@markwhen/calendar/dist/index.html?raw';
import oneview from '@markwhen/oneview/dist/index.html?raw';
import resume from '@markwhen/resume/dist/index.html?raw';
import timeline from '@markwhen/timeline2/dist/index.html?raw';

export type ViewType = 'timeline' | 'calendar' | 'resume' | 'text' | 'oneview';

export const getTemplateURL = (vt: ViewType) => {
	let template: string = '';
	if (vt === 'calendar') template = calendar;
	else if (vt === 'oneview') template = oneview;
	else if (vt === 'resume') template = resume;
	else if (vt === 'timeline') template = timeline;

	return URL.createObjectURL(new Blob([template], { type: 'text/html' }));
};

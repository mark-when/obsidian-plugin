import calendar from './calendar.html?raw';
import oneview from './oneview.html?raw';
import resume from './resume.html?raw';
import timeline from './timeline.html?raw';

export type ViewType = 'timeline' | 'calendar' | 'resume' | 'text' | 'oneview';

export const getTemplateURL = (vt: ViewType) => {
	let template: string = '';
	if (vt === 'calendar') template = calendar;
	else if (vt === 'oneview') template = oneview;
	else if (vt === 'resume') template = resume;
	else if (vt === 'timeline') template = timeline;

	return URL.createObjectURL(new Blob([template], { type: 'text/html' }));
};

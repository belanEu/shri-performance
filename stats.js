function quantile(arr, q) {
    const sorted = arr.sort((a, b) => a - b);
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;

    if (sorted[base + 1] !== undefined) {
        return Math.floor(sorted[base] + rest * (sorted[base + 1] - sorted[base]));
    } else {
        return Math.floor(sorted[base]);
    }
};

function prepareData(result) {
	return result.data.map(item => {
		item.date = item.timestamp.split('T')[0];

		return item;
	});
}

function standardStatsResult(metricData) {
	let result = {};

	result.hits = metricData.length;
	result.p25 = quantile(metricData, 0.25);
	result.p50 = quantile(metricData, 0.5);
	result.p75 = quantile(metricData, 0.75);
	result.p95 = quantile(metricData, 0.95);

	return result;
}

function aggregateData(data, names, quantilePercent, page, requestId, date) {
	const result = {};
	names.forEach(name => {
		const metricData = data.filter(
		item => item.name == name
		&& item.page == page
		&& item.requestId == requestId
		&& item.date == date
		)
		.map(item => item.value);
	
		result[name] = quantile(metricData, quantilePercent);
	});

	return result;
}

function addMetricByPlatform(data, page, name, platform, date) {
	let metricData = data
					.filter(
						item => item.date == date
						&& item.page == page
						&& item.name == name
						&& item.additional.platform == platform
					).map(item => item.value);

	return standardStatsResult(metricData);
}

function groupBy(groupKey, valueKey, data) {
	let SET = {};
	data.forEach(item => {
		if (SET[item[groupKey]] === undefined) {
			SET[item[groupKey]] = [];
		}
		SET[item[groupKey]].push(item[valueKey]);
	});
	return SET;
}

// Нисходящая сортировка значений метрики по p95. Ключь - номер сессии
function descSortedMetricValuesForPlatform(data, page, name, platform, date, limit = undefined, minHits = undefined) {
	let metricData = data
					.filter(
						item => item.page == page
						&& item.name == name
						&& item.additional.platform == platform
						&& item.date == date
					).map(item => {return {requestId: item.requestId, value: item.value}});

	let groupedData = groupBy('requestId', 'value', metricData);
	calculatedSET = {};
	Object.keys(groupedData).forEach(key => {
		let result = standardStatsResult(groupedData[key]);
		if (minHits) {
			if (result.hits >= minHits) {
				calculatedSET[key] = result;
			}
		} else {
			calculatedSET[key] = result;
		}
	});

	limit = limit <= 0 ? undefined : limit;
	return Object.fromEntries(
		Object.entries(calculatedSET)
		.sort((a, b) => b[1]['p95'] - a[1]['p95'])
		.slice(0, limit)
	);
}


function addMetricByDate(data, page, name, date) {
	let sampleData = data
					.filter(item => item.page == page && item.name == name && item.date == date)
					.map(item => item.value);

	return standardStatsResult(sampleData);
}

function addMetricByPeriod(data, page, name, startDate, endDate) {
	let metricData = data
					.filter(
						item => item.page == page
								&&
								item.name == name
								&&
								item.date >= startDate && item.date <= endDate
					)
					.map(item => { return {date: item.date, value: item.value}}).sort((a, b) => new Date(a.date) - new Date(b.date));

	let groupedData = groupBy('date', 'value', metricData);
	
	calculatedSET = {};
	Object.keys(groupedData).forEach(key => calculatedSET[key] = standardStatsResult(groupedData[key]));

	return calculatedSET;
}

/* ----- ВЫВОД ----- */
// сессия на странице
function showSession(data, names, page, sessionId, date) {
	let table = {};

	console.log(`Session <${sessionId}> on page <${page}> for ${date}:`);

	table.p25 = aggregateData(data, names, 0.25, page, sessionId, date);
	table.p50 = aggregateData(data, names, 0.5, page, sessionId, date);
	table.p75 = aggregateData(data, names, 0.75, page, sessionId, date);
	table.p95 = aggregateData(data, names, 0.95, page, sessionId, date);

	console.table(table);
	console.log("\n");
}

// сравнение метрики на моб. устр. и пк
function compareMetric(data, page, name, date) {
	console.log(`Comparison of metric <${name}> on page <${page}> for different platforms for ${date}:`);

	let table = {};

	table.touch = addMetricByPlatform(data, page, name, 'touch', date);
	table.desktop = addMetricByPlatform(data, page, name, 'desktop', date);

	console.table(table);
	console.log("\n");
}

// все метрики за день, собранные на определнной платформе
function calcMetricsByPlatform(data, page, platform, date) {
	console.log(`All metrics on page <${page}> for <${platform}> for ${date}:`);

	let table = {};
	table.connect = addMetricByPlatform(data, page, 'connect', platform, date);
	table.ttfb = addMetricByPlatform(data, page, 'ttfb', platform, date);
	table.load = addMetricByPlatform(data, page, 'load', platform, date);
	table.square = addMetricByPlatform(data, page, 'square', platform, date);
	table.generate = addMetricByPlatform(data, page, 'generate', platform, date);
	table.draw = addMetricByPlatform(data, page, 'draw', platform, date);
	table.hideImage = addMetricByPlatform(data, page, 'hide-image', platform, date);
	table.firstPaint = addMetricByPlatform(data, page, 'first-paint', platform, date);
	table.domComplete = addMetricByPlatform(data, page, 'dom-complete', platform, date);
	table.domInteractive = addMetricByPlatform(data, page, 'dom-interactive', platform, date);

	console.table(table);
	console.log("\n");
}

// топ сессий с максмальными значениями метрики
function showTopSessionsWithMaxMetricValues(data, page, name, platform, date, limit = undefined, minHits = undefined) {
	console.log(`Sessions descending sorted by metric <${name}> values`);
	console.log(`platform: ${platform}\npage: ${page}\ndate: ${date}\nmin hits: ${minHits}`);

	console.table(descSortedMetricValuesForPlatform(data, page, name, platform, date, limit, minHits));
	console.log("\n");
}

// все метрики за день
function calcMetricsByDate(data, page, date) {
	console.log(`All metrics on page <${page}> for ${date}:`);

	let table = {};
	table.connect = addMetricByDate(data, page, 'connect', date);
	table.ttfb = addMetricByDate(data, page, 'ttfb', date);
	table.load = addMetricByDate(data, page, 'load', date);
	table.square = addMetricByDate(data, page, 'square', date);
	table.generate = addMetricByDate(data, page, 'generate', date);
	table.draw = addMetricByDate(data, page, 'draw', date);
	table.hideImage = addMetricByDate(data, page, 'hide-image', date);
	table.firstPaint = addMetricByDate(data, page, 'first-paint', date);
	table.domComplete = addMetricByDate(data, page, 'dom-complete', date);
	table.domInteractive = addMetricByDate(data, page, 'dom-interactive', date);

	console.table(table);
	console.log("\n");
}

function showMetricByPeriod(data, page, name, startDate, endDate) {
	console.log(`Metric <${name}> on page <${page}> for ${startDate} - ${endDate}:`);

	console.table(addMetricByPeriod(data, page, name, startDate, endDate));
	console.log("\n");
}
/* ----- ВЫВОД ----- */

// used: 67CE6B64-236F-48AC-8A88-D84B6F9E2686
fetch('https://shri.yandex/hw/stat/data?counterId=7CC55EF6-581A-4486-A321-DB1AEE7ABB1F')
	.then(res => res.json())
	.then(result => {
		let data = prepareData(result);

		calcMetricsByDate(data, 'send test', '2021-10-31');
		showMetricByPeriod(data, 'send test', 'load', '2021-10-29', '2021-11-07');
		
		compareMetric(data, 'send test', 'load', '2021-10-31');
		compareMetric(data, 'send test', 'generate', '2021-10-31');
		
		showSession(
			data,
			['first-paint', 'dom-complete', 'dom-interactive', 'load', 'generate', 'square', 'draw', 'hide-image'],
			'send test',
			'890491694003',
			'2021-10-31'
			);
		
		calcMetricsByPlatform(data, 'send test', 'touch', '2021-10-31');
		calcMetricsByPlatform(data, 'send test', 'desktop', '2021-10-31');

		showTopSessionsWithMaxMetricValues(data, 'send test', 'hide-image', 'desktop', '2021-10-31', undefined, 3);
		showTopSessionsWithMaxMetricValues(data, 'send test', 'draw', 'touch', '2021-10-31', undefined, 3);
	});

// DNPlay bookmarklet for AncestryDNA.
//
// bookmarklet.html turns this function into a bookmark ("javascript:(...)()"), so it
// must be completely self-contained: no references to anything outside the function.
//
// Clicked on any ancestry.com page while signed in, it fetches the same data the
// DNPlay page asks people to paste (the chromosome painter and the ethnicity
// estimate) plus Ancestry's own region names, and shows them in a panel on top of
// the page. Nothing is sent anywhere except back to ancestry.com.
function dnplayBookmarklet() {
	const HOST_ID = 'dnplay-bookmarklet';

	if (!/(^|\.)ancestry\.[a-z.]+$/.test(location.hostname)) {
		alert('DNPlay: open ancestry.com, sign in, and click this bookmark there.');
		return;
	}

	// clicking the bookmark again closes the panel.
	const existing = document.getElementById(HOST_ID);
	if (existing) {
		existing.remove();
		return;
	}

	const GUID = /[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/i;

	// ---------- panel ----------

	const host = document.createElement('div');
	host.id = HOST_ID;
	host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;';
	// a shadow root keeps Ancestry's styles off the panel and the panel's styles off Ancestry.
	const root = host.attachShadow({ mode: 'open' });
	root.innerHTML = `
<style>
	:host { all: initial; }
	* { box-sizing: border-box; }
	.backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.55); overflow-y: auto; padding: 24px 16px;
		font: 15px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #212529; }
	.panel { max-width: 860px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 20px 24px 24px;
		box-shadow: 0 10px 40px rgba(0,0,0,.35); }
	.top { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
	h2 { margin: 0; font-size: 22px; flex: 1; }
	select, button { font: inherit; padding: 4px 10px; border-radius: 6px; border: 1px solid #adb5bd; background: #fff; cursor: pointer; }
	.close { border: none; font-size: 24px; line-height: 1; padding: 2px 8px; background: none; }
	.status { margin: 16px 0; color: #6c757d; }
	.error { color: #b02a37; }
	.note { background: #e9ecef; border-radius: 8px; padding: 12px 16px; margin: 16px 0; font-size: 14px; }
	.note p { margin: 0 0 8px; }
	.note p:last-child { margin: 0; }
	.wrap { overflow-x: auto; }
	table { margin: 0 auto; border-collapse: collapse; border-radius: 10px; overflow: hidden; color: #fff;
		font-size: 18px; line-height: 32px; font-weight: 800; }
	tr:nth-child(odd) { background: #6c757d; }
	tr:nth-child(even) { background: #212529; }
	tr.head { background: #495057; }
	th { padding: 6px 15px; font-size: 15px; line-height: 20px; text-align: left; }
	td { padding: 0 15px; white-space: nowrap; }
	td:first-child { white-space: normal; }
	.swatch { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 8px; vertical-align: 0; }
	.foot { text-align: center; color: #6c757d; font-size: 14px; margin-top: 12px; }
</style>
<div class="backdrop">
	<div class="panel" role="dialog" aria-label="DNPlay results">
		<div class="top">
			<h2>DNPlay results</h2>
			<label>Year <select class="year"></select></label>
			<button class="close" title="Close" aria-label="Close">&times;</button>
		</div>
		<div class="body"><p class="status">Loading…</p></div>
	</div>
</div>`;
	document.body.appendChild(host);

	const backdrop = root.querySelector('.backdrop');
	const body = root.querySelector('.body');
	const yearSelect = root.querySelector('.year');

	function close() {
		host.remove();
		document.removeEventListener('keydown', onKey);
	}
	function onKey(e) {
		if (e.key === 'Escape') close();
	}
	document.addEventListener('keydown', onKey);
	root.querySelector('.close').addEventListener('click', close);
	backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });

	function showStatus(text, isError) {
		body.innerHTML = '';
		const p = document.createElement('p');
		p.className = isError ? 'status error' : 'status';
		p.textContent = text;
		body.appendChild(p);
	}

	function el(tag, attrs, text) {
		const e = document.createElement(tag);
		if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
		if (text !== undefined) e.textContent = text;
		return e;
	}

	// ---------- data ----------

	async function getJson(url, options) {
		const r = await fetch(url, Object.assign({ credentials: 'include' }, options || {}));
		if (r.status === 401 || r.status === 403) throw new Error('signed-out');
		if (!r.ok) return null;
		return r.json();
	}

	async function findTestId() {
		// on a DNA page the test ID is in the address; that also covers tests you manage for others.
		const fromUrl = location.pathname.match(GUID);
		if (fromUrl) return fromUrl[0];
		// otherwise, Ancestry redirects /dna/insights/ to your own test.
		const r = await fetch('/dna/insights/', { credentials: 'include' });
		const fromRedirect = r.url.match(GUID);
		return fromRedirect ? fromRedirect[0] : null;
	}

	// the chromosome painter: count windows per region. Window ranges are inclusive
	// ([0, 19] then [20, 39]), so each segment covers end - start + 1 windows.
	function summarizePainter(json) {
		if (!json || !json.item || !json.item.chromosomeData) return null;
		const data = JSON.parse(json.item.chromosomeData);
		const counts = {};
		let total = 0;
		for (const parent of ['parent1', 'parent2']) {
			for (const chromosome in (data[parent] || {})) {
				for (const segment of data[parent][chromosome]) {
					const length = segment.windows[1] - segment.windows[0] + 1;
					counts[segment.region] = (counts[segment.region] || 0) + length;
					total += length;
				}
			}
		}
		const percents = {};
		for (const key in counts) percents[key] = 100 * counts[key] / total;
		return percents;
	}

	async function load(testId, year) {
		showStatus('Loading ' + year + '…');
		const enc = encodeURIComponent(testId);
		const [painterJson, estimateJson] = await Promise.all([
			getJson('/dna/origins/inheritance/api/v1/ethnicities/' + enc + '/chromosomes?version=' + year),
			getJson('/dna/origins/secure/tests/' + enc + '/v2/ethnicity?version=' + year),
		]);

		const painter = summarizePainter(painterJson);
		const estimate = {};
		for (const r of (estimateJson && estimateJson.regions) || []) estimate[r.key] = r;

		const keys = new Set([...Object.keys(painter || {}), ...Object.keys(estimate)]);
		if (!keys.size) {
			showStatus('No ethnicity results found for ' + year + '.', true);
			return;
		}

		// names straight from Ancestry for that year, so new regions are always named.
		let names = {};
		try {
			names = (await getJson('/dna/origins/public/ethnicity/' + year + '/names?locale=en-US', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify([...keys].filter(k => k !== 'Unassigned')),
			})) || {};
		} catch (e) { /* fall back to showing the key */ }

		render(year, painter, estimate, names, keys);
	}

	function render(year, painter, estimate, names, keys) {
		body.innerHTML = '';
		const hasPainter = !!painter;
		const hasEstimate = Object.keys(estimate).length > 0;

		const note = el('div', { class: 'note' });
		const paragraphs = [
			['b', 'Chromosome painter'], [null, ' is not your ethnicity estimate. It comes from Ancestry\'s chromosome painter, which splits your chromosomes into small pieces and labels each with a region. This counts how many pieces got each label and turns those counts into percentages, so it has decimals, but it won\'t match your estimate exactly.'],
		];
		const p1 = el('p');
		for (const [tag, text] of paragraphs) p1.appendChild(tag ? el(tag, null, text) : document.createTextNode(text));
		note.appendChild(p1);
		const p2 = el('p');
		p2.appendChild(el('b', null, 'Estimate'));
		p2.appendChild(document.createTextNode(' and '));
		p2.appendChild(el('b', null, 'Range'));
		p2.appendChild(document.createTextNode(' are your ethnicity estimate, straight from Ancestry. Ancestry only sends the estimate as whole numbers. The range is the lowest and highest percentage Ancestry gives for that region; a wide range means Ancestry isn\'t very sure.'));
		note.appendChild(p2);
		if (hasPainter && painter.Unassigned) {
			const p3 = el('p');
			p3.appendChild(el('b', null, 'Unassigned'));
			p3.appendChild(document.createTextNode(' pieces aren\'t labeled with any region in the chromosome painter. Your estimate still counts that DNA toward some of your regions, but the painter doesn\'t say which, so other regions in the painter column will usually be a bit lower than your estimate.'));
			note.appendChild(p3);
		}
		body.appendChild(note);

		const value = (obj, k) => (obj && obj[k] !== undefined) ? obj[k] : null;
		const rows = [...keys].sort((a, b) =>
			((value(painter, b) || 0) - (value(painter, a) || 0)) ||
			(((estimate[b] || {}).percentage || 0) - ((estimate[a] || {}).percentage || 0)));

		const table = el('table');
		const head = el('tr', { class: 'head' });
		['Region', 'Chromosome painter', 'Estimate', 'Range'].forEach(h => head.appendChild(el('th', null, h)));
		table.appendChild(head);

		let lowConfidence = false;
		for (const key of rows) {
			const r = estimate[key];
			const tr = el('tr');
			const name = el('td');
			// darkColor is the color Ancestry's chromosome painter uses for the region.
			if (r && (r.darkColor || r.color)) {
				const swatch = el('span', { class: 'swatch' });
				swatch.style.background = r.darkColor || r.color;
				name.appendChild(swatch);
			}
			name.appendChild(document.createTextNode(key === 'Unassigned' ? 'Unassigned' : (names[key] || key)));
			tr.appendChild(name);
			const p = value(painter, key);
			tr.appendChild(el('td', null, p === null ? '–' : p.toFixed(2) + ' %'));
			tr.appendChild(el('td', null, r ? r.percentage + ' %' : '–'));
			let range = r ? r.lowerConfidence + '–' + r.upperConfidence + ' %' : '–';
			if (r && r.lowConfidenceAssignment) {
				range += ' *';
				lowConfidence = true;
			}
			tr.appendChild(el('td', null, range));
			table.appendChild(tr);
		}
		const wrap = el('div', { class: 'wrap' });
		wrap.appendChild(table);
		body.appendChild(wrap);

		const foot = [];
		if (lowConfidence) foot.push('* Ancestry marks this region as a low-confidence assignment.');
		if (!hasPainter) foot.push('No chromosome painter data for ' + year + '.');
		if (!hasEstimate) foot.push('No ethnicity estimate for ' + year + '.');
		for (const text of foot) body.appendChild(el('p', { class: 'foot' }, text));
	}

	// ---------- start ----------

	(async () => {
		try {
			const testId = await findTestId();
			if (!testId) {
				showStatus('Couldn\'t find your DNA test. Make sure you\'re signed in, or open one of your AncestryDNA pages and try again.', true);
				return;
			}
			const versions = (await getJson('/dna/origins/secure/tests/' + encodeURIComponent(testId) + '/ethnicity/versions')) || [];
			const years = versions.length ? versions.slice().sort((a, b) => b - a) : [new Date().getFullYear()];
			for (const y of years) yearSelect.appendChild(el('option', { value: y }, String(y)));
			yearSelect.addEventListener('change', () => load(testId, yearSelect.value).catch(fail));
			await load(testId, years[0]);
		} catch (e) {
			fail(e);
		}
	})();

	function fail(e) {
		if (e && e.message === 'signed-out') {
			showStatus('Ancestry says you\'re not signed in. Sign in to ancestry.com and click the bookmark again.', true);
		} else {
			showStatus('Something went wrong loading your results: ' + (e && e.message ? e.message : e), true);
		}
	}
}

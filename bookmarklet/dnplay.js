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
	tr.region { cursor: pointer; }
	tr.region.selected td { box-shadow: inset 0 0 0 9999px rgba(255,255,255,.18); }
	h3 { font-size: 18px; margin: 28px 0 4px; }
	.hint { color: #6c757d; font-size: 13px; margin: 0 0 12px; }
	.hint .clear { font-size: 12px; padding: 1px 8px; margin-left: 4px; }
	.tabs { display: flex; gap: 4px; }
	.tabs button { border-color: #ced4da; color: #495057; }
	.tabs button.active { background: #212529; border-color: #212529; color: #fff; }
	table.compare { font-size: 15px; line-height: 26px; }
	.compare td, .compare th { padding: 0 10px; }
	.compare th { padding-top: 6px; padding-bottom: 6px; }
	tr.head.group th { text-align: center; padding-bottom: 0; }
	tr.head.group th:not(:first-child) { border-bottom: 1px solid #6c757d; }
	tr.head.group + tr.head th { padding-top: 2px; }
	.compare td:first-child { min-width: 190px; }
	.compare td.num-cell { text-align: right; }
	.compare td.missing { color: #adb5bd; font-weight: 400; }
	.compare .changed { font-size: 12px; font-weight: 400; color: #ced4da; display: block; line-height: 14px; padding-bottom: 6px; }
	.chromosomes { display: grid; grid-template-columns: 28px 1fr; row-gap: 10px; column-gap: 8px; align-items: center; }
	.num { text-align: right; font-weight: 700; font-size: 13px; color: #495057; }
	.pair { display: flex; flex-direction: column; gap: 3px; }
	.bar { position: relative; height: 12px; background: #979797; border-radius: 6px; overflow: hidden; }
	.seg { position: absolute; top: 0; bottom: 0; transition: opacity .15s; }
	.dim .bar { background: #e9ecef; }
	.dim .seg:not(.on) { opacity: .12; }
	.centromere { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: #fff; }
	.legend { display: flex; gap: 16px; flex-wrap: wrap; font-size: 13px; color: #495057; margin-top: 12px; }
	.legend span::before { content: ""; display: inline-block; width: 12px; height: 12px; border-radius: 3px; background: #979797; margin-right: 6px; vertical-align: -1px; }
</style>
<div class="backdrop">
	<div class="panel" role="dialog" aria-label="DNPlay results">
		<div class="top">
			<h2>DNPlay results</h2>
			<div class="tabs">
				<button type="button" class="tab-results active">Results</button>
				<button type="button" class="tab-compare">Compare years</button>
			</div>
			<label class="year-label">Year <select class="year"></select></label>
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
		return { percents: percents, data: data };
	}

	// everything for one year: painter percentages and segments, the estimate, and names.
	// Each year is fetched once and reused by both views.
	const yearCache = {};
	function fetchYear(testId, year) {
		if (!yearCache[year]) {
			yearCache[year] = fetchYearUncached(testId, year);
			yearCache[year].catch(() => { delete yearCache[year]; });
		}
		return yearCache[year];
	}

	async function fetchYearUncached(testId, year) {
		const enc = encodeURIComponent(testId);
		const [painterJson, estimateJson] = await Promise.all([
			getJson('/dna/origins/inheritance/api/v1/ethnicities/' + enc + '/chromosomes?version=' + year),
			getJson('/dna/origins/secure/tests/' + enc + '/v2/ethnicity?version=' + year),
		]);

		const painterSummary = summarizePainter(painterJson);
		const painter = painterSummary ? painterSummary.percents : null;
		const estimate = {};
		for (const r of (estimateJson && estimateJson.regions) || []) estimate[r.key] = r;
		const keys = new Set([...Object.keys(painter || {}), ...Object.keys(estimate)]);

		// names straight from Ancestry for that year, so new regions are always named.
		let names = {};
		if (keys.size) {
			try {
				names = (await getJson('/dna/origins/public/ethnicity/' + year + '/names?locale=en-US', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify([...keys].filter(k => k !== 'Unassigned')),
				})) || {};
			} catch (e) { /* fall back to showing the key */ }
		}
		names.Unassigned = 'Unassigned';

		return { year: Number(year), painter, painterData: painterSummary ? painterSummary.data : null, estimate, names, keys };
	}

	async function load(testId, year) {
		showStatus('Loading ' + year + '…');
		const d = await fetchYear(testId, year);
		if (!d.keys.size) {
			showStatus('No ethnicity results found for ' + year + '.', true);
			return;
		}
		render(year, d.painter, d.estimate, d.names, d.keys, d.painterData);
	}

	// ---------- compare years ----------

	let compareMode = 'estimate';
	let breakdown = 'total';

	async function compare(testId, years) {
		showStatus('Loading all years…');
		const all = (await Promise.all(years.map(y => fetchYear(testId, y)))).filter(d => d.keys.size);
		all.sort((a, b) => a.year - b.year);
		renderCompare(all);
	}

	// line up regions across years. Region codes mostly stay the same between updates, but
	// names can change (and 2022 used different codes), so match by code first, then by name.
	function matchRegions(all) {
		const rows = [];
		const byKey = {}, byName = {};
		for (const d of all.slice().reverse()) {   // newest first, so rows are named the current way
			for (const key of d.keys) {
				const name = d.names[key] || key;
				let row = byKey[key] || byName[name.toLowerCase()];
				if (!row) {
					row = { label: name, names: {}, cells: {} };
					rows.push(row);
				}
				byKey[key] = row;
				byName[name.toLowerCase()] = row;
				row.names[d.year] = name;
				row.cells[d.year] = { painter: d.painter ? d.painter[key] : undefined, estimate: d.estimate[key] };
				if (!row.color && d.estimate[key]) row.color = regionColor(key, d.estimate);
				if (key === 'Unassigned') row.color = UNASSIGNED_COLOR;
			}
		}
		return rows;
	}

	function renderCompare(all) {
		body.innerHTML = '';
		if (!all.length) {
			showStatus('No ethnicity results found.', true);
			return;
		}
		const years = all.map(d => d.year);
		const latest = years[years.length - 1];

		const modes = el('div', { class: 'tabs' });
		modes.style.margin = '16px 0';
		for (const [mode, label] of [['estimate', 'Estimate'], ['painter', 'Chromosome painter']]) {
			const b = el('button', { type: 'button', class: mode === compareMode ? 'active' : '' }, label);
			b.addEventListener('click', () => { compareMode = mode; renderCompare(all); });
			modes.appendChild(b);
		}
		body.appendChild(modes);

		const value = (row, y) => {
			const c = row.cells[y];
			if (!c) return null;
			if (compareMode === 'estimate') return c.estimate ? c.estimate.percentage : null;
			return c.painter === undefined ? null : c.painter;
		};
		let rows = matchRegions(all).filter(row => years.some(y => value(row, y) !== null));
		rows.sort((a, b) => ((value(b, latest) || 0) - (value(a, latest) || 0)) ||
			years.slice().reverse().reduce((acc, y) => acc || ((value(b, y) || 0) - (value(a, y) || 0)), 0));

		const table = el('table', { class: 'compare' });
		const head = el('tr', { class: 'head' });
		head.appendChild(el('th', null, 'Region'));
		for (const y of years) head.appendChild(el('th', null, String(y)));
		table.appendChild(head);

		for (const row of rows) {
			const tr = el('tr');
			const name = el('td');
			const swatch = el('span', { class: 'swatch' });
			swatch.style.background = row.color || '#adb5bd';
			name.appendChild(swatch);
			name.appendChild(document.createTextNode(row.label));
			// note older names, e.g. "Southeastern England & Northwestern Europe" in 2025.
			const older = {};
			for (const y of years) {
				const n = row.names[y];
				if (n && n !== row.label) (older[n] = older[n] || []).push(y);
			}
			const was = Object.keys(older).map(n => n + ' (' + older[n].join(', ') + ')');
			if (was.length) name.appendChild(el('span', { class: 'changed' }, 'was ' + was.join('; ')));
			tr.appendChild(name);
			for (const y of years) {
				const v = value(row, y);
				const c = row.cells[y];
				const td = el('td', { class: v === null ? 'num-cell missing' : 'num-cell' },
					v === null ? '–' : (compareMode === 'estimate' ? v + ' %' : v.toFixed(2) + ' %'));
				if (compareMode === 'estimate' && c && c.estimate) td.title = 'Range ' + c.estimate.lowerConfidence + '–' + c.estimate.upperConfidence + ' %';
				tr.appendChild(td);
			}
			table.appendChild(tr);
		}
		const wrap = el('div', { class: 'wrap' });
		wrap.appendChild(table);
		body.appendChild(wrap);

		body.appendChild(el('p', { class: 'foot' },
			'Ancestry changes its regions with each update, so some don\'t line up from year to year. Rows are matched by region code, or by name when the code changed. ' +
			(compareMode === 'estimate' ? 'Hover over a number to see its range.' : 'Chromosome painter numbers include Unassigned, which only appears from 2026.')));
	}

	// how Ancestry's own chromosome painter draws each chromosome: its length relative to
	// chromosome 1 and where it splits into its two arms (the centromere), both in percent.
	const CHROMOSOME_LENGTH = [100, 97.57, 79.45, 76.69, 72.58, 68.65, 63.85, 58.72, 56.66, 54.38, 54.16,
		53.7, 46.21, 43.07, 41.14, 36.25, 32.58, 31.32, 23.72, 25.29, 19.31, 20.58];
	const CENTROMERE = [49.362, 38.58, 46.462, 26.764, 26.48, 35.257, 37.423, 30.977, 34.606, 30.069, 39.364,
		27.162, 15.195, 16.302, 18.043, 40.768, 29.267, 21.723, 44.279, 44.22, 26.57, 28.263];
	const UNASSIGNED_COLOR = '#979797';

	function regionColor(key, estimate) {
		const r = estimate[key];
		if (key === 'Unassigned') return UNASSIGNED_COLOR;
		if (r && (r.darkColor || r.color)) return r.darkColor || r.color;
		// a region with no estimate entry: give it a stable color of its own.
		let hash = 0;
		for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
		return 'hsl(' + hash + ', 55%, 45%)';
	}

	// draw the chromosome painter: two bars per chromosome (parent 1 on top, parent 2
	// below), each segment placed by its winPercs (start and end as a fraction of the
	// chromosome). Anything not covered stays grey, the same as on Ancestry.
	function drawChromosomes(data, estimate, names) {
		const section = el('div');
		section.appendChild(el('h3', null, 'Chromosome painter'));
		const hint = el('p', { class: 'hint' }, 'Parent 1 on top, Parent 2 below. Click regions in the table to highlight them; click again to remove one. ');
		hint.appendChild(el('button', { class: 'clear', type: 'button' }, 'Clear'));
		section.appendChild(hint);
		const grid = el('div', { class: 'chromosomes' });
		for (let c = 1; c <= 22; c++) {
			grid.appendChild(el('div', { class: 'num' }, String(c)));
			const pair = el('div', { class: 'pair' });
			pair.style.width = CHROMOSOME_LENGTH[c - 1] + '%';
			for (const parent of ['parent1', 'parent2']) {
				const bar = el('div', { class: 'bar' });
				for (const segment of (data[parent] || {})[c] || []) {
					const start = Math.max(0, segment.winPercs[0]);
					const end = Math.min(1, segment.winPercs[1]);
					const seg = el('div', { class: 'seg' });
					seg.dataset.region = segment.region;
					seg.style.left = (100 * start) + '%';
					seg.style.width = (100 * (end - start)) + '%';
					seg.style.background = regionColor(segment.region, estimate);
					const name = segment.region === 'Unassigned' ? 'Unassigned' : (names[segment.region] || segment.region);
					seg.title = name + ' · chromosome ' + c + ', ' + (parent === 'parent1' ? 'parent 1' : 'parent 2') +
						' · ' + Math.round(100 * start) + '–' + Math.round(100 * end) + '% along';
					bar.appendChild(seg);
				}
				const centromere = el('div', { class: 'centromere' });
				centromere.style.left = CENTROMERE[c - 1] + '%';
				bar.appendChild(centromere);
				pair.appendChild(bar);
			}
			grid.appendChild(pair);
		}
		section.appendChild(grid);
		const legend = el('div', { class: 'legend' });
		legend.appendChild(el('span', null, 'Grey: Unassigned, or not covered by the test'));
		section.appendChild(legend);
		return section;
	}

	function render(year, painter, estimate, names, keys, painterData) {
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

		// the chromosome painter split by parent, as a share of all your DNA, so each
		// parent's column adds up to about 50% (the same way Ancestry's parent numbers do).
		const painterByParent = { parent1: {}, parent2: {} };
		if (painterData) {
			let total = 0;
			for (const parent of ['parent1', 'parent2']) {
				for (const chromosome in (painterData[parent] || {})) {
					for (const segment of painterData[parent][chromosome]) {
						const length = segment.windows[1] - segment.windows[0] + 1;
						painterByParent[parent][segment.region] = (painterByParent[parent][segment.region] || 0) + length;
						total += length;
					}
				}
			}
			for (const parent in painterByParent) {
				for (const key in painterByParent[parent]) painterByParent[parent][key] = 100 * painterByParent[parent][key] / total;
			}
		}

		// Ancestry's estimate uses -1 for "none of this region came from that parent", and
		// leaves a grandparent field out when it has no number for it.
		const estimateField = (r, field) => (!r || r[field] === undefined) ? null : (r[field] < 0 ? 0 : r[field]);
		const pct = v => v === null ? '–' : v + ' %';
		const pct2 = v => v === null ? '–' : v.toFixed(2) + ' %';
		const painterParent = (parent, key) => painterData ? (painterByParent[parent][key] || 0) : null;

		const BREAKDOWNS = {
			total: {
				label: 'Total',
				headers: ['Region', 'Chromosome painter', 'Estimate', 'Range'],
				cells: key => {
					const r = estimate[key];
					let range = r ? r.lowerConfidence + '–' + r.upperConfidence + ' %' : '–';
					if (r && r.lowConfidenceAssignment) range += ' *';
					return [pct2(value(painter, key)), r ? pct(r.percentage) : '–', range];
				},
			},
			parent: {
				label: 'By parent',
				groups: [['', 1], ['Parent 1', 2], ['Parent 2', 2]],
				headers: ['Region', 'Painter', 'Estimate', 'Painter', 'Estimate'],
				cells: key => [
					pct2(painterParent('parent1', key)), pct(estimateField(estimate[key], 'parent1')),
					pct2(painterParent('parent2', key)), pct(estimateField(estimate[key], 'parent2')),
				],
			},
			grandparent: {
				label: 'By grandparent',
				groups: [['', 1], ['Parent 1\'s side', 2], ['Parent 2\'s side', 2]],
				headers: ['Region', 'Grandparent 1', 'Grandparent 2', 'Grandparent 1', 'Grandparent 2'],
				cells: key => ['parent1Parent1', 'parent1Parent2', 'parent2Parent1', 'parent2Parent2']
					.map(f => key === 'Unassigned' ? '–' : pct(estimateField(estimate[key], f))),
			},
		};
		const BREAKDOWN_NOTES = {
			total: '',
			parent: 'Each parent\'s numbers are a share of all your DNA, so each parent adds up to about 50%. The painter columns include Unassigned DNA; the estimate columns don\'t.',
			grandparent: 'From your estimate only; the chromosome painter has no grandparent split. These are shares of all your DNA, but Ancestry doesn\'t assign all of each parent\'s DNA to a grandparent, so they add up to less than the parent numbers. "–" means Ancestry gave no number.',
		};

		const switcher = el('div', { class: 'tabs' });
		switcher.style.margin = '0 0 12px';
		body.appendChild(switcher);
		const breakdownNote = el('p', { class: 'hint' });
		body.appendChild(breakdownNote);

		const table = el('table');
		const wrap = el('div', { class: 'wrap' });
		wrap.appendChild(table);
		body.appendChild(wrap);
		const footArea = el('div');
		body.appendChild(footArea);

		let refreshSelection = () => {};

		function buildTable() {
			const mode = BREAKDOWNS[breakdown] ? breakdown : 'total';
			table.innerHTML = '';
			table.className = mode === 'total' ? '' : 'compare';
			// an optional first header row groups columns, e.g. "Parent 1" over its two columns.
			if (BREAKDOWNS[mode].groups) {
				const groupRow = el('tr', { class: 'head group' });
				for (const [text, span] of BREAKDOWNS[mode].groups) groupRow.appendChild(el('th', { colspan: span }, text));
				table.appendChild(groupRow);
			}
			const head = el('tr', { class: 'head' });
			BREAKDOWNS[mode].headers.forEach(h => head.appendChild(el('th', null, h)));
			table.appendChild(head);

			let lowConfidence = false;
			for (const key of rows) {
				const r = estimate[key];
				const tr = el('tr', { class: 'region' });
				tr.dataset.region = key;
				const name = el('td');
				// darkColor is the color Ancestry's chromosome painter uses for the region.
				const swatch = el('span', { class: 'swatch' });
				swatch.style.background = regionColor(key, estimate);
				name.appendChild(swatch);
				name.appendChild(document.createTextNode(key === 'Unassigned' ? 'Unassigned' : (names[key] || key)));
				tr.appendChild(name);
				for (const text of BREAKDOWNS[mode].cells(key)) {
					tr.appendChild(el('td', { class: mode === 'total' ? '' : (text === '–' ? 'num-cell missing' : 'num-cell') }, text));
				}
				if (mode === 'total' && r && r.lowConfidenceAssignment) lowConfidence = true;
				table.appendChild(tr);
			}

			for (const b of switcher.children) b.classList.toggle('active', b.dataset.mode === mode);
			breakdownNote.textContent = BREAKDOWN_NOTES[mode];
			breakdownNote.style.display = BREAKDOWN_NOTES[mode] ? 'block' : 'none';

			footArea.innerHTML = '';
			const foot = [];
			if (lowConfidence) foot.push('* Ancestry marks this region as a low-confidence assignment.');
			if (!hasPainter) foot.push('No chromosome painter data for ' + year + '.');
			if (!hasEstimate) foot.push('No ethnicity estimate for ' + year + '.');
			for (const text of foot) footArea.appendChild(el('p', { class: 'foot' }, text));

			refreshSelection();
		}

		for (const mode in BREAKDOWNS) {
			const b = el('button', { type: 'button' }, BREAKDOWNS[mode].label);
			b.dataset.mode = mode;
			b.addEventListener('click', () => { breakdown = mode; buildTable(); });
			switcher.appendChild(b);
		}

		if (painterData) {
			const chromosomes = drawChromosomes(painterData, estimate, names);
			body.appendChild(chromosomes);

			// clicking region rows highlights their segments. Each click adds or removes one
			// region, so several can be compared at once; Clear removes them all.
			const selected = new Set();
			const clearBtn = chromosomes.querySelector('.clear');
			refreshSelection = function () {
				for (const tr of table.querySelectorAll('tr.region')) tr.classList.toggle('selected', selected.has(tr.dataset.region));
				chromosomes.classList.toggle('dim', selected.size > 0);
				for (const seg of chromosomes.querySelectorAll('.seg')) seg.classList.toggle('on', selected.has(seg.dataset.region));
				clearBtn.style.visibility = selected.size ? 'visible' : 'hidden';
			};
			table.addEventListener('click', e => {
				const row = e.target.closest('tr.region');
				if (!row) return;
				const key = row.dataset.region;
				if (selected.has(key)) selected.delete(key); else selected.add(key);
				refreshSelection();
			});
			clearBtn.addEventListener('click', () => {
				selected.clear();
				refreshSelection();
			});
		}

		buildTable();
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

			const tabResults = root.querySelector('.tab-results');
			const tabCompare = root.querySelector('.tab-compare');
			const yearLabel = root.querySelector('.year-label');
			tabResults.addEventListener('click', () => {
				tabResults.classList.add('active');
				tabCompare.classList.remove('active');
				yearLabel.style.visibility = 'visible';
				load(testId, yearSelect.value).catch(fail);
			});
			tabCompare.addEventListener('click', () => {
				tabCompare.classList.add('active');
				tabResults.classList.remove('active');
				yearLabel.style.visibility = 'hidden';
				compare(testId, years).catch(fail);
			});
			if (years.length < 2) tabCompare.style.display = 'none';

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

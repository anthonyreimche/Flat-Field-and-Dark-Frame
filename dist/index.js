//#region src/cfa.ts
function e(e, t, n) {
	return e.colours[n % e.size * e.size + t % e.size];
}
function t(e) {
	if (!Number.isInteger(e) || e >>> 0 < 1e3) return null;
	let t = [];
	for (let n = 0; n < 2; n++) for (let r = 0; r < 2; r++) {
		let i = e >>> ((n << 1 & 14 | r & 1) << 1) & 3;
		t.push(i === 3 ? 1 : i);
	}
	let n = [
		0,
		1,
		2
	].map((e) => t.filter((t) => t === e).length);
	return n[0] === 1 && n[1] === 2 && n[2] === 1 ? {
		size: 2,
		colours: t
	} : null;
}
var n = [
	1,
	1,
	0,
	1,
	1,
	2,
	1,
	1,
	2,
	1,
	1,
	0,
	2,
	0,
	1,
	0,
	2,
	1,
	1,
	1,
	2,
	1,
	1,
	0,
	1,
	1,
	0,
	1,
	1,
	2,
	0,
	2,
	1,
	2,
	0,
	1
];
function r(e, t) {
	let r = [];
	for (let i = 0; i < 6; i++) for (let a = 0; a < 6; a++) r.push(n[(i + t) % 6 * 6 + (a + e) % 6]);
	return {
		size: 6,
		colours: r
	};
}
function i(e, t, n, r = 0) {
	let i = /* @__PURE__ */ new Float64Array(36), a = /* @__PURE__ */ new Float64Array(36), o = Math.max(1, Math.floor(Math.min(t, n) / 600)) * 6;
	for (let s = 0; s + 6 <= n; s += o) for (let n = 0; n + 6 <= t; n += o) for (let o = 0; o < 6; o++) for (let c = 0; c < 6; c++) i[o * 6 + c] += e[(s + o) * t + n + c] - r, a[o * 6 + c]++;
	return Array.from(i, (e, t) => a[t] > 0 ? e / a[t] : 0);
}
function a(e, t) {
	let n = null, i = [];
	for (let t = 0; t < 6; t++) for (let a = 0; a < 6; a++) {
		let o = r(a, t), s = [
			[],
			[],
			[]
		];
		o.colours.forEach((t, n) => s[t].push(e[n]));
		let c = 0;
		for (let e of s) {
			let t = e.reduce((e, t) => e + t, 0) / e.length;
			for (let n of e) c += (n - t) ** 2;
		}
		i.push({
			pattern: o,
			score: c
		}), (!n || c < n.score) && (n = {
			pattern: o,
			score: c
		});
	}
	if (!n) throw Error("no X-Trans shift");
	let a = n, o = i.filter((e) => Math.abs(e.score - a.score) <= 1e-9 * Math.max(1, a.score)), s = (t, n) => {
		let r = e.filter((e, r) => t.colours[r] === n);
		return r.reduce((e, t) => e + t, 0) / r.length;
	}, c = t[0] > 0 ? t[0] : 1, l = t[2] > 0 ? t[2] : 1, u = o.find((e) => {
		let t = s(e.pattern, 0), n = s(e.pattern, 2);
		return c >= l ? t <= n : t >= n;
	}) ?? a, d = s(u.pattern, 0), f = s(u.pattern, 2), p = Math.abs(d - f) / Math.max(1e-9, Math.max(d, f));
	return {
		pattern: u.pattern,
		redBlueKnown: p > .02 && Math.abs(c - l) / Math.max(c, l) > .02
	};
}
//#endregion
//#region src/grid.ts
function o(e, t, n) {
	return {
		width: Math.ceil(e / n),
		height: Math.ceil(t / n)
	};
}
function s(e, t, n, r, i = 3) {
	let a = Math.min(Math.max(t / e.block - .5, 0), e.width - 1), o = Math.min(Math.max(n / e.block - .5, 0), e.height - 1), s = Math.floor(a), c = Math.floor(o), l = Math.min(s + 1, e.width - 1), u = Math.min(c + 1, e.height - 1), d = a - s, f = o - c, p = (t, n) => e.data[(n * e.width + t) * i + r];
	return (p(s, c) * (1 - d) + p(l, c) * d) * (1 - f) + (p(s, u) * (1 - d) + p(l, u) * d) * f;
}
var c = [
	"area",
	"vertical",
	"horizontal",
	"vertical-horizontal"
], l = 1;
function u(t, n, r, i, a, s = !0) {
	let c = Math.max(6, Math.ceil(Math.max(n, r) / 768)), l = o(n, r, c), u = new Float32Array(l.width * l.height * 3), d = [
		0,
		0,
		0
	], f = [
		0,
		0,
		0
	];
	for (let o = 0; o < l.height; o++) for (let s = 0; s < l.width; s++) {
		d.fill(0), f.fill(0);
		for (let l = o * c; l < Math.min(r, (o + 1) * c); l++) for (let r = s * c; r < Math.min(n, (s + 1) * c); r++) {
			let o = e(i, r, l);
			d[o] += t[l * n + r] - a[o], f[o]++;
		}
		let p = (d[0] + d[1] + d[2]) / Math.max(1, f[0] + f[1] + f[2]);
		for (let e = 0; e < 3; e++) u[(o * l.width + s) * 3 + e] = f[e] ? d[e] / f[e] : p;
	}
	return {
		width: n,
		height: r,
		grid: {
			block: c,
			...l,
			data: u
		},
		redBlueKnown: s
	};
}
function d(e, t, n, r) {
	if (r <= 0) return e;
	let i = new Float32Array(e.length);
	for (let a = 0; a < n * t; a += t) {
		let n = 0, o = 0, s = -1;
		for (let c = 0; c < t; c++) {
			let l = Math.max(0, c - r), u = Math.min(t - 1, c + r);
			for (; s < u;) n += e[a + ++s];
			for (; o < l;) n -= e[a + o++];
			i[a + c] = n / (u - l + 1);
		}
	}
	return i;
}
function f(e, t, n, r) {
	if (r <= 0) return e;
	let i = new Float32Array(e.length), a = new Float64Array(t), o = 0, s = -1;
	for (let c = 0; c < n; c++) {
		let l = Math.max(0, c - r), u = Math.min(n - 1, c + r);
		for (; s < u;) {
			let n = ++s * t;
			for (let r = 0; r < t; r++) a[r] += e[n + r];
		}
		for (; o < l;) {
			let n = o++ * t;
			for (let r = 0; r < t; r++) a[r] -= e[n + r];
		}
		let d = u - l + 1;
		for (let e = 0, n = c * t; e < t; e++) i[n + e] = a[e] / d;
	}
	return i;
}
function p(e, t) {
	let n = new Float32Array(e.width * e.height);
	for (let r = 0; r < n.length; r++) n[r] = e.data[r * 3 + t];
	return n;
}
function m(e, t) {
	let n = 2 * Math.ceil(Math.max(0, Math.min(200, e)) / 2);
	return {
		area: Math.round(n / t),
		line: Math.round(2 * n / t)
	};
}
function h(e, t, n, r) {
	let { area: i, line: a } = m(r, t.block);
	return n === "area" ? f(d(e, t.width, t.height, i), t.width, t.height, i) : n === "vertical" ? f(e, t.width, t.height, a) : d(e, t.width, t.height, a);
}
function g(e, t, n) {
	let r = e.grid, i = new Float32Array(r.data.length), a = e.width / 2, o = e.height / 2;
	for (let e = 0; e < 3; e++) {
		let c = p(r, e), u = h(c, r, t === "vertical-horizontal" ? "area" : t, n), d = s({
			...r,
			data: u
		}, a, o, 0, 1), f = t === "vertical-horizontal" ? h(c, r, "horizontal", n) : null, m = t === "vertical-horizontal" ? h(c, r, "vertical", n) : null;
		for (let t = 0; t < u.length; t++) {
			let n = u[t], r = n <= l || d <= l ? 1 : d / n;
			f && m && n > l && (r *= Math.max(1e-5, n * n / Math.max(1e-5, f[t] * m[t]))), i[t * 3 + e] = r;
		}
	}
	if (!e.redBlueKnown) for (let e = 0; e < i.length; e += 3) i[e] = i[e + 2] = (i[e] + i[e + 2]) / 2;
	return {
		...r,
		data: i
	};
}
//#endregion
//#region src/pack.ts
var _ = 1031, v = 1033;
function y(e) {
	let t = 2166136261;
	for (let n = 0; n < e.length; n++) t ^= e.charCodeAt(n), t = Math.imul(t, 16777619) >>> 0;
	return [t >>> 11 & 2047, t & 2047];
}
var b = (e) => [Math.floor(e / 1024), e % 1024];
function x(e, t) {
	return {
		data: new Float32Array(e * t * 4),
		width: e,
		height: t
	};
}
function S(e, t, n, r) {
	e.data.set(r, (n * e.width + t) * 4);
}
var C = (e) => Math.max(1, Math.ceil(e / 256));
function w(e, t, n) {
	let r = Math.ceil(t / 16), i = /* @__PURE__ */ new Map();
	for (let a of e) {
		let e = a % t, o = Math.floor(a / t), s = Math.max(0, Math.floor((e - 4) / 16)), c = Math.min(r - 1, Math.floor((e + 1 + 4) / 16)), l = Math.max(0, Math.floor((o - 4) / 16)), u = Math.min(Math.ceil(n / 16) - 1, Math.floor((o + 1 + 4) / 16));
		for (let e = l; e <= u; e++) for (let t = s; t <= c; t++) {
			let n = e * r + t, o = i.get(n) ?? [];
			o.length < 8 && o.push(a), i.set(n, o);
		}
	}
	return i;
}
function ee(e, t) {
	let n = Math.ceil(e.width / 16), r = Math.ceil(e.height / 16), i = w(e.hot, e.width, e.height), a = 0;
	for (let e of i.values()) a += e.length;
	let o = 1 + e.glow.height, s = o + C(Math.ceil(e.width / 4)), c = s + C(Math.ceil(e.height / 4)), l = c + C(n * r), u = x(256, l + C(a)), [d, f] = y(t);
	S(u, 0, 0, [
		_,
		d,
		f,
		16
	]), S(u, 1, 0, [
		e.glow.width,
		e.glow.height,
		e.glow.block,
		0
	]), S(u, 2, 0, [
		1,
		o,
		s,
		c
	]), S(u, 3, 0, [
		l,
		n,
		r,
		0
	]), S(u, 4, 0, [...b(e.width), ...b(e.height)]);
	for (let t = 0; t < e.glow.height; t++) for (let n = 0; n < e.glow.width; n++) {
		let r = (t * e.glow.width + n) * 3;
		S(u, n, 1 + t, [
			e.glow.data[r],
			e.glow.data[r + 1],
			e.glow.data[r + 2],
			1
		]);
	}
	let p = (e, t) => {
		for (let n = 0; n < e.length; n++) {
			let r = Math.floor(n / 4);
			u.data[((t + Math.floor(r / 256)) * 256 + r % 256) * 4 + n % 4] = e[n];
		}
	};
	p(e.cols, o), p(e.rows, s);
	let m = 0;
	for (let t = 0; t < n * r; t++) {
		let n = i.get(t) ?? [];
		S(u, t % 256, c + Math.floor(t / 256), [
			...b(m),
			n.length,
			0
		]);
		for (let t of n) {
			let n = m++;
			S(u, n % 256, l + Math.floor(n / 256), [...b(t % e.width), ...b(Math.floor(t / e.width))]);
		}
	}
	return u;
}
function te(e, t, n, r) {
	let i = x(Math.max(4, e.width), e.height + 1), [a, o] = y(r);
	S(i, 0, 0, [
		v,
		a,
		o,
		e.block
	]), S(i, 1, 0, [
		e.width,
		e.height,
		0,
		0
	]), S(i, 2, 0, [...b(t), ...b(n)]);
	let s = i.data;
	for (let t = 0; t < e.height; t++) for (let n = 0, r = t * e.width * 3, a = (t + 1) * i.width * 4; n < e.width; n++, r += 3, a += 4) s[a] = e.data[r], s[a + 1] = e.data[r + 1], s[a + 2] = e.data[r + 2], s[a + 3] = 1;
	return i;
}
//#endregion
//#region src/flat-job.ts
function ne(e, t) {
	return te(g(e, t.blur, t.radius), e.width, e.height, t.name);
}
//#endregion
//#region src/flat-worker.ts?worker&inline
var re = "(function(){function e(e,t,n,r,i=3){let a=Math.min(Math.max(t/e.block-.5,0),e.width-1),o=Math.min(Math.max(n/e.block-.5,0),e.height-1),s=Math.floor(a),c=Math.floor(o),l=Math.min(s+1,e.width-1),u=Math.min(c+1,e.height-1),d=a-s,f=o-c,p=(t,n)=>e.data[(n*e.width+t)*i+r];return(p(s,c)*(1-d)+p(l,c)*d)*(1-f)+(p(s,u)*(1-d)+p(l,u)*d)*f}function t(e,t,n,r){if(r<=0)return e;let i=new Float32Array(e.length);for(let a=0;a<n*t;a+=t){let n=0,o=0,s=-1;for(let c=0;c<t;c++){let l=Math.max(0,c-r),u=Math.min(t-1,c+r);for(;s<u;)n+=e[a+ ++s];for(;o<l;)n-=e[a+o++];i[a+c]=n/(u-l+1)}}return i}function n(e,t,n,r){if(r<=0)return e;let i=new Float32Array(e.length),a=new Float64Array(t),o=0,s=-1;for(let c=0;c<n;c++){let l=Math.max(0,c-r),u=Math.min(n-1,c+r);for(;s<u;){let n=++s*t;for(let r=0;r<t;r++)a[r]+=e[n+r]}for(;o<l;){let n=o++*t;for(let r=0;r<t;r++)a[r]-=e[n+r]}let d=u-l+1;for(let e=0,n=c*t;e<t;e++)i[n+e]=a[e]/d}return i}function r(e,t){let n=new Float32Array(e.width*e.height);for(let r=0;r<n.length;r++)n[r]=e.data[r*3+t];return n}function i(e,t){let n=2*Math.ceil(Math.max(0,Math.min(200,e))/2);return{area:Math.round(n/t),line:Math.round(2*n/t)}}function a(e,r,a,o){let{area:s,line:c}=i(o,r.block);return a===`area`?n(t(e,r.width,r.height,s),r.width,r.height,s):a===`vertical`?n(e,r.width,r.height,c):t(e,r.width,r.height,c)}function o(t,n,i){let o=t.grid,s=new Float32Array(o.data.length),c=t.width/2,l=t.height/2;for(let t=0;t<3;t++){let u=r(o,t),d=a(u,o,n===`vertical-horizontal`?`area`:n,i),f=e({...o,data:d},c,l,0,1),p=n===`vertical-horizontal`?a(u,o,`horizontal`,i):null,m=n===`vertical-horizontal`?a(u,o,`vertical`,i):null;for(let e=0;e<d.length;e++){let n=d[e],r=n<=1||f<=1?1:f/n;p&&m&&n>1&&(r*=Math.max(1e-5,n*n/Math.max(1e-5,p[e]*m[e]))),s[e*3+t]=r}}if(!t.redBlueKnown)for(let e=0;e<s.length;e+=3)s[e]=s[e+2]=(s[e]+s[e+2])/2;return{...o,data:s}}function s(e){let t=2166136261;for(let n=0;n<e.length;n++)t^=e.charCodeAt(n),t=Math.imul(t,16777619)>>>0;return[t>>>11&2047,t&2047]}let c=e=>[Math.floor(e/1024),e%1024];function l(e,t){return{data:new Float32Array(e*t*4),width:e,height:t}}function u(e,t,n,r){e.data.set(r,(n*e.width+t)*4)}function d(e,t,n,r){let i=l(Math.max(4,e.width),e.height+1),[a,o]=s(r);u(i,0,0,[1033,a,o,e.block]),u(i,1,0,[e.width,e.height,0,0]),u(i,2,0,[...c(t),...c(n)]);let d=i.data;for(let t=0;t<e.height;t++)for(let n=0,r=t*e.width*3,a=(t+1)*i.width*4;n<e.width;n++,r+=3,a+=4)d[a]=e.data[r],d[a+1]=e.data[r+1],d[a+2]=e.data[r+2],d[a+3]=1;return i}function f(e,t){return d(o(e,t.blur,t.radius),e.width,e.height,t.name)}function p(){let e=/* @__PURE__ */ new Map;return t=>{if(`forget`in t)return e.delete(t.forget),null;t.flat&&e.set(t.master,t.flat);let n=e.get(t.master);if(!n)return{error:`master ${t.master} wasn't sent`};try{return{texture:f(n,t.need)}}catch(e){return{error:e instanceof Error?e.message:String(e)}}}}let m=p();onmessage=e=>{let t=m(e.data);t&&postMessage(t,{transfer:`texture`in t?[t.texture.data.buffer]:[]})}})();\n//# sourceMappingURL=flat-worker-9YEh8pNh.js.map", ie = typeof self < "u" && self.Blob && new Blob(["(self.URL || self.webkitURL).revokeObjectURL(self.location.href);", re], { type: "text/javascript;charset=utf-8" });
function ae(e) {
	let t;
	try {
		if (t = ie && (self.URL || self.webkitURL).createObjectURL(ie), !t) throw "";
		let n = new Worker(t, { name: e?.name });
		return n.addEventListener("error", () => {
			(self.URL || self.webkitURL).revokeObjectURL(t);
		}), n;
	} catch {
		return new Worker("data:text/javascript;charset=utf-8," + encodeURIComponent(re), { name: e?.name });
	}
}
//#endregion
//#region src/flat-maker.ts
var oe = {
	make: async (e, t, n) => {
		n?.throwIfAborted();
		let r = await t();
		return r && ne(r, e);
	},
	forget: () => void 0,
	dispose: () => void 0
}, se = 3e4, ce = class extends Error {}, le = class {
	open;
	worker = null;
	sent = /* @__PURE__ */ new Set();
	failed = !1;
	chain = Promise.resolve();
	idle = null;
	stopped = !1;
	abandon = null;
	constructor(e = () => new ae({ name: "Flat field blur" })) {
		this.open = e;
	}
	make(e, t, n) {
		let r = () => (n?.throwIfAborted(), this.run(e, t)), i = this.chain.then(r, r);
		return this.chain = i.catch(() => void 0), i;
	}
	forget(e) {
		this.sent.delete(e) && this.worker?.postMessage({ forget: e });
	}
	dispose() {
		this.stopped = !0, this.idle && clearTimeout(this.idle), this.idle = null, this.abandon?.(/* @__PURE__ */ Error("the flat field maker was stopped")), this.end();
	}
	start() {
		if (this.failed) return null;
		try {
			this.worker ??= this.open();
		} catch {
			this.failed = !0;
		}
		return this.worker;
	}
	end() {
		this.worker?.terminate(), this.worker = null, this.sent.clear();
	}
	async run(e, t) {
		if (this.stopped) throw Error("the flat field maker was stopped");
		this.idle && clearTimeout(this.idle);
		let n = this.start();
		if (!n) return oe.make(e, t);
		let r = null;
		if (!this.sent.has(e.id)) {
			if (r = await t(), !r) return null;
			if (this.stopped || this.worker !== n) return this.run(e, t);
		}
		try {
			return await new Promise((t, i) => {
				this.abandon = i, n.onmessage = ({ data: e }) => "texture" in e ? t(e.texture) : i(Error(e.error)), n.onerror = (e) => {
					e.preventDefault(), i(new ce(e.message || "the flat field worker failed"));
				}, this.sent.add(e.id), n.postMessage({
					master: e.id,
					flat: r ?? void 0,
					need: e
				});
			});
		} catch (n) {
			if (!(n instanceof ce)) throw n;
			return console.warn("[flat-field-dark-frame] the flat field worker failed; flats are made on the main thread from now on", n), this.failed = !0, this.end(), oe.make(e, t);
		} finally {
			this.abandon = null, this.stopped || (this.idle = setTimeout(() => this.end(), se));
		}
	}
}, T = (e) => typeof e == "number" && Number.isFinite(e) ? e : 0, ue = (e) => typeof e == "string" ? e.trim() : "", E = (e) => typeof e == "object" && e ? e : {}, de = (e, t) => {
	let n = Array.isArray(e) ? e : [];
	return Array.from({ length: t }, (e, t) => T(n[t]));
};
function fe(e) {
	for (let t of [
		"SensorTemperature",
		"CameraTemperature",
		"SensorTemperature2",
		"exifAmbientTemperature",
		"AmbientTemperature"
	]) {
		let n = e[t];
		if (typeof n == "number" && Number.isFinite(n) && n > -100 && n < 150) return n;
	}
	return null;
}
function pe(e) {
	if (!Array.isArray(e) || e.length < 3) return null;
	let t = e.slice(0, 3).map((e) => de(e, 3));
	return t.some((e) => e.every((e) => e === 0)) ? null : [
		t[0],
		t[1],
		t[2]
	];
}
function me(e) {
	let t = e.raw_width - e.left_margin, n = e.raw_height - e.top_margin, { width: r, height: i } = e;
	return r <= t && i <= n ? {
		width: r,
		height: i
	} : i <= t && r <= n ? {
		width: i,
		height: r
	} : {
		width: Math.min(r, t),
		height: Math.min(i, n)
	};
}
function he(e, t) {
	let n = E(e), r = E(n.color_data), i = E(n.lens), a = n.timestamp instanceof Date ? n.timestamp.getTime() : typeof n.timestamp == "number" ? n.timestamp * 1e3 : NaN;
	return {
		make: ue(n.camera_make),
		model: ue(n.camera_model),
		lens: ue(i.Lens),
		iso: T(n.iso_speed),
		shutter: T(n.shutter),
		aperture: T(n.aperture),
		focal: T(n.focal_len),
		temperature: fe(E(n.metadata_common)),
		timestamp: Number.isFinite(a) && a > 0 ? a : null,
		width: t.width,
		height: t.height,
		flip: T(n.flip),
		filters: T(n.filters) >>> 0,
		black: T(r.black),
		white: T(r.maximum),
		camMul: de(r.cam_mul, 4),
		preMul: de(r.pre_mul, 4),
		rgbCam: pe(r.rgb_cam)
	};
}
function ge(e) {
	return e.width < 16 || e.height < 16 ? "LibRaw read no sensor data from it" : e.filters === 0 ? "its sensor has no colour filter mosaic (a monochrome, Foveon or already demosaiced file)" : e.filters !== 9 && !t(e.filters) ? "its sensor layout isn't Bayer or X-Trans" : e.white > e.black ? null : "LibRaw reported no white level for it";
}
function _e(e) {
	return e.filters === 9 ? null : t(e.filters);
}
function ve(e) {
	let { width: t, height: n } = me(e), r = new Uint16Array(t * n);
	for (let i = 0; i < n; i++) {
		let n = (i + e.top_margin) * e.raw_width + e.left_margin;
		r.set(e.data.subarray(n, n + t), i * t);
	}
	return {
		mosaic: r,
		width: t,
		height: n
	};
}
function ye(e) {
	let t = e.camMul[0] > 0 && e.camMul[2] > 0 ? e.camMul : e.preMul, n = t[0] > 0 ? t[0] : 1, r = t[1] > 0 ? t[1] : 1, i = t[2] > 0 ? t[2] : 1, a = Math.min(n, r, i);
	return [
		n / a,
		r / a,
		i / a
	];
}
//#endregion
//#region src/levels.ts
var be = 8;
function D(e) {
	let t = Float64Array.from(e).sort();
	if (t.length === 0) return 0;
	let n = t.length >> 1;
	return t.length % 2 ? t[n] : (t[n - 1] + t[n]) / 2;
}
function xe(t, n) {
	let { left_margin: r, top_margin: i, raw_width: a, raw_height: o, data: s } = t, c = [
		[],
		[],
		[]
	], l = (t, o) => {
		let l = n ? e(n, Se(t - r, n.size), Se(o - i, n.size)) : 1;
		c[l].length < 2e5 && c[l].push(s[o * a + t]);
	};
	if (r >= be) for (let e = i; e < o; e += 3) for (let t = 2; t < r - 2; t++) l(t, e);
	if (i >= be) for (let e = 2; e < i - 2; e++) for (let t = r; t < a; t += 3) l(t, e);
	if (c.every((e) => e.length === 0)) return null;
	let u = D(c.flat());
	return [
		0,
		1,
		2
	].map((e) => c[e].length ? D(c[e]) : u);
}
var Se = (e, t) => (e % t + t) % t;
function Ce(e, t) {
	return e <= 0 && t && t.some((e) => e > 0) ? {
		black: t,
		source: "masked"
	} : {
		black: [
			e,
			e,
			e
		],
		source: "file"
	};
}
var we = .001, Te = 1e5, Ee = class {
	sum = null;
	count = 0;
	width = 0;
	height = 0;
	add(e) {
		if (!this.sum) this.sum = new Float32Array(e.width * e.height), this.width = e.width, this.height = e.height;
		else if (e.width !== this.width || e.height !== this.height) throw Error("the frames differ in size");
		for (let t = 0; t < e.data.length; t++) this.sum[t] += e.data[t];
		this.count++;
	}
	mean() {
		let e = this.sum;
		if (!e) throw Error("no frames");
		for (let t = 0; t < e.length; t++) e[t] /= this.count;
		return this.sum = null, e;
	}
	get frames() {
		return this.count;
	}
};
function De(t, n, r, i, a) {
	let o = (t) => r ? e(r, t % n, Math.floor(t / n)) : 1, s = a - (i[0] + i[1] + i[2]) / 3, c = [
		[],
		[],
		[]
	], l = Math.max(1, Math.floor(t.length / 3e5));
	for (let e = 0; e < t.length; e += l) c[o(e)].push(t[e]);
	let u = c.map((e) => e.length ? D(e) : NaN).map((e, t) => Number.isNaN(e) ? i[t] : e), d = u.some((e, t) => i[t] - e > .002 * s), f = i.every((e) => e <= 0) && u.some((e) => e > .02 * s), p = d || f, m = p ? u : i, h = new Float32Array(t.length);
	for (let e = 0; e < t.length; e++) h[e] = (t[e] - m[o(e)]) / s;
	return {
		signal: h,
		estimated: p
	};
}
function Oe(t, n, r, i) {
	let a = Math.max(6, Math.ceil(Math.max(n, r) / 256)), s = o(n, r, a), c = new Float32Array(s.width * s.height * 3), l = [
		[],
		[],
		[]
	];
	for (let o = 0; o < s.height; o++) for (let u = 0; u < s.width; u++) {
		for (let e of l) e.length = 0;
		for (let s = o * a; s < Math.min(r, (o + 1) * a); s++) for (let r = u * a; r < Math.min(n, (u + 1) * a); r++) l[i ? e(i, r, s) : 1].push(t[s * n + r]);
		let d = D(l.flat());
		for (let e = 0; e < 3; e++) c[(o * s.width + u) * 3 + e] = i && l[e].length ? D(l[e]) : d;
	}
	return {
		block: a,
		...s,
		data: c
	};
}
var ke = (e, t) => Math.max(1, Math.floor(e / t));
function Ae(t, n, r, i, a, o) {
	let { signal: c, estimated: l } = De(t, n, i, a, o), u = Oe(c, n, r, i), d = (t, n) => i ? e(i, t, n) : 1, f = new Float32Array(c.length);
	for (let e = 0; e < r; e++) for (let t = 0; t < n; t++) {
		let r = e * n + t;
		f[r] = c[r] - s(u, t + .5, e + .5, d(t, e));
	}
	let p = new Float32Array(n), m = ke(r, 1500), h = [];
	for (let e = 0; e < n; e++) {
		h.length = 0;
		for (let t = 0; t < r; t += m) h.push(f[t * n + e]);
		p[e] = D(h);
	}
	let g = new Float32Array(r), _ = ke(n, 1500), v = [];
	for (let e = 0; e < r; e++) {
		v.length = 0;
		for (let t = 0; t < n; t += _) v.push(f[e * n + t] - p[t]);
		g[e] = D(v);
	}
	for (let e = 0; e < r; e++) for (let t = 0; t < n; t++) f[e * n + t] -= p[t] + g[e];
	let y = [], b = ke(f.length, 4e5);
	for (let e = 0; e < f.length; e += b) y.push(Math.abs(f[e]));
	let x = 1.4826 * D(y), S = Math.max(8 * x, we), C = [];
	for (let e = 0; e < f.length; e++) f[e] > S && C.push(e);
	C.sort((e, t) => f[t] - f[e]);
	let w = D(Array.from({ length: Math.ceil(c.length / b) }, (e, t) => c[t * b]));
	return {
		width: n,
		height: r,
		glow: u,
		cols: p,
		rows: g,
		hot: Uint32Array.from(C.slice(0, Te)),
		level: w,
		noise: x,
		blackEstimated: l
	};
}
//#endregion
//#region src/match.ts
var O = (e) => e.trim().toLowerCase().replace(/\s+/g, " ");
function k(e, t) {
	return O(e.model) !== "" && O(e.make) === O(t.make) && O(e.model) === O(t.model);
}
function je(e, t) {
	return e.width === t.width && e.height === t.height;
}
function Me(e, t) {
	return O(e.lens) === O(t.lens);
}
var Ne = (e, t) => e > 0 && t > 0 ? Math.abs(Math.log2(e / t)) : 0, Pe = (e, t) => e !== null && t !== null ? Math.abs(e - t) / 864e5 : 0;
function Fe(e, t) {
	let n = e.temperature !== null && t.temperature !== null ? Math.abs(e.temperature - t.temperature) / 5 : 0;
	return Ne(e.iso, t.iso) + Ne(e.shutter, t.shutter) + n + Pe(e.timestamp, t.timestamp) / 3650;
}
function Ie(e, t) {
	return 2 * Ne(e.aperture, t.aperture) + Ne(e.focal, t.focal) + Pe(e.timestamp, t.timestamp) / 3650;
}
function Le(e, t, n) {
	let r = null;
	for (let i of t) {
		let t = n(e, i.shot);
		(!r || t < r.score) && (r = {
			master: i,
			score: t
		});
	}
	return r ?? {
		master: null,
		reason: "no match"
	};
}
function Re(e, t) {
	let n = t.filter((t) => t.kind === "dark" && k(e, t.shot));
	if (n.length === 0) return {
		master: null,
		reason: `No dark frame from the ${e.model || "camera"} yet.`
	};
	let r = n.filter((t) => je(e, t.shot));
	return r.length === 0 ? {
		master: null,
		reason: "No dark frame at this photo's frame size."
	} : Le(e, r, Fe);
}
function ze(e, t) {
	let n = t.filter((t) => t.kind === "flat" && k(e, t.shot));
	if (n.length === 0) return {
		master: null,
		reason: `No flat field from the ${e.model || "camera"} yet.`
	};
	let r = n.filter((t) => je(e, t.shot));
	if (r.length === 0) return {
		master: null,
		reason: "No flat field at this photo's frame size."
	};
	let i = r.filter((t) => Me(e, t.shot));
	return i.length === 0 ? {
		master: null,
		reason: e.lens ? `No flat field with the ${e.lens}.` : "No flat field without a recorded lens."
	} : Le(e, i, Ie);
}
function Be(e, t) {
	return k(e, t.shot) ? je(e, t.shot) ? null : "It's at another frame size." : "It's from another camera.";
}
//#endregion
//#region src/library.ts
function Ve(e) {
	return {
		make: e.make,
		model: e.model,
		lens: e.lens,
		iso: e.iso,
		shutter: e.shutter,
		aperture: e.aperture,
		focal: e.focal,
		temperature: e.temperature,
		timestamp: e.timestamp,
		width: e.width,
		height: e.height
	};
}
var A = class extends Error {}, j = (e) => e.length ? D(e) : 0;
function He(e, t) {
	let n = e.map((e) => e.temperature).filter((e) => e !== null), r = e.map((e) => e.timestamp).filter((e) => e !== null);
	return {
		...t,
		iso: j(e.map((e) => e.iso)),
		shutter: j(e.map((e) => e.shutter)),
		aperture: j(e.map((e) => e.aperture)),
		focal: j(e.map((e) => e.focal)),
		temperature: n.length ? n.reduce((e, t) => e + t, 0) / n.length : null,
		timestamp: r.length ? Math.max(...r) : null
	};
}
async function Ue(e, t, n, r, o = Date.now()) {
	if (t < 1) throw new A("Pick at least one frame.");
	let s = new Ee(), c = [], l = null;
	for (let r = 0; r < t; r++) {
		let { name: t, info: i, readout: a } = await n(r), o = ge(i);
		if (o) throw new A(`${t} can't be used: ${o}.`);
		let u = Ve(i);
		if (l) {
			if (!k(l.shot, u)) throw new A(`${t} is from another camera (${u.make} ${u.model}).`);
			if (!je(l.shot, u)) throw new A(`${t} has another frame size (${u.width} × ${u.height}).`);
			if (e === "flat" && !Me(l.shot, u)) throw new A(`${t} was shot with another lens (${u.lens || "none recorded"}).`);
		} else l = {
			info: i,
			readout: a,
			shot: u
		};
		let d = ve(a);
		s.add({
			width: d.width,
			height: d.height,
			data: d.mosaic
		}), c.push({
			name: t,
			iso: u.iso,
			shutter: u.shutter,
			aperture: u.aperture,
			focal: u.focal,
			temperature: u.temperature,
			timestamp: u.timestamp
		});
	}
	if (!l) throw new A("Pick at least one frame.");
	let { info: d, readout: f } = l, p = s.width, m = s.height, h = [], g = _e(d), _ = Ce(d.black, xe(f, g));
	_.source === "masked" && h.push("Black level measured from the sensor's masked border.");
	let v = s.mean(), y = {
		id: r,
		kind: e,
		created: o,
		shot: He(c, l.shot),
		frames: c,
		black: _.black,
		blackSource: _.source,
		white: d.white,
		notes: h
	};
	if (e === "dark") {
		let e = Ae(v, p, m, g, _.black, d.white);
		return e.blackEstimated && (y.blackSource = "frame", h.push("The file's black level didn't fit these frames, so their own median level stands in for it: dark current that is even across the frame isn't taken off.")), g || h.push("X-Trans: the dark's glow is taken off all colours alike."), y.hot = e.hot.length, y.level = e.level, {
			summary: y,
			dark: e
		};
	}
	let b, x = !0;
	if (g) b = g;
	else {
		let e = a(i(v, p, m, _.black[1]), d.camMul);
		b = e.pattern, x = e.redBlueKnown, x || h.push("X-Trans: red and blue read too alike to tell apart, so their shading is corrected together.");
	}
	let S = u(v, p, m, b, _.black, x), C = Math.min(...S.grid.data.filter((e) => e > 1)), w = S.grid.data[(Math.floor(S.grid.height / 2) * S.grid.width + Math.floor(S.grid.width / 2)) * 3 + 1];
	return y.strongest = C > 0 && w > 0 ? w / C : void 0, {
		summary: y,
		flat: S
	};
}
function M(e) {
	let t = [e.kind === "dark" ? "Dark" : "Flat"];
	return e.kind === "flat" && e.shot.lens && t.push(e.shot.lens), e.kind === "flat" && e.shot.focal > 0 && t.push(`${Math.round(e.shot.focal)} mm`), e.kind === "flat" && e.shot.aperture > 0 && t.push(`f/${e.shot.aperture.toFixed(1).replace(/\.0$/, "")}`), e.kind === "dark" && e.shot.iso > 0 && t.push(`ISO ${Math.round(e.shot.iso)}`), e.kind === "dark" && e.shot.shutter > 0 && t.push(We(e.shot.shutter)), t.join(" · ");
}
function We(e) {
	return e >= .5 ? `${Number(e.toFixed(1))} s` : `1/${Math.round(1 / e)} s`;
}
//#endregion
//#region src/rt.ts
var N, P;
function Ge(e) {
	P = e, N = e.react;
}
//#endregion
//#region src/libraw.ts
var Ke = class {
	worker;
	chain = Promise.resolve();
	constructor() {
		this.worker = new Worker(P.assetUrl("dist/libraw/worker.js"), { type: "module" });
	}
	call(e, t, n = []) {
		let r = () => new Promise((r, i) => {
			this.worker.onmessage = ({ data: e }) => e?.error ? i(Error(e.error)) : r(e?.out), this.worker.onerror = (e) => i(Error(e.message || "the LibRaw worker failed")), this.worker.postMessage({
				fn: e,
				args: t
			}, n);
		}), i = this.chain.then(r, r);
		return this.chain = i.catch(() => void 0), i;
	}
	async open(e) {
		let t = new Uint8Array(e);
		await this.call("open", [t, {}], [t.buffer]);
	}
	metadata() {
		return this.call("metadata", [!0]);
	}
	async rawImageData() {
		let e = await this.call("rawImageData", []);
		if (!e || !(e.data instanceof Uint16Array)) return null;
		let t = (e) => typeof e == "number" ? e : 0;
		return {
			raw_width: t(e.raw_width),
			raw_height: t(e.raw_height),
			top_margin: t(e.top_margin),
			left_margin: t(e.left_margin),
			width: t(e.width),
			height: t(e.height),
			data: e.data
		};
	}
	dispose() {
		this.worker.terminate();
	}
};
async function qe(e, t) {
	await e.open(await t.arrayBuffer());
	let n = await e.rawImageData();
	if (!n || n.data.length < n.raw_width * n.raw_height || n.raw_width === 0) throw Error("LibRaw read no sensor data from it");
	return {
		info: he(await e.metadata(), me(n)),
		readout: n
	};
}
async function Je(e, t) {
	await e.open(await t.arrayBuffer());
	let n = await e.metadata(), r = (e) => typeof n?.[e] == "number" ? n[e] : 0;
	return he(n, me({
		raw_width: r("raw_width"),
		raw_height: r("raw_height"),
		top_margin: r("top_margin"),
		left_margin: r("left_margin"),
		width: r("width"),
		height: r("height")
	}));
}
var Ye = {
	A: .5323,
	B: 1.2015,
	C: .0293,
	D: -.4781,
	E: 1.9616,
	F: .2281,
	G: +.051500000000000073.toFixed(4)
}, Xe = [
	[
		1.6638,
		-.5403,
		-.1235
	],
	[
		-.1671,
		1.568,
		-.4009
	],
	[
		.0207,
		-.4477,
		1.427
	]
];
function Ze(e) {
	let [[t, n, r], [i, a, o], [s, c, l]] = e, u = a * l - o * c, d = o * s - i * l, f = i * c - a * s, p = 1 / (t * u + n * d + r * f);
	return [
		[
			u * p,
			(r * c - n * l) * p,
			(n * o - r * a) * p
		],
		[
			d * p,
			(t * l - r * s) * p,
			(r * i - t * o) * p
		],
		[
			f * p,
			(n * s - t * c) * p,
			(t * a - n * i) * p
		]
	];
}
function F(e) {
	return [
		e[0][0],
		e[1][0],
		e[2][0],
		e[0][1],
		e[1][1],
		e[2][1],
		e[0][2],
		e[1][2],
		e[2][2]
	];
}
function Qe(e, t) {
	let n = e.rgbCam ?? Xe, r = ye(e), i = typeof t == "number" && Number.isFinite(t) ? 2 ** -t : 1;
	return [
		0,
		1,
		2
	].map((e) => [
		0,
		1,
		2
	].map((t) => n[e][t] * r[t] * i));
}
//#endregion
//#region src/params.ts
var I = "flat-field-dark-frame", L = `${I}.correct`, $e = `${I}.panel`, et = `${I}.library`, R = (e) => `${L}.${e}`, z = {
	dark: "darkMaster",
	flat: "flatMaster"
}, B = "auto", tt = {
	dark: !1,
	darkPick: B,
	flat: !1,
	flatPick: B,
	blur: "area",
	radius: 32,
	clip: 0
}, V = {
	darkPick: R("darkPick"),
	flatPick: R("flatPick"),
	blur: R("blur"),
	radius: R("radius")
}, H = {
	darkOn: R("darkOn"),
	flatOn: R("flatOn"),
	clip: R("clip"),
	pass: R("pass"),
	toSensorUv: R("toSensorUv"),
	sensorSize: R("sensorSize"),
	toSensor: R("toSensor"),
	toWorking: R("toWorking"),
	darkSig: R("darkSig"),
	flatSig: R("flatSig")
}, U = {
	dark: R(z.dark),
	flat: R(z.flat)
}, nt = F(Xe), rt = F(Ze(Xe)), it = [
	1,
	0,
	0,
	0,
	1,
	0,
	0,
	0,
	1
], W = [-1, -1], G = (e, t) => typeof e == "number" && Number.isFinite(e) ? e : t;
function K(e) {
	let t = e(V.blur), n = e(V.darkPick), r = e(V.flatPick);
	return {
		dark: G(e(H.darkOn), 0) > .5,
		darkPick: typeof n == "string" && n ? n : B,
		flat: G(e(H.flatOn), 0) > .5,
		flatPick: typeof r == "string" && r ? r : B,
		blur: c.includes(t) ? t : tt.blur,
		radius: Math.min(200, Math.max(0, Math.round(G(e(V.radius), tt.radius)))),
		clip: Math.min(1, Math.max(0, G(e(H.clip), 0)))
	};
}
function at(e) {
	let t = {};
	return e.dark !== void 0 && (t[H.darkOn] = +!!e.dark), e.flat !== void 0 && (t[H.flatOn] = +!!e.flat), e.darkPick !== void 0 && (t[V.darkPick] = e.darkPick), e.flatPick !== void 0 && (t[V.flatPick] = e.flatPick), e.blur !== void 0 && (t[V.blur] = e.blur), e.radius !== void 0 && (t[V.radius] = e.radius), e.clip !== void 0 && (t[H.clip] = e.clip), t;
}
var ot = [
	...Object.values(V),
	...Object.values(H),
	...Object.values(U)
], st = `${I}.library`;
function ct(e) {
	if (typeof e != "object" || !e) return null;
	let t = e;
	return (t.kind === "master-added" || t.kind === "master-removed") && typeof t.id == "string" ? {
		kind: t.kind,
		id: t.id
	} : null;
}
var lt = (e) => {
	if (typeof BroadcastChannel != "function") return null;
	let t = new BroadcastChannel(st);
	return t.onmessage = (t) => {
		let n = ct(t.data);
		n && e(n);
	}, {
		post: (e) => t.postMessage(e),
		close: () => t.close()
	};
}, ut = [
	1,
	0,
	0,
	0,
	1,
	0,
	0,
	0,
	1
];
function dt(e, t) {
	let n = [];
	for (let r = 0; r < 3; r++) for (let i = 0; i < 3; i++) n.push(e[r * 3] * t[i] + e[r * 3 + 1] * t[3 + i] + e[r * 3 + 2] * t[6 + i]);
	return n;
}
function ft(e) {
	switch ((e % 360 + 360) % 360) {
		case 90: return [
			0,
			1,
			0,
			-1,
			0,
			1,
			0,
			0,
			1
		];
		case 180: return [
			-1,
			0,
			1,
			0,
			-1,
			1,
			0,
			0,
			1
		];
		case 270: return [
			0,
			-1,
			1,
			1,
			0,
			0,
			0,
			0,
			1
		];
		default: return ut;
	}
}
function pt(e) {
	let t = ut;
	return e & 4 && (t = [
		0,
		1,
		0,
		1,
		0,
		0,
		0,
		0,
		1
	]), e & 2 && (t = dt([
		1,
		0,
		0,
		0,
		-1,
		1,
		0,
		0,
		1
	], t)), e & 1 && (t = dt([
		-1,
		0,
		1,
		0,
		1,
		0,
		0,
		0,
		1
	], t)), t;
}
function mt(e) {
	return e === 3 ? 180 : e === 6 ? 90 : e === 8 ? 270 : 0;
}
function ht(e, t) {
	return (((e ?? mt(t)) - mt(t)) % 360 + 360) % 360;
}
function gt(e, t) {
	return dt(pt(e), ft(t));
}
function _t(e) {
	return [
		e[0],
		e[3],
		e[6],
		e[1],
		e[4],
		e[7],
		e[2],
		e[5],
		e[8]
	];
}
//#endregion
//#region src/resolve.ts
var vt = "Flat field and dark frame correction works on RAW photos only: a JPEG, TIFF or other rendered file has no sensor data left to correct.", yt = {
	area: "a",
	vertical: "v",
	horizontal: "h",
	"vertical-horizontal": "x"
}, bt = (e) => `d${e}`;
function xt(e) {
	let t = typeof e == "string" ? /^d([^-]+)$/.exec(e) : null;
	return t ? t[1] : null;
}
var St = (e, t, n) => `f${e}-${yt[t]}${n}`, Ct = new Map(Object.entries(yt).map(([e, t]) => [t, e]));
function wt(e) {
	let t = typeof e == "string" ? /^f([^-]+)-([a-z])(\d{1,4})$/.exec(e) : null, n = t ? Ct.get(t[2]) : void 0;
	return t && n ? {
		id: t[1],
		blur: n,
		radius: Number(t[3]),
		name: t[0]
	} : null;
}
function Tt(e, t, n, r, i, a) {
	if (!e) return { state: "off" };
	if (t !== "auto") {
		let e = r.find((e) => e.id === t && e.kind === a);
		if (!e) return {
			state: "none",
			reason: `The ${a === "dark" ? "dark frame" : "flat field"} picked for this photo is no longer in the library.`
		};
		let n = Be(i, e);
		return n ? {
			state: "none",
			reason: n
		} : {
			state: "matched",
			master: e,
			auto: !1
		};
	}
	let o = n();
	return o.master ? {
		state: "matched",
		master: o.master,
		auto: !0
	} : {
		state: "none",
		reason: o.reason
	};
}
var q = {
	[H.pass]: 0,
	[H.darkSig]: W,
	[H.flatSig]: W,
	[U.dark]: "",
	[U.flat]: ""
};
function J(e, t, n, r) {
	let i = {
		blocked: null,
		reading: !1,
		dark: { state: "off" },
		flat: { state: "off" }
	};
	if (!e.dark && !e.flat) return {
		status: i,
		mirrors: q,
		flatNeed: null
	};
	if (!t.isRaw) return {
		status: {
			...i,
			blocked: vt
		},
		mirrors: q,
		flatNeed: null
	};
	if (!n) return {
		status: {
			...i,
			reading: !0
		},
		mirrors: q,
		flatNeed: null
	};
	if (!n.info) return {
		status: {
			...i,
			blocked: `This photo can't be corrected: ${n.unsupported}.`
		},
		mirrors: q,
		flatNeed: null
	};
	let a = n.info, o = Ve(a), s = Tt(e.dark, e.darkPick, () => Re(o, r), r, o, "dark"), c = Tt(e.flat, e.flatPick, () => ze(o, r), r, o, "flat"), l = {
		blocked: null,
		reading: !1,
		dark: s,
		flat: c
	};
	if (s.state !== "matched" && c.state !== "matched") return {
		status: l,
		mirrors: q,
		flatNeed: null
	};
	let u = Qe(a, t.rawExposureBias), d = Ze(u), f = s.state === "matched" ? bt(s.master.id) : "", p = c.state === "matched" ? {
		id: c.master.id,
		blur: e.blur,
		radius: e.radius,
		name: St(c.master.id, e.blur, e.radius)
	} : null;
	return {
		status: l,
		mirrors: {
			[H.pass]: 1,
			[H.toSensorUv]: _t(gt(a.flip, ht(t.rotation, t.orientation))),
			[H.sensorSize]: [a.width, a.height],
			[H.toSensor]: F(d),
			[H.toWorking]: F(u),
			[H.darkSig]: f ? y(f) : W,
			[H.flatSig]: p ? y(p.name) : W,
			[U.dark]: f,
			[U.flat]: p?.name ?? ""
		},
		flatNeed: p
	};
}
function Et(e, t) {
	let n = {}, r = !1;
	for (let [i, a] of Object.entries(t)) {
		let t = e[i];
		(Array.isArray(a) && Array.isArray(t) ? a.length === t.length && a.every((e, n) => e === t[n]) : t === a) || (n[i] = a, r = !0);
	}
	return r ? n : null;
}
//#endregion
//#region src/storage.ts
var Dt = "safelight-flat-field-dark-frame", Ot = 3, Y = "masters", X = "summaries", Z = "photos", kt = ["flatUses"], At = "Close Safelight's other windows to finish updating the calibration library.", jt = class {
	factory;
	opened = null;
	notes = /* @__PURE__ */ new Set();
	constructor(e) {
		this.factory = e;
	}
	onNote(e) {
		return this.notes.add(e), () => void this.notes.delete(e);
	}
	note(e) {
		for (let t of this.notes) t(e);
	}
	get() {
		return this.opened ??= new Promise((e) => {
			let t = this.factory();
			if (!t) return e(null);
			let n = t.open(Dt, Ot), r = !1;
			n.onblocked = () => {
				r = !0, this.note(At);
			}, n.onupgradeneeded = (e) => {
				n.transaction && Mt(n.result, n.transaction, e.oldVersion);
			}, n.onsuccess = () => {
				let t = n.result;
				t.onversionchange = () => {
					t.close(), this.opened = null;
				}, r && this.note(null), e(t);
			}, n.onerror = () => e(null);
		}), this.opened;
	}
};
function Mt(e, t, n) {
	for (let t of [
		Y,
		X,
		Z
	]) e.objectStoreNames.contains(t) || e.createObjectStore(t);
	for (let t of kt) e.objectStoreNames.contains(t) && e.deleteObjectStore(t);
	if (n === 0 || n >= 3) return;
	let r = t.objectStore(X), i = t.objectStore(Y).openCursor();
	i.onsuccess = () => {
		let e = i.result;
		if (!e) return;
		let t = e.value;
		r.put(t.summary, t.summary.id), e.continue();
	};
}
var Nt = new jt(() => typeof indexedDB > "u" ? void 0 : indexedDB), Pt = () => Nt.get();
function Q(e, t, n) {
	return Pt().then((r) => new Promise((i, a) => {
		if (!r) return i(null);
		let o = r.transaction(e, t), s = n(o);
		o.oncomplete = () => i(s?.result ?? null), o.onerror = () => a(o.error ?? /* @__PURE__ */ Error("the calibration library couldn't be written")), o.onabort = () => a(o.error ?? /* @__PURE__ */ Error("the calibration library couldn't be written"));
	}));
}
async function Ft() {
	return await Q([X], "readonly", (e) => e.objectStore(X).getAll()) ?? [];
}
async function It(e) {
	return Q([X], "readonly", (t) => t.objectStore(X).get(e));
}
async function Lt(e) {
	return Q([Y], "readonly", (t) => t.objectStore(Y).get(e));
}
async function Rt(e) {
	await Q([Y, X], "readwrite", (t) => {
		t.objectStore(Y).put(e, e.summary.id), t.objectStore(X).put(e.summary, e.summary.id);
	});
}
async function zt(e) {
	await Q([Y, X], "readwrite", (t) => {
		t.objectStore(Y).delete(e), t.objectStore(X).delete(e);
	});
}
async function Bt(e) {
	return Q([Z], "readonly", (t) => t.objectStore(Z).get(e));
}
async function Vt(e, t) {
	await Q([Z], "readwrite", (n) => void n.objectStore(Z).put(t, e));
}
var Ht = {
	loadSummaries: Ft,
	loadSummary: It,
	loadMaster: Lt,
	saveMaster: Rt,
	deleteMaster: zt,
	loadPhotoSensor: Bt,
	savePhotoSensor: Vt,
	onNote: (e) => Nt.onNote(e)
};
//#endregion
//#region src/glsl.ts
function $(e) {
	let t = e.toPrecision(10);
	if (/e/i.test(t)) {
		let [e, n] = t.split(/e/i);
		return `${e.includes(".") ? e : `${e}.0`}e${Number(n)}`;
	}
	return t.includes(".") ? t : `${t}.0`;
}
var { A: Ut, B: Wt, C: Gt, D: Kt, E: qt, F: Jt, G: Yt } = Ye, Xt = -1e4, Zt = `${`
float ffBase(float x) {
  float c = clamp(x, 0.0, 1.0);
  return c * ((${$(Ut)} * c + ${$(Wt)}) * c + ${$(Gt)}) / (((${$(Kt)} * c + ${$(qt)}) * c + ${$(Jt)}) * c + ${$(Yt)})
       + max(x - 1.0, 0.0) + min(x, 0.0) * ${$(Gt / Yt)};
}
float ffUnbase(float y) {
  if (y >= 1.0) return y;
  if (y <= 0.0) return y * ${$(Yt / Gt)};
  float c = y * y;
  float a = ${$(Ut)} - y * ${$(Kt)};
  float b = ${$(Wt)} - y * ${$(qt)};
  float k = ${$(Gt)} - y * ${$(Jt)};
  for (int i = 0; i < 6; i++) {
    float p = ((a * c + b) * c + k) * c - y * ${$(Yt)};
    float dp = (3.0 * a * c + 2.0 * b) * c + k;
    c = clamp(c - p / dp, 0.0, 1.0);
  }
  return c;
}
vec3 ffLinear3(vec3 v) { return uApplyBaseCurve ? vec3(ffUnbase(v.r), ffUnbase(v.g), ffUnbase(v.b)) : v; }
vec3 ffBase3(vec3 v) { return vec3(ffBase(v.r), ffBase(v.g), ffBase(v.b)); }
`}
float ffJoin(float hi, float lo) { return hi * 1024.0 + lo; }
vec4 ffAt(sampler2D t, highp int x, highp int y) { return texelFetch(t, ivec2(x, y), 0); }
bool ffSizeIs(vec4 h, vec2 size) { return ffJoin(h.x, h.y) == size.x && ffJoin(h.z, h.w) == size.y; }
float ffPacked(sampler2D t, highp int row0, highp int i) {
  highp int texel = i / 4;
  vec4 v = ffAt(t, texel % 256, row0 + texel / 256);
  int k = i - texel * 4;
  return k == 0 ? v.x : k == 1 ? v.y : k == 2 ? v.z : v.w;
}
`, Qt = `
{
  if (!uSrcLinear) {
    c = vec3(${$(Xt)});
  } else {
    float passLong = max(1.0 / uTexel.x, 1.0 / uTexel.y);
    float sourceLong = uSourceSize.x > 0.0 ? max(uSourceSize.x, uSourceSize.y) : passLong;
    float r = max(1.5, ${$(3)} * passLong / sourceLong);
    vec3 sum = vec3(0.0);
    vec3 top = vec3(0.0);
    float topLuma = -1e30;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.7853981634;
      vec3 t = fetchInput(ivec2(floor(vUv / uTexel + vec2(cos(a), sin(a)) * r)));
      float l = dot(t, vec3(0.2126, 0.7152, 0.0722));
      sum += t;
      if (l > topLuma) {
        topLuma = l;
        top = t;
      }
    }
    c = (sum - top) / 7.0;
  }
}`, $t = `
{
  vec2 ffS = (toSensorUv * vec3(srcUv, 1.0)).xy * sensorSize;
  vec2 ffW = fwidth(ffS);
  float ffSpan = max(ffW.x, ffW.y);
  vec4 ffD0 = ffAt(darkMaster, 0, 0);
  vec4 ffF0 = ffAt(flatMaster, 0, 0);
  bool ffDark = darkOn > 0.5 && ffD0.x == ${$(_)} && ffD0.y == darkSig.x && ffD0.z == darkSig.y && ffSizeIs(ffAt(darkMaster, 4, 0), sensorSize);
  bool ffFlat = flatOn > 0.5 && ffF0.x == ${$(v)} && ffF0.y == flatSig.x && ffF0.z == flatSig.y && ffSizeIs(ffAt(flatMaster, 2, 0), sensorSize);
  if ((ffDark || ffFlat) && pass > 0.5 && stageResult.r > -1000.0) {
    vec3 ffX0 = ffLinear3(lin);
    vec3 ffX = ffX0;
    vec3 ffE;
    if (ffDark) {
      vec4 h1 = ffAt(darkMaster, 1, 0);
      vec4 h2 = ffAt(darkMaster, 2, 0);
      vec4 h3 = ffAt(darkMaster, 3, 0);
      highp ivec2 tile = ivec2(floor(ffS / ffD0.w));
      float w = 0.0;
      if (tile.x >= 0 && tile.y >= 0 && tile.x < int(h3.y) && tile.y < int(h3.z)) {
        highp int k = tile.y * int(h3.y) + tile.x;
        vec4 te = ffAt(darkMaster, k % 256, int(h2.w) + k / 256);
        highp int start = int(ffJoin(te.x, te.y));
        int count = int(te.z);
        float r0 = ${$(1)} + 0.5 * ffSpan;
        for (int i = 0; i < 8; i++) {
          if (i >= count) break;
          highp int n = start + i;
          vec4 e = ffAt(darkMaster, n % 256, int(h3.x) + n / 256);
          vec2 hot = vec2(ffJoin(e.x, e.y), ffJoin(e.z, e.w)) + 0.5;
          w = max(w, 1.0 - smoothstep(r0, r0 + 1.0, length(ffS - hot)));
        }
      }
      if (w > 0.0) ffX = mix(ffX, ffLinear3(stageResult), w);
      ffE = toSensor * ffX;
      vec2 g = clamp(ffS / h1.z - 0.5, vec2(0.0), h1.xy - 1.0);
      vec3 glow = textureLod(darkMaster, (g + vec2(0.5, h2.x + 0.5)) / vec2(textureSize(darkMaster, 0)), 0.0).rgb;
      highp ivec2 p = clamp(ivec2(floor(ffS)), ivec2(0), ivec2(sensorSize) - 1);
      ffE -= glow + vec3(ffPacked(darkMaster, int(h2.y), p.x) + ffPacked(darkMaster, int(h2.z), p.y));
    } else {
      ffE = toSensor * ffX;
    }
    if (ffFlat) {
      vec4 h1 = ffAt(flatMaster, 1, 0);
      vec2 g = clamp(ffS / ffF0.w - 0.5, vec2(0.0), h1.xy - 1.0);
      vec3 k = textureLod(flatMaster, (g + vec2(0.5, 1.5)) / vec2(textureSize(flatMaster, 0)), 0.0).rgb;
      vec3 l = ffE * k;
      float top = max(max(l.r, l.g), l.b);
      float f = 1.0;
      if (top > 1.0 && clip > 0.0) {
        f = 1.0 + (min(1.0, max(1.0, max(max(ffE.r, ffE.g), ffE.b)) / top) - 1.0) * clip;
      }
      ffE = l * f;
    }
    vec3 ffX1 = toWorking * ffE;
    lin += uApplyBaseCurve ? ffBase3(ffX1) - ffBase3(ffX0) : ffX1 - ffX0;
  }
}`;
function en() {
	return {
		id: L,
		name: "Flat field and dark frame",
		phase: "decode",
		priority: 1,
		presetScope: "per-image",
		uniforms: [
			{
				key: "darkOn",
				glslType: "float",
				default: 0,
				range: {
					min: 0,
					max: 1
				}
			},
			{
				key: "flatOn",
				glslType: "float",
				default: 0,
				range: {
					min: 0,
					max: 1
				}
			},
			{
				key: "clip",
				glslType: "float",
				default: 0,
				range: {
					min: 0,
					max: 1
				}
			},
			{
				key: "pass",
				glslType: "float",
				default: 0,
				range: {
					min: 0,
					max: 1
				}
			},
			{
				key: "toSensorUv",
				glslType: "mat3",
				default: it
			},
			{
				key: "sensorSize",
				glslType: "vec2",
				default: [0, 0]
			},
			{
				key: "toSensor",
				glslType: "mat3",
				default: rt
			},
			{
				key: "toWorking",
				glslType: "mat3",
				default: nt
			},
			{
				key: "darkSig",
				glslType: "vec2",
				default: W
			},
			{
				key: "flatSig",
				glslType: "vec2",
				default: W
			}
		],
		textures: [{
			key: z.dark,
			kind: "dynamic",
			format: "rgba16f"
		}, {
			key: z.flat,
			kind: "dynamic",
			format: "rgba16f"
		}],
		passes: [{
			glsl: Qt,
			uniforms: [{
				key: "pass",
				glslType: "float",
				default: 0,
				range: {
					min: 0,
					max: 1
				}
			}],
			iterations: {
				key: "pass",
				max: 1
			}
		}],
		reads: "source",
		helpers: Zt,
		glsl: $t,
		dormantWhen: {
			darkOn: 0,
			flatOn: 0
		}
	};
}
//#endregion
//#region src/controller.ts
var tn = (e) => (t) => console.warn(`[flat-field-dark-frame] ${e}`, t);
function nn(e) {
	return typeof e == "string" && e.startsWith("image/x-");
}
function rn(e) {
	return {
		isRaw: nn(e.mimeType),
		rotation: e.rotation,
		orientation: e.exif?.orientation,
		rawExposureBias: e.exif?.rawExposureBias
	};
}
var an = (e) => `${e.id}:${e.fileSize}:${e.dateCreated}`, on = (e) => ({
	data: e.data,
	width: e.width,
	height: e.height,
	format: "rgba16f",
	version: 1
}), sn = [{
	texture: z.dark,
	name: U.dark,
	signature: H.darkSig
}, {
	texture: z.flat,
	name: U.flat,
	signature: H.flatSig
}], cn = class {
	api;
	summaries = /* @__PURE__ */ new Map();
	sensors = /* @__PURE__ */ new Map();
	reading = /* @__PURE__ */ new Map();
	wanted = null;
	target = null;
	making = null;
	shownFor = null;
	shown = {};
	override = {};
	unmadeNote = null;
	libraryNote = null;
	listeners = /* @__PURE__ */ new Set();
	unsubscribers = [];
	infoWorker = null;
	infoIdle = null;
	summaryList = [];
	running = !1;
	line = null;
	inbox = Promise.resolve();
	io;
	store;
	openNews;
	flats;
	status = {
		blocked: null,
		reading: !1,
		dark: { state: "off" },
		flat: { state: "off" }
	};
	progress = null;
	loaded = !1;
	get notice() {
		return this.libraryNote ?? this.unmadeNote;
	}
	constructor(e, t = {}) {
		this.api = e, this.io = t.io ?? {
			info: async (e) => Je(this.worker(), e),
			frames: () => {
				let e = new Ke();
				return {
					read: (t) => qe(e, t),
					dispose: () => e.dispose()
				};
			}
		}, this.store = t.store ?? Ht, this.openNews = t.news ?? lt, this.flats = t.flats ?? new le();
	}
	async start() {
		this.api.registerProcessingStage(en()), this.api.setStageTextureProvider(L, z.dark, (e) => this.darkTexture(e)), this.api.setStageTextureProvider(L, z.flat, (e, t) => this.flatTexture(e, t));
		let e = this.api.stores.useDevelopStore;
		this.unsubscribers.push(e.subscribe((e, t) => {
			(e.photoId !== t.photoId || e.paramBag !== t.paramBag) && this.refresh();
		}), this.api.stores.useCatalogStore.subscribe((e, t) => {
			e.photos !== t.photos && this.refresh();
		})), this.running = !0;
		let t = this.store.onNote?.((e) => {
			this.libraryNote = e, this.emit();
		});
		t && this.unsubscribers.push(t);
		let n;
		this.inbox = new Promise((e) => n = e), this.line = this.openNews((e) => {
			this.inbox = this.inbox.then(() => this.hear(e)).catch(tn("news from another window couldn't be taken in"));
		});
		try {
			for (let e of await this.store.loadSummaries()) this.summaries.set(e.id, e);
		} catch (e) {
			tn("the calibration library couldn't be read")(e);
		}
		this.loaded = !0, n(), this.changedLibrary(), await this.refresh();
	}
	stop() {
		this.running = !1;
		for (let e of this.unsubscribers) e();
		this.unsubscribers = [], this.line?.close(), this.line = null, this.wanted = null, this.setOverride({}), this.api.setStageTextureProvider(L, z.dark, null), this.api.setStageTextureProvider(L, z.flat, null), this.flats.dispose(), this.infoWorker?.dispose(), this.infoWorker = null, this.infoIdle && clearTimeout(this.infoIdle), this.api.unregisterProcessingStage(L);
	}
	get masters() {
		return this.summaryList;
	}
	subscribe(e) {
		return this.listeners.add(e), () => void this.listeners.delete(e);
	}
	emit() {
		for (let e of this.listeners) e();
	}
	changedLibrary() {
		this.summaryList = [...this.summaries.values()].sort((e, t) => t.created - e.created), this.emit();
	}
	async addMaster(e, t) {
		if (this.progress) return "A master is being built already.";
		let n = this.io.frames();
		this.progress = {
			kind: e,
			done: 0,
			total: t.length
		}, this.emit();
		try {
			let r = Math.random().toString(36).slice(2, 10), i = await Ue(e, t.length, async (r) => {
				let i = await n.read(t[r]).catch((e) => {
					throw new A(`${t[r].name} couldn't be read: ${e instanceof Error ? e.message : String(e)}.`);
				});
				return this.progress = {
					kind: e,
					done: r + 1,
					total: t.length
				}, this.emit(), {
					name: t[r].name,
					...i
				};
			}, r);
			return await this.store.saveMaster(i), this.summaries.set(r, i.summary), this.tell({
				kind: "master-added",
				id: r
			}), this.changedLibrary(), this.refresh(), null;
		} catch (e) {
			return e instanceof A ? e.message : `The master couldn't be built: ${e instanceof Error ? e.message : String(e)}.`;
		} finally {
			n.dispose(), this.progress = null, this.emit();
		}
	}
	async removeMaster(e) {
		this.summaries.has(e) && (await this.store.deleteMaster(e), this.forget(e), this.tell({
			kind: "master-removed",
			id: e
		}));
	}
	forget(e) {
		this.summaries.delete(e), this.flats.forget(e), this.api.dropStageTextureVariants(L, z.dark, bt(e)), this.api.dropStageTextureVariants(L, z.flat), this.changedLibrary(), this.refresh();
	}
	tell(e) {
		try {
			this.line?.post(e);
		} catch (e) {
			tn("the other windows couldn't be told of a change to the library")(e);
		}
	}
	async hear(e) {
		if (!this.running) return;
		if (e.kind === "master-removed") return this.forget(e.id);
		if (this.summaries.has(e.id)) return;
		let t = await this.store.loadSummary(e.id);
		t && this.running && !this.summaries.has(e.id) && (this.summaries.set(e.id, t), this.changedLibrary(), this.refresh());
	}
	async darkTexture(e) {
		let t = xt(e), n = t ? await this.store.loadMaster(t) : null;
		return n?.dark ? on(ee(n.dark, e)) : null;
	}
	async flatTexture(e, t) {
		let n = wt(e);
		if (!n) return null;
		let r = await this.flats.make(n, async () => (await this.store.loadMaster(n.id))?.flat ?? null, t);
		return r && on(r);
	}
	withMirrors(e) {
		let t = this.api.stores.useDevelopStore.getState(), n = this.photo(t.photoId);
		if (!n) return e;
		let r = {
			...t.paramBag,
			...e
		}, i = K((e) => r[e]), a = rn(n), o = this.sensors.get(an(n)) ?? null;
		if (!i.dark && !i.flat || a.isRaw && !o) return e;
		let s = Et(r, J(i, a, o, this.masters).mirrors) ?? {};
		return this.follow(n.id, {
			...r,
			...s
		}), {
			...e,
			...s
		};
	}
	follow(e, t) {
		let n = {};
		for (let e of sn) {
			let r = t[e.name];
			n[e.name] = typeof r == "string" ? r : "";
		}
		let r = e === this.shownFor ? sn.filter((e) => n[e.name] && n[e.name] !== this.shown[e.name]) : [];
		if (e !== this.shownFor || r.length === 0) {
			this.shownFor = e, this.shown = n, this.target = null, this.wanted = null, this.setOverride({});
			return;
		}
		let i = {};
		for (let e of sn) {
			let t = this.shown[e.name];
			r.includes(e) ? t && (i[e.name] = t, i[e.signature] = y(t)) : this.shown[e.name] = n[e.name];
		}
		this.setOverride(i), this.prepare(r.map((e) => [e.texture, n[e.name]]));
	}
	setOverride(e) {
		Object.keys(e).length === Object.keys(this.override).length && Object.entries(e).every(([e, t]) => this.override[e] === t) || (this.override = e, this.api.develop.setViewValues(Object.keys(e).length ? e : null));
	}
	prepare(e) {
		let t = e.map((e) => e.join(":")).join("|");
		t !== this.target && (this.target = t, this.wanted = e, this.unmadeNote = null, this.emit(), this.work());
	}
	work() {
		return this.making ??= (async () => {
			for (; this.wanted && this.running;) {
				let e = this.wanted, t = this.target;
				this.wanted = null;
				let n = await Promise.all(e.map(([e, t]) => this.api.prepareStageTextureVariant(L, e, t).then(() => null, (n) => [
					e,
					t,
					n instanceof Error ? n.message : String(n)
				])));
				if (t === this.target) {
					this.target = null;
					for (let [t, n] of e) {
						let e = sn.find((e) => e.texture === t);
						e && (this.shown[e.name] = n);
					}
					for (let e of n) {
						if (!e) continue;
						let [t, n, r] = e;
						tn(`the texture ${n} couldn't be made`)(r), this.unmadeNote = `The ${t === z.dark ? "dark frame" : "flat field"} for these settings couldn't be made (${r}), so the photo is shown without it.`;
					}
					this.setOverride({}), this.emit();
				}
			}
		})().finally(() => {
			this.making = null;
		}), this.making;
	}
	async settled() {
		for (; this.making;) await this.making;
	}
	photo(e) {
		return e ? this.api.stores.useCatalogStore.getState().photos.find((t) => t.id === e) : void 0;
	}
	worker() {
		return this.infoIdle && clearTimeout(this.infoIdle), this.infoIdle = setTimeout(() => {
			this.infoWorker?.dispose(), this.infoWorker = null;
		}, 3e4), this.infoWorker ??= new Ke(), this.infoWorker;
	}
	sensorOf(e) {
		let t = an(e), n = this.sensors.get(t);
		if (n) return n;
		let r = this.reading.get(t);
		return r || (r = (async () => {
			let n = await this.store.loadPhotoSensor(t).catch(() => null);
			if (n) return n;
			let r = await e.fileHandle?.getFile().catch(() => null);
			if (!r) return {
				info: null,
				unsupported: "its original file isn't available"
			};
			let i;
			try {
				let e = await this.io.info(r), t = ge(e);
				i = t ? {
					info: null,
					unsupported: t
				} : {
					info: e,
					unsupported: null
				};
			} catch (e) {
				i = {
					info: null,
					unsupported: `LibRaw couldn't read it (${e instanceof Error ? e.message : String(e)})`
				};
			}
			return await this.store.savePhotoSensor(t, i).catch(() => void 0), i;
		})().then((e) => (this.sensors.set(t, e), this.reading.delete(t), e)), this.reading.set(t, r)), r;
	}
	async refresh() {
		if (!this.loaded) return;
		let e = this.api.stores.useDevelopStore.getState(), t = this.photo(e.photoId);
		if (!t) {
			this.setStatus({
				blocked: null,
				reading: !1,
				dark: { state: "off" },
				flat: { state: "off" }
			});
			return;
		}
		let n = e.paramBag, r = K((e) => n[e]), i = rn(t), a = null;
		if ((r.dark || r.flat) && i.isRaw) {
			let e = this.sensorOf(t);
			if (e instanceof Promise) return this.setStatus(J(r, i, null, this.masters).status), await e, this.refresh();
			a = e;
		}
		let o = J(r, i, a, this.masters);
		if (this.setStatus(o.status), !r.dark && !r.flat) return this.follow(t.id, {});
		let s = this.api.stores.useDevelopStore.getState();
		if (s.photoId !== t.id) return;
		let c = Et(s.paramBag, o.mirrors);
		this.follow(t.id, c ? {
			...s.paramBag,
			...c
		} : s.paramBag), c && s.setDynParams(c);
	}
	setStatus(e) {
		this.status = e, this.emit();
	}
	async applyTo(e) {
		let t = 0, n = 0;
		for (let r of e) {
			let e = this.photo(r);
			if (!e || !nn(e.mimeType)) {
				n++;
				continue;
			}
			let i = await this.sensorOf(e), a = { ...at({
				dark: !0,
				flat: !0,
				darkPick: "auto",
				flatPick: "auto"
			}) }, o = await this.api.catalog.getEditState(r), s = o?.stack[o.currentIndex], c = {
				...s?.paramBag ?? {},
				...a
			}, l = J(K((e) => c[e]), rn(e), i, this.masters);
			if (l.status.dark.state !== "matched" && l.status.flat.state !== "matched") {
				n++;
				continue;
			}
			let u = {
				...c,
				...at({
					dark: l.status.dark.state === "matched",
					flat: l.status.flat.state === "matched"
				}),
				...l.mirrors
			};
			if (this.api.stores.useDevelopStore.getState().photoId === r) {
				let e = this.api.stores.useDevelopStore.getState();
				this.follow(r, u), e.setDynParams(u), await e.commitEdit("Match calibration frames");
			} else if (o && s) {
				let e = [...o.stack.slice(0, o.currentIndex + 1), {
					timestamp: Date.now(),
					label: "Match calibration frames",
					params: s.params,
					paramBag: u
				}];
				await this.api.catalog.putEditState({
					photoId: r,
					stack: e,
					currentIndex: e.length - 1
				});
			} else {
				n++;
				continue;
			}
			t++;
		}
		return {
			applied: t,
			skipped: n
		};
	}
}, ln = {
	area: "Area",
	vertical: "Vertical",
	horizontal: "Horizontal",
	"vertical-horizontal": "Vertical + horizontal"
};
Object.values(V);
//#endregion
//#region src/Panel.tsx
function un(e) {
	let [, t] = N.useReducer((e) => e + 1, 0);
	return N.useEffect(() => e.subscribe(t), [e]), e;
}
function dn(e) {
	if (e.state === "off") return null;
	if (e.state === "none") return e.reason;
	let t = e.master, n = t.kind === "dark" ? `ISO ${Math.round(t.shot.iso)}, ${We(t.shot.shutter)}` : `${t.shot.lens || "no lens recorded"}, f/${t.shot.aperture.toFixed(1)}, ${Math.round(t.shot.focal)} mm`, r = t.frames.length === 1 ? "1 frame" : `${t.frames.length} frames`;
	return `${e.auto ? "Matched" : "Using"}: ${n} (${r}).`;
}
function fn(e, t, n) {
	return [{
		value: B,
		label: n.state === "matched" && n.auto ? `Automatic (${M(n.master)})` : "Automatic"
	}, ...t.filter((t) => t.kind === e).map((e) => ({
		value: e.id,
		label: `${M(e)} · ${e.shot.model}`
	}))];
}
function pn(e) {
	return function() {
		let t = un(e), { Slider: n } = P.components, { Toggle: r, Select: i, Stack: a, Button: o, Field: s, Section: l, tokens: u } = P.ui, d = P.develop.useParamScope(), f = K(d.getParam), p = t.status, m = (e) => d.commit(e), h = (e, n) => {
			d.setParams(t.withMirrors(at(e))), n && m(n);
		}, g = (e) => e ? /* @__PURE__ */ N.createElement("div", { style: {
			fontSize: "10px",
			color: u.textMuted,
			lineHeight: 1.4
		} }, e) : null;
		return /* @__PURE__ */ N.createElement(a, {
			gap: 8,
			style: { padding: "6px 8px 8px" }
		}, g(t.notice), g(p.blocked), p.reading ? g("Reading the photo's sensor details…") : null, /* @__PURE__ */ N.createElement(l, {
			title: "Dark frame",
			right: /* @__PURE__ */ N.createElement(r, {
				checked: f.dark,
				ariaLabel: "Dark frame",
				onChange: (e) => h({ dark: e }, e ? "Dark frame on" : "Dark frame off")
			})
		}, /* @__PURE__ */ N.createElement(a, { gap: 6 }, /* @__PURE__ */ N.createElement(i, {
			value: f.darkPick,
			ariaLabel: "Dark frame master",
			options: fn("dark", t.masters, p.dark),
			onChange: (e) => h({ darkPick: e }, "Dark frame master")
		}), g(dn(p.dark)))), /* @__PURE__ */ N.createElement(l, {
			title: "Flat field",
			right: /* @__PURE__ */ N.createElement(r, {
				checked: f.flat,
				ariaLabel: "Flat field",
				onChange: (e) => h({ flat: e }, e ? "Flat field on" : "Flat field off")
			})
		}, /* @__PURE__ */ N.createElement(a, { gap: 6 }, /* @__PURE__ */ N.createElement(i, {
			value: f.flatPick,
			ariaLabel: "Flat field master",
			options: fn("flat", t.masters, p.flat),
			onChange: (e) => h({ flatPick: e }, "Flat field master")
		}), g(dn(p.flat)), /* @__PURE__ */ N.createElement(s, { label: "Blur" }, /* @__PURE__ */ N.createElement(i, {
			value: f.blur,
			ariaLabel: "Blur type",
			options: c.map((e) => ({
				value: e,
				label: ln[e]
			})),
			onChange: (e) => h({ blur: e }, "Flat field blur")
		})), /* @__PURE__ */ N.createElement("div", { title: "A small radius also takes out dust spots; a large one corrects only the falloff." }, /* @__PURE__ */ N.createElement(n, {
			label: "Blur radius",
			value: f.radius,
			min: 0,
			max: 200,
			step: 1,
			defaultValue: tt.radius,
			onChange: (e) => h({ radius: Math.round(e) }),
			onCommit: () => m("Flat field blur radius")
		})), /* @__PURE__ */ N.createElement("div", { title: "Keeps the flat from lifting highlights past white." }, /* @__PURE__ */ N.createElement(n, {
			label: "Clip control",
			value: Math.round(f.clip * 100),
			min: 0,
			max: 100,
			step: 1,
			defaultValue: 0,
			onChange: (e) => h({ clip: Math.min(100, Math.max(0, e)) / 100 }),
			onCommit: () => m("Flat field clip control")
		})))), /* @__PURE__ */ N.createElement(o, {
			size: "sm",
			onClick: () => P.windows.open(et)
		}, "Calibration library…"));
	};
}
//#endregion
//#region src/LibraryWindow.tsx
var mn = (/* @__PURE__ */ "3fr.ari.arw.bay.cr2.cr3.crw.dcr.dng.erf.fff.iiq.k25.kdc.mef.mos.mrw.nef.nrw.orf.pef.raf.raw.rw2.rwl.sr2.srf.srw.x3f".split(".")).map((e) => `.${e}`).join(",");
function hn(e) {
	let t = e.shot, n = [`${t.make} ${t.model}, ${t.width} × ${t.height}`];
	e.kind === "flat" && n.push(`${t.lens || "No lens recorded"}, f/${t.aperture.toFixed(1)}, ${Math.round(t.focal)} mm`), n.push(`ISO ${Math.round(t.iso)}, ${We(t.shutter)}${t.temperature === null ? "" : `, ${t.temperature.toFixed(0)} °C`}`);
	let r = t.timestamp ? new Date(t.timestamp).toLocaleDateString() : "date not recorded";
	n.push(`${e.frames.length === 1 ? "1 frame" : `${e.frames.length} frames`}, ${r}`), e.kind === "dark" && e.hot !== void 0 && n.push(`${e.hot} hot pixel${e.hot === 1 ? "" : "s"} repaired`), e.kind === "flat" && e.strongest !== void 0 && n.push(`Corners lifted up to ×${e.strongest.toFixed(2)}`);
	let i = e.blackSource === "masked" ? "from the masked border" : e.blackSource === "frame" ? "from the frames themselves" : "from the file";
	return n.push(`Black level ${Math.round(e.black[1])} (${i}), white ${Math.round(e.white)}`), [...n, ...e.notes];
}
var gn = "RAW files shot with the lens cap on, at the ISO, exposure time and temperature of your photos. Several frames make a cleaner master.", _n = "RAW files of an evenly lit, featureless target, shot with the lens, aperture and focal length of your photos. Several frames make a cleaner master.";
function vn(e) {
	return function() {
		let t = un(e), { Button: n, Stack: r, Row: i, ProgressBar: a, Card: o, tokens: s, alertDialog: c, confirmDialog: l } = P.ui, u = N.useRef(null), [d, f] = N.useState("dark"), p = (e) => {
			f(e), u.current?.click();
		}, m = async (e) => {
			if (e.length === 0) return;
			let n = await t.addMaster(d, e);
			n && await c({
				title: d === "dark" ? "Dark frames" : "Flat frames",
				message: n
			});
		}, h = async (e) => {
			await l({
				title: "Delete master",
				message: `Delete ${M(e)}? Photos using it are no longer corrected.`,
				confirmLabel: "Delete",
				variant: "danger"
			}) && await t.removeMaster(e.id);
		}, g = (e, a) => {
			let c = t.masters.filter((t) => t.kind === e);
			return /* @__PURE__ */ N.createElement(r, { gap: 6 }, /* @__PURE__ */ N.createElement("div", { style: { fontWeight: 600 } }, a), c.length === 0 ? /* @__PURE__ */ N.createElement("div", { style: {
				color: s.textMuted,
				fontSize: 11
			} }, "None yet.") : null, c.map((e) => /* @__PURE__ */ N.createElement(o, { key: e.id }, /* @__PURE__ */ N.createElement(i, {
				justify: "space-between",
				align: "flex-start"
			}, /* @__PURE__ */ N.createElement(r, { gap: 2 }, /* @__PURE__ */ N.createElement("div", { style: { fontWeight: 600 } }, M(e)), hn(e).map((e) => /* @__PURE__ */ N.createElement("div", {
				key: e,
				style: {
					fontSize: 11,
					color: s.textSecondary
				}
			}, e))), /* @__PURE__ */ N.createElement(n, {
				size: "sm",
				variant: "danger",
				onClick: () => void h(e)
			}, "Delete")))));
		};
		return /* @__PURE__ */ N.createElement("div", { style: {
			padding: 16,
			color: s.textPrimary
		} }, /* @__PURE__ */ N.createElement(r, { gap: 12 }, /* @__PURE__ */ N.createElement(i, { gap: 8 }, /* @__PURE__ */ N.createElement(n, {
			size: "sm",
			title: gn,
			disabled: !!t.progress,
			onClick: () => p("dark")
		}, "Add dark frames…"), /* @__PURE__ */ N.createElement(n, {
			size: "sm",
			title: _n,
			disabled: !!t.progress,
			onClick: () => p("flat")
		}, "Add flat frames…")), t.progress ? /* @__PURE__ */ N.createElement(r, { gap: 4 }, /* @__PURE__ */ N.createElement("div", { style: { fontSize: 11 } }, "Reading ", t.progress.kind, " frame ", Math.min(t.progress.done + 1, t.progress.total), " of ", t.progress.total, "…"), /* @__PURE__ */ N.createElement(a, { value: t.progress.done / Math.max(1, t.progress.total) })) : null, g("dark", "Dark frames"), g("flat", "Flat fields")), /* @__PURE__ */ N.createElement("input", {
			ref: u,
			type: "file",
			multiple: !0,
			accept: mn,
			"aria-label": "Calibration frames",
			style: { display: "none" },
			onChange: (e) => {
				let t = [...e.currentTarget.files ?? []];
				e.currentTarget.value = "", m(t);
			}
		}));
	};
}
//#endregion
//#region src/index.tsx
var yn = `${I}.match`, bn = null;
function xn(e, t) {
	let n = `${e === 1 ? "1 photo now uses" : `${e} photos now use`} the best matching dark frame and flat field.`;
	return t ? `${n} ${t === 1 ? "1 photo was" : `${t} photos were`} left alone: not a RAW, no matching frame, or never opened in Develop.` : n;
}
function Sn(e) {
	Ge(e);
	let t = new cn(e);
	bn = t, t.start(), e.registerPanel({
		id: $e,
		title: "Flat Field & Dark Frame",
		component: pn(t),
		defaultDock: {
			module: "develop",
			direction: "right",
			width: 268
		},
		modules: ["develop"],
		onReset: () => {
			let t = e.stores.useDevelopStore.getState();
			t.setDynParams(Object.fromEntries(ot.map((e) => [e, void 0]))), t.commitEdit("Flat field and dark frame reset");
		}
	}), e.registerWindow({
		id: et,
		title: "Calibration library",
		component: vn(t)
	}), e.registerGridMenuItem({
		id: yn,
		label: (e) => e.length > 1 ? `Match calibration frames (${e.length})` : "Match calibration frames",
		onClick: (n) => {
			t.applyTo(n).then(({ applied: t, skipped: n }) => e.ui.alertDialog({
				title: "Match calibration frames",
				message: xn(t, n)
			}));
		}
	});
}
function Cn() {
	bn?.stop(), bn = null;
}
//#endregion
export { yn as MENU_ID, Sn as activate, Cn as deactivate, xn as matchedMessage };

//# sourceMappingURL=index.js.map
window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-client-ui-brand-official",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region brand
		/** ForensicDSH 的石墨色放大镜+盾牌标识。 */
		function ForensicBrandMark({ size = 24, className }) {
			return (0, react_jsx_runtime.jsxs)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 24 24",
				fill: "none",
				className,
				"aria-label": "ForensicDSH",
				children: [
					// 盾牌轮廓
					(0, react_jsx_runtime.jsx)("path", {
						d: "M12 2.6 L19 5.2 V11.2 C19 15.6 15.9 19.2 12 20.6 C8.1 19.2 5 15.6 5 11.2 V5.2 Z",
						stroke: "currentColor",
						strokeWidth: 1.8,
						fill: "none",
						strokeLinejoin: "round"
					}),
					// 放大镜
					(0, react_jsx_runtime.jsx)("circle", { cx: 11.2, cy: 10.6, r: 3.1, stroke: "currentColor", strokeWidth: 1.8, fill: "none" }),
					(0, react_jsx_runtime.jsx)("line", { x1: 13.6, y1: 13.0, x2: 16.2, y2: 15.6, stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" })
				]
			});
		}
		/** 产品名。 */
		function ForensicBrandName() {
			return (0, react_jsx_runtime.jsx)("span", {
				children: "ForensicDSH",
				style: { fontWeight: 600, letterSpacing: "0.02em" }
			});
		}
		//#endregion
		const inject = ["slots"];
		function apply(ctx) {
			ctx.slots.inject("sidebar.brand.mark", () => ctx.slots.inject("sidebar.brand.name", function* () {
				yield ctx.slots.register({ name: "sidebar.brand.mark" }, ForensicBrandMark);
				yield ctx.slots.register({ name: "sidebar.brand.name" }, ForensicBrandName);
			}));
		}
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

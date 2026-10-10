/**
 * @deepseek-ai/dsh-client-ui-forensic — 取证侧栏入口 + 主画面面板（浏览器半侧）。
 *
 * 结构：
 *   ① 向 sidebar.panellist 注入一条「取证工作区」导航条目：
 *        wide 模式 = 盾牌 SVG + 文字「取证工作区」
 *        rail 模式 = 只显示盾牌 SVG（56px 窄栏）
 *      选中时 main 视图切到 key="forensic"
 *
 *   ② 向 main 注入 key="forensic" 的信息面板，展示：
 *        · 设备身份（设备号 / 发放时间 / 签名密钥）
 *        · 三区状态：固证区 只读 · 案件区 读写 · 工作区 路径
 *        · 取证工具：已就绪 / 待投放（清单有，二进制缺）
 *        · 取证技能：方法卡列表
 *
 *  数据全部来自后端 GET /forensic/info（见 lib/index.js）。
 *
 * 配色：全部走宿主主题 CSS 变量（--dsw-alias-*），浅/深色自动跟随，
 * 不在 JS 里硬编码颜色，也不会因主题切换而失效。
 */
window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-client-ui-forensic",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const React = require("react");
		const { jsx, jsxs, Fragment } = require("react/jsx-runtime");
		const { useEffect, useState } = React;

		/* ----------------------- 主题令牌（CSS 变量） ----------------------- */
		// 全部使用宿主别名变量：随 data-ds-dark-theme 自动切换。
		const T = {
			text:      "var(--dsw-alias-label-primary)",
			text2:     "var(--dsw-alias-label-secondary)",
			muted:     "var(--dsw-alias-label-tertiary)",
			border:    "var(--dsw-alias-border-l2)",
			borderSoft:"var(--dsw-alias-border-l1)",
			layer2:    "var(--dsw-alias-bg-layer-2)",
			// 语义色：主色为前景，tertiary 为同色系浅/深底
			okFg:   "var(--dsw-alias-state-success-primary)",
			okBg:   "var(--dsw-alias-state-success-tertiary)",
			infoFg: "var(--dsw-alias-state-business-primary)",
			infoBg: "var(--dsw-alias-state-business-tertiary)",
			warnFg: "var(--dsw-alias-state-warn-label)",
			warnBg: "var(--dsw-alias-state-warn-tertiary)",
			font: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
		};

		/* --------------------------- 小组件 --------------------------- */

		/** Forensic 盾牌+放大镜 SVG 图标。 */
		function ForensicIcon({ size = 24, active = false, title }) {
			return jsx("svg", {
				width: size, height: size, viewBox: "0 0 24 24", fill: "none",
				"aria-label": title || "取证工作区",
				style: { display: "block", color: "currentColor" },
				children: jsxs(Fragment, { children: [
					active
						? jsx("path", {
							d: "M12 2.6 L19 5.2 V11.2 C19 15.6 15.9 19.2 12 20.6 C8.1 19.2 5 15.6 5 11.2 V5.2 Z",
							fill: "currentColor", opacity: 0.16,
						})
						: null,
					jsx("path", {
						d: "M12 2.6 L19 5.2 V11.2 C19 15.6 15.9 19.2 12 20.6 C8.1 19.2 5 15.6 5 11.2 V5.2 Z",
						stroke: "currentColor", strokeWidth: 1.8, fill: "none", strokeLinejoin: "round",
					}),
					jsx("circle", { cx: 11.2, cy: 10.6, r: 3.1, stroke: "currentColor", strokeWidth: 1.8, fill: "none" }),
					jsx("line", {
						x1: 13.6, y1: 13.0, x2: 16.2, y2: 15.6,
						stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round",
					}),
				] }),
			});
		}

		/** 状态徽章（圆角胶囊）。 */
		function Badge({ tone = "neutral", children, title }) {
			const map = {
				ok:   { bg: T.okBg,   fg: T.okFg },
				info: { bg: T.infoBg, fg: T.infoFg },
				warn: { bg: T.warnBg, fg: T.warnFg },
				gray: { bg: T.layer2, fg: T.muted },
				neutral: { bg: T.layer2, fg: T.text2 },
			}[tone] || { bg: T.layer2, fg: T.text2 };
			return jsx("span", {
				title,
				style: {
					display: "inline-flex", alignItems: "center",
					padding: "1px 8px", borderRadius: 999,
					border: `1px solid ${T.border}`,
					background: map.bg, color: map.fg,
					fontSize: 11, lineHeight: "16px", whiteSpace: "nowrap",
				},
				children,
			});
		}

		/** Section 标题 + 可选右侧徽标。 */
		function Section({ title, right, children }) {
			return jsxs("div", {
				style: { padding: "10px 0 4px" },
				children: [
					jsx("div", {
						style: {
							display: "flex", alignItems: "center", justifyContent: "space-between",
							gap: 8, marginBottom: 6, paddingBottom: 6,
							borderBottom: `1px solid ${T.border}`,
						},
						children: [
							jsx("div", {
								style: { fontSize: 13, fontWeight: 600, color: T.text, letterSpacing: "0.01em" },
								children: title,
							}),
							right || null,
						],
					}),
					children,
				],
			});
		}

		/** 键值行。 */
		function Row({ label, value, badge, mono }) {
			return jsx("div", {
				style: {
					display: "flex", flexWrap: "wrap", alignItems: "center",
					gap: 8, padding: "4px 0",
					fontSize: 13, lineHeight: "20px",
				},
				children: [
					jsx("span", {
						style: { color: T.text2, minWidth: 72, flexShrink: 0, fontWeight: 500 },
						children: label,
					}),
					jsx("span", {
						style: {
							color: T.text, wordBreak: "break-all", flex: 1, minWidth: 0,
							...(mono ? {
								fontFamily: 'var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)',
								fontSize: 12,
							} : {}),
						},
						title: typeof value === "string" ? value : undefined,
						children: value || "—",
					}),
					badge || null,
				],
			});
		}

		/** 工具/技能条目列表（垂直线条，窄栏友好）。 */
		function ItemCol({ items, tone = "ok" }) {
			if (!items || !items.length) {
				return jsx("span", { style: { color: T.muted, fontSize: 12 } }, "—");
			}
			const dot = tone === "ok" ? T.okFg : tone === "info" ? T.infoFg : T.muted;
			return jsx("div", {
				style: { display: "flex", flexDirection: "column", gap: 3, marginTop: 4 },
				children: items.map((it, i) => {
					const name = typeof it === "string" ? it : (it.name || it.id);
					return jsx("div", {
						key: i,
						style: {
							display: "flex", alignItems: "center", gap: 8,
							fontSize: 12, lineHeight: "18px",
							color: tone === "gray" ? T.muted : T.text,
						},
						children: [
							jsx("span", {
								"aria-hidden": true,
								style: {
									width: 6, height: 6, borderRadius: "50%",
									flexShrink: 0, background: dot,
								},
							}),
							jsx("span", {
								style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
								title: name,
								children: name,
							}),
						],
					}, i);
				}),
			});
		}

		/* ------------------------ panellist 图标条 ------------------------ */

		/** 侧栏导航条目：ownerProps = { size, active }。 */
		function ForensicNavEntry({ size = 24, active = false }) {
			return jsx(ForensicIcon, { size, active, title: "取证工作区" });
		}

		/* ------------------------ main: 完整信息面板 ------------------------ */

		function ForensicPanel() {
			const [info, setInfo] = useState(null);
			const [err, setErr] = useState(null);

			useEffect(() => {
				let alive = true;
				(async () => {
					try {
						const r = await fetch("/forensic/info", { cache: "no-store", credentials: "same-origin" });
						if (!r.ok) throw new Error("HTTP " + r.status);
						const d = await r.json();
						if (alive) { setInfo(d); setErr(null); }
					} catch (e) {
						if (alive) setErr(e && e.message ? e.message : String(e));
					}
				})();
				return () => { alive = false; };
			}, []);

			const wrap = {
				maxWidth: 880,
				margin: "0 auto",
				padding: "20px 24px 40px",
				background: "transparent",
				color: T.text,
				font: `13px/1.6 ${T.font}`,
			};

			const zones = info?.zones || {};
			const readyCount = info?.tools?.length || 0;
			const pendingCount = info?.pendingTools?.length || 0;
			const skills = info?.skills?.length || 0;

			if (err) {
				return jsx("div", { style: wrap, children:
					jsx(Section, {
						title: "取证工作区",
						right: jsx(Badge, { tone: "warn", children: "接口异常" }),
						children: jsx("div", {
							style: { fontSize: 12, color: T.warnFg, marginTop: 4 },
							children: "无法读取 /forensic/info：" + err + "。请确认取证插件已加载。",
						}),
					})
				});
			}

			if (!info) {
				return jsx("div", { style: wrap, children:
					jsx(Section, {
						title: "取证工作区",
						right: jsx(Badge, { tone: "neutral", children: "加载中…" }),
						children: jsx("div", { style: { color: T.muted, fontSize: 12, marginTop: 4 } },
							"正在读取设备状态…"
						),
					})
				});
			}

			return jsxs("div", { style: wrap, children: [
				/* 顶部标题行 */
				jsx("div", {
					style: {
						display: "flex", alignItems: "center", justifyContent: "space-between",
						gap: 12, padding: "4px 0 10px",
					},
					children: [
						jsxs("div", { style: { display: "flex", alignItems: "center", gap: 12, minWidth: 0 }, children: [
							jsx("div", {
								style: {
									width: 40, height: 40, borderRadius: 10, flexShrink: 0,
									background: T.infoBg, color: T.infoFg,
									display: "flex", alignItems: "center", justifyContent: "center",
								},
								children: jsx(ForensicIcon, { size: 24, active: true }),
							}),
							jsxs("div", { style: { minWidth: 0 }, children: [
								jsx("div", {
									style: { fontSize: 18, fontWeight: 600, color: T.text, letterSpacing: "0.01em" },
									children: info.product || "取证工作区",
								}),
								jsx("div", { style: { fontSize: 12, color: T.muted, marginTop: 2 }, children:
									"便携 U 盘 AI 取证工作站 — 三区隔离 · 工具总线 · 审计签名"
								}),
							] }),
						] }),
						info.device?.id
							? jsx(Badge, { tone: "info", title: "设备号: " + info.device.id, children:
								"盘 " + info.device.id.slice(0, 6).toUpperCase()
							})
							: jsx(Badge, { tone: "gray", children: "未初始化" }),
					],
				}),

				/* ① 设备身份 */
				jsx(Section, {
					title: "① 设备身份",
					right: jsx(Badge, { tone: "neutral", children: (info.device?.version ? "v" + info.device.version : "ForensicDSH") }),
					children: jsxs(Fragment, { children: [
						jsx(Row, { label: "设备号", mono: true, value: info.device?.id || null }),
						jsx(Row, { label: "发放时间", value: info.device?.issuedAt
							? new Date(info.device.issuedAt).toLocaleString("zh-CN", { hour12: false })
							: null }),
						jsx(Row, {
							label: "签名密钥",
							value: info.device?.hasKey ? "已生成" : "未生成",
							badge: info.device?.hasKey
								? jsx(Badge, { tone: "ok", title: "device.key 已存在", children: "签名就绪" })
								: jsx(Badge, { tone: "warn", title: "运行 prepare-stick.ps1", children: "需初始化" }),
						}),
					] }),
				}),

				/* ② 三区状态 */
				jsx(Section, {
					title: "② 三区状态",
					right: jsx(Badge, { tone: "ok", title: "目录结构已建立", children: "就绪" }),
					children: jsxs(Fragment, { children: [
						jsx(Row, {
							label: "固证区", mono: true, value: zones.evidence,
							badge: jsx(Badge, { tone: "ok",
								title: "写保护 ACL 已生效：AI 与工具仅可读取，不可删除/修改/新建",
								children: "只读",
							}),
						}),
						jsx(Row, {
							label: "案件区", mono: true, value: zones.casework || zones.cases,
							badge: jsx(Badge, { tone: "info",
								title: "用于存放鉴定输出、过程记录、导出的报告",
								children: "读写",
							}),
						}),
						jsx(Row, {
							label: "工作区", mono: true, value: zones.workspace,
							badge: jsx(Badge, { tone: "neutral", children: "框架+工具" }),
						}),
					] }),
				}),

				/* ③ 取证工具 */
				jsx(Section, {
					title: "③ 取证工具",
					right: jsxs("span", { style: { display: "flex", gap: 6 }, children: [
						jsx(Badge, { tone: "ok", title: readyCount + " 件工具二进制已就绪，可被 AI 调用",
							children: "就绪 " + readyCount }),
						pendingCount > 0
							? jsx(Badge, { tone: "gray",
								title: pendingCount + " 件工具只有 manifest 清单，还需将二进制放入对应 forensic/tools/ 子目录",
								children: "待投 " + pendingCount })
							: null,
					] }),
					children: jsxs(Fragment, { children: [
						jsx("div", { style: { marginTop: 2, fontSize: 12, color: T.muted, fontWeight: 500 },
							children: "已就绪（二进制已安装）" }),
						jsx(ItemCol, { items: info.tools || [], tone: "ok" }),

						pendingCount > 0 ? jsxs(Fragment, { children: [
							jsx("div", { style: { marginTop: 10, fontSize: 12, color: T.muted, fontWeight: 500 },
								children: "待投放（仅有清单，缺二进制）" }),
							jsx(ItemCol, { items: info.pendingTools || [], tone: "gray" }),
							jsx("div", {
								style: {
									marginTop: 8, fontSize: 11, color: T.text2, lineHeight: "17px",
									padding: "8px 12px", borderRadius: 8,
									background: T.layer2, border: `1px solid ${T.borderSoft}`,
								},
								children: "投放方法：下载对应二进制，解压到 工作区/forensic/tools/external/<工具名>/，"
									+ "并保证 manifest.json 中 executable.windows 指向的 exe 存在。",
							}),
						] }) : null,
					] }),
				}),

				/* ④ 取证技能 */
				skills > 0
					? jsx(Section, {
						title: "④ 取证技能（方法卡）",
						right: jsx(Badge, { tone: "info", children: String(skills) }),
						children: jsx(ItemCol, { items: info.skills, tone: "info" }),
					})
					: null,

				/* 底栏提示 */
				jsxs("div", {
					style: {
						marginTop: 18, padding: "10px 14px", borderRadius: 8,
						background: T.layer2, border: `1px solid ${T.borderSoft}`,
						fontSize: 12, color: T.text2, lineHeight: "19px",
					},
					children: [
						jsx("div", { style: { fontWeight: 600, color: T.text, marginBottom: 4 }, children: "使用提示" }),
						jsx("div", { children: "· 点击左侧「新会话」返回对话主视图；本面板用于查看设备与三区状态。" }),
						jsx("div", { children: "· 在对话中可用自然语言直接调用工具，例如「列出固证区内容并用 osquery 检查 USB 历史」。" }),
						jsx("div", { children: "· 固证区受策略守卫保护，任何尝试写入固证区的工具调用都会被单调拒绝。" }),
					],
				}),
			] });
		}

		/* ------------------------------ 注册入口 ------------------------------ */

		const inject = ["slots"];
		function apply(ctx) {
			// 1) 侧栏导航入口（图标 + label，由宿主渲染为 nav row / rail icon）
			ctx.slots.inject("sidebar.panellist", () => ctx.slots.register(
				{
					name: "sidebar.panellist",
					id: "forensic",
					order: 50,
					label: "取证工作区",
				},
				ForensicNavEntry,
			));

			// 2) 点击该导航时，main slot 切换到 key="forensic"，渲染完整信息面板
			ctx.slots.inject("main", () => ctx.slots.register(
				{ name: "main", key: "forensic" },
				ForensicPanel,
			));
		}
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});

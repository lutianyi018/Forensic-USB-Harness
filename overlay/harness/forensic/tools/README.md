# forensic/tools — 取证工具投放目录

把你自己准备的取证工具放在这里，系统启动时会自动发现并注册成 AI 可调用的工具。
本工程**不提供任何取证工具**，只提供清单契约、发现、执行与结果捕获。

## 目录约定

```
forensic/tools/
├── builtin/       随盘内置的示例
├── external/<工具>/manifest.json + 可执行文件
└── custom/<工具>/manifest.json + 可执行文件
```

每个工具**一个目录**，目录内放 `manifest.json` 与它声明的可执行文件。

## 清单契约（manifest.json）

```json
{
  "id": "usb-history",
  "name": "USB History Extractor",
  "version": "1.0.0",
  "description": "Extract USB connection history from registry hives.",
  "executable": { "windows": "usb-history.exe" },
  "args": [
    { "name": "evidence_path", "type": "string", "required": true, "description": "SYSTEM hive 路径" },
    { "name": "output_dir", "type": "string", "required": false, "description": "输出目录" }
  ],
  "requires_admin": false,
  "network": { "allowed": false },
  "timeout_ms": 300000
}
```

字段说明：

| 字段 | 必需 | 说明 |
|------|------|------|
| `id` | 是 | 工具标识；模型可见工具名由它派生为 `forensic_<id>` |
| `name` | 是 | 显示名 |
| `executable.windows` | 是 | 可执行文件路径；**相对本工具目录**，且必须落在 `forensic/tools` 之内（防穿越） |
| `args[]` | 否 | 参数声明，决定模型可见的参数 schema 与 argv 组装顺序 |
| `timeout_ms` | 否 | 执行超时，默认 300000 |
| `requires_admin` | 否 | 是否需管理员（当前仅记录，不自动提权） |
| `network.allowed` | 否 | 是否允许联网（当前仅记录） |

### 参数形态（args 的三种写法）

`args` 里每一项由模型按 `name` 传值，最终拼成命令行。支持三种形态：

```json
"args": [
  { "name": "image",   "type": "string",  "required": true },                  // 位置参数 → <值>
  { "name": "csv",     "type": "string",  "flag": "--csv" },                   // 带值选项 → --csv <值>
  { "name": "pretty",  "type": "string",  "flag": "--json", "style": "equals" },// 等号选项 → --json=<值>
  { "name": "-accepteula", "type": "boolean" }                                 // 开关 → -accepteula（仅当为 true）
]
```

- **位置参数**：不带 `flag`，只输出值（如 `fls image.dd`）。
- **带值选项**：带 `flag`，默认空格分隔 `--csv out`；`"style":"equals"` 则 `--json=x`。
- **开关**：`type:"boolean"`，值为 `true` 时输出该参数名（或用 `flag` 指定，如 `-accepteula`、`-r`）。
- 参数按 `args` 声明顺序输出，未声明的输入一律丢弃。

### 多个工具共用一套二进制（省空间）

可执行文件路径是**相对本工具目录**、且必须落在 `forensic/tools` 之内。因此可以把大体积的公共二进制放在一个共享目录，各工具的清单用 `..` 指过去：

```
forensic/tools/external/sleuthkit/
├── bin/                 # 放 fls.exe/icat.exe/... 及其依赖 DLL（无 manifest，不会被注册）
├── fls/manifest.json    # { "executable": { "windows": "../bin/fls.exe" } }
└── mmls/manifest.json   # { "executable": { "windows": "../bin/mmls.exe" } }
```

## 运行语义

- 只用清单声明的参数名；未声明的输入一律丢弃。
- 参数按声明顺序拼成 argv，**不经 shell**，因此不存在命令注入面。
- 标准输出 / 错误被捕获，落一份产物到 `<工作区>/forensic-out/`，并返回结构化结果（退出码、输出、产物路径、耗时）。

## 加一个工具

1. 建目录：`forensic/tools/external/usb-history/`。
2. 放入 `usb-history.exe` 与 `manifest.json`。
3. 重启取证工作站；模型侧会出现工具 `forensic_usb_history`。

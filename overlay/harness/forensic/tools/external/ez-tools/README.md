# ez-tools — Eric Zimmerman 工具（MIT）

本目录已放好 **清单（manifest.json）**，但**不含二进制**（因需 .NET 运行时而体积较大）。

## 启用方法

1. 从官方入口下载对应工具（免费、MIT 许可）：<https://ericzimmerman.github.io/>（或一键脚本
   `https://download.ericzimmermanstools.com/Get-ZimmermanTools.zip`）。
2. 解压到本目录下对应的子文件夹，使 exe 与清单同目录，例如：
   ```
   external/ez-tools/mftecmd/MFTECmd.exe (+ 依赖 DLL)
   external/ez-tools/evtxecmd/EvtxECmd.exe
   external/ez-tools/pecmd/PECmd.exe
   external/ez-tools/jlecmd/JLECmd.exe
   ```
3. 重启取证工作站。模型侧将出现 `forensic_mftecmd` / `forensic_evtxecmd` / `forensic_pecmd` / `forensic_jlecmd`。

> 注意：作者提示 **不要用 Windows 自带解压**（会阻断 DLL），请用 7-Zip / WinRAR。
> 运行环境：net9 版需 .NET 9 运行时；net4 版需 .NET Framework 4.7.2（Win10/11 通常已内置）。

## 为什么默认不含二进制

- 需要 .NET 运行时，非“开箱即用”的单文件；
- 体积与依赖随版本变化。

如你希望“随盘开箱即用”，可改用 `-p:PublishSingleFile=true --self-contained` 自打包成单文件后放入。

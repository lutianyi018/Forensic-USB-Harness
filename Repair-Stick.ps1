# =============================================================================
# Repair-Stick.ps1 — 重建 profile 共享模块目录（node_modules 链接/空占位修复）
#
# 背景（本脚本要解决的问题）：
#   dsh 从 data\dsh\profiles\ 解析插件依赖，靠 data\dsh\profiles\node_modules\
#   下的链接指向 .cache\app\node_modules\ 中的真实包。这些链接是「绝对路径
#   Junction」。用普通复制（资源管理器 / 某些拷盘工具）把母盘拷到新盘时，
#   Junction 会退化成「空目录」占位，而 dsh 启动时又把「已存在的真实目录」
#   当成「上一轮复制回退的成果」而跳过自愈 —— 于是启动报：
#       Error: dsh: plugin tree failed to load: ...
#       Error: failed to import loader entry xxx: Cannot find package
#              'X:\...\profiles\node_modules\@deepseek-ai\...\index.js'
#
# 作用：
#   把 .cache\app\node_modules 的目录结构重新镜像进 profiles\node_modules：
#     - 目标正确的 Junction            -> 保持不变；
#     - 空占位目录 / 指向错误目标的链接 -> 重建为指向 app 对应包的 Junction；
#     - 含内容的真实目录（如取证插件包）-> 保持不动。
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File .\Repair-Stick.ps1 -StickRoot <盘根>
#   powershell -ExecutionPolicy Bypass -File .\Repair-Stick.ps1          (默认本目录上一级)
#   powershell -ExecutionPolicy Bypass -File .\Repair-Stick.ps1 -HarnessRoot D:\USB-Harness-with-runtime
#
# 说明：仅在 NTFS 上有效（Junction 需要 NTFS）。FAT32/exFAT 请改用 install.ps1 的复制回退。
# =============================================================================
[CmdletBinding()]
param(
    [string]$StickRoot = '',
    [string]$HarnessRoot = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $HarnessRoot) {
    if ($StickRoot) { $HarnessRoot = Join-Path $StickRoot 'USB-Harness-with-runtime' }
    else            { $HarnessRoot = Join-Path $PSScriptRoot '..\USB-Harness-with-runtime' }
}
if (-not (Test-Path $HarnessRoot)) { throw "找不到 Harness 目录：$HarnessRoot" }
$HarnessRoot = (Resolve-Path $HarnessRoot).Path

$AppNm  = Join-Path $HarnessRoot '.cache\app\node_modules'
$ProfNm = Join-Path $HarnessRoot 'data\dsh\profiles\node_modules'
if (-not (Test-Path $AppNm)) { throw "找不到 app node_modules：$AppNm" }
New-Item -ItemType Directory -Force -Path $ProfNm | Out-Null

# 完整性检查：链接的指向必须是 app 侧真实存在的包。若关键包缺失，说明基座复制未完成，
# 此时重建也无从下手（会出现「指向空目标」的死链），直接报错更利于定位。
$probe = Join-Path $AppNm '@deepseek-ai\cordis-plugin-timer\package.json'
if (-not (Test-Path -LiteralPath $probe)) {
    Write-Host '[错误] .cache\app\node_modules 不完整（找不到 cordis-plugin-timer\package.json）。' -ForegroundColor Red
    Write-Host '       常见原因：复制母盘尚未完成就启动了，或基座没有被完整复制。' -ForegroundColor Red
    Write-Host '       请等复制结束后重跑本脚本；必要时重新复制整个 USB-Harness-with-runtime 文件夹。' -ForegroundColor Red
    throw "app node_modules 不完整：$AppNm"
}

# 判断一个真实目录是否是「可用的包」（含内容）——是则保留，不动它。
function Test-UsablePackage([string]$Path) {
    return (Test-Path (Join-Path $Path 'package.json')) -or (Test-Path (Join-Path $Path 'index.js'))
}

# 删除 Junction 本身或空目录：用 .NET 非递归删除，绝不跟进链接目标。
function Remove-LinkOrDir([string]$Path) {
    try { [System.IO.Directory]::Delete($Path, $false) }
    catch { Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue }
}

# 确保 $Link 是指向 $Target 的 Junction。返回 $true 表示「本次重建」。
function Set-Junction([string]$Link, [string]$Target) {
    if (Test-Path -LiteralPath $Link) {
        $item = Get-Item -Force -LiteralPath $Link
        if ($item.LinkType) {
            # 已是链接（Junction/SymbolicLink）：目标一致则跳过，否则重建
            $tgt = @($item.Target) -join ';'
            if ($tgt -and ($tgt -ieq $Target)) { return $false }
            Remove-LinkOrDir $Link
        } else {
            # 真实目录：含内容则保留（如取证插件包 / 复制回退结果），空占位则重建
            if (Test-UsablePackage $Link) { return $false }
            Remove-LinkOrDir $Link
        }
    }
    New-Item -ItemType Junction -Path $Link -Target $Target | Out-Null
    return $true
}

$rebuilt = 0
$kept    = 0
foreach ($entry in Get-ChildItem -Force -LiteralPath $AppNm -Directory) {
    if ($entry.Name -eq '.bin') { continue }
    if ($entry.Name.StartsWith('@')) {
        # 作用域目录：镜像其中每个包
        $dstScope = Join-Path $ProfNm $entry.Name
        New-Item -ItemType Directory -Force -Path $dstScope | Out-Null
        foreach ($pkg in Get-ChildItem -Force -LiteralPath $entry.FullName -Directory) {
            $link = Join-Path $dstScope $pkg.Name
            if (Set-Junction $link $pkg.FullName) { $rebuilt++ } else { $kept++ }
        }
    } else {
        $link = Join-Path $ProfNm $entry.Name
        if (Set-Junction $link $entry.FullName) { $rebuilt++ } else { $kept++ }
    }
}

Write-Host "Harness：$HarnessRoot" -ForegroundColor Cyan
Write-Host "profiles\node_modules 已重建链接：$rebuilt ；保持原样：$kept" -ForegroundColor Green
Write-Host '完成。' -ForegroundColor Green

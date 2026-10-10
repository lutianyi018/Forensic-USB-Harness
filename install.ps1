# =============================================================================
# install.ps1 — 把取证层安装进一个 USB-Harness 便携包
#
# 作用：
#   1. 把 overlay/packages 下的取证插件包拷进 .cache\app\node_modules\@deepseek-ai\
#   2. 确保 web profile 已生成
#   3. 把取证 bundle 加入 profile 的 dsh.profile.bundles
#   4. （可选）在盘根创建三区目录
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File .\install.ps1
#   powershell -ExecutionPolicy Bypass -File .\install.ps1 -Target X:\USB-Harness-with-runtime
# =============================================================================
[CmdletBinding()]
param(
    [string]$Target = '',
    [string]$StickRoot = '',
    [switch]$SkipZones
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Overlay = Join-Path $PSScriptRoot 'overlay'
if (-not (Test-Path $Overlay)) { throw "找不到 overlay 目录：$Overlay" }

if (-not $Target) { $Target = Join-Path $PSScriptRoot '..\USB-Harness-with-runtime' }
$Target = (Resolve-Path $Target).Path

$Node    = Join-Path $Target '.cache\runtimes\windows-x64\node\node.exe'
$DshBin  = Join-Path $Target '.cache\app\node_modules\@deepseek-ai\dsh\lib\bin.js'
$Scope   = Join-Path $Target '.cache\app\node_modules\@deepseek-ai'
$Profile = Join-Path $Target 'data\dsh\profiles\web'
# dsh 从 profile 目录解析插件，profile 的共享模块目录用 Junction 指向 app 的包。
# 因此取证包除放进 app 外，还要放进这个共享模块目录，否则启动时报 ERR_MODULE_NOT_FOUND。
$ProfilesNm = Join-Path $Target 'data\dsh\profiles\node_modules\@deepseek-ai'

if (-not (Test-Path $Node))   { throw "找不到便携 Node：$Node" }
if (-not (Test-Path $Scope))  { throw "找不到 dsh 包目录：$Scope" }

$BundleName = '@deepseek-ai/dsh-forensic'

Write-Host "[1/5] 拷贝取证插件包" -ForegroundColor Cyan
$ScopeDst = @($Scope)
if (-not (Test-Path $ProfilesNm)) { New-Item -ItemType Directory -Force -Path $ProfilesNm | Out-Null }
$ScopeDst += $ProfilesNm
Get-ChildItem (Join-Path $Overlay 'packages') -Directory | ForEach-Object {
    foreach ($base in $ScopeDst) {
        $dst = Join-Path $base $_.Name
        if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
        Copy-Item $_.FullName $dst -Recurse -Force
    }
    Write-Host "      + $($_.Name)"
}

# 拷贝盘上工作区内容（技能与工具目录模板）到 <harness>/forensic/
$HarnessOverlay = Join-Path $Overlay 'harness'
if (Test-Path $HarnessOverlay) {
    Copy-Item (Join-Path $HarnessOverlay '*') -Destination $Target -Recurse -Force
    Write-Host '      + forensic/ (技能与工具目录)'
}

# 拷贝取证 agent 预设到 <harness>/data/dsh/.agent-presets/
$PresetsOverlay = Join-Path $Overlay 'presets'
if (Test-Path $PresetsOverlay) {
    $AgentPresets = Join-Path $Target 'data\dsh\.agent-presets'
    New-Item -ItemType Directory -Force -Path $AgentPresets | Out-Null
    Copy-Item (Join-Path $PresetsOverlay '*') -Destination $AgentPresets -Recurse -Force
    Write-Host '      + data/dsh/.agent-presets/forensic (取证预设)'
}

# 品牌覆盖：同时写入 brand-patch（供 setup 重放）与已安装的 node_modules
$BrandOverlay = Join-Path $Overlay 'brand'
if (Test-Path $BrandOverlay) {
    $BrandSrc = Join-Path $BrandOverlay '@deepseek-ai'
    # brand-patch 目录本身就是 @deepseek-ai 的父级
    $BrandPatchScope = Join-Path $Target 'brand-patch\@deepseek-ai'
    New-Item -ItemType Directory -Force -Path $BrandPatchScope | Out-Null
    Copy-Item (Join-Path $BrandSrc '*') -Destination $BrandPatchScope -Recurse -Force
    # 清掉早期误建的嵌套目录（若存在）
    Remove-Item (Join-Path $Scope '@deepseek-ai') -Recurse -Force -ErrorAction SilentlyContinue
    Copy-Item (Join-Path $BrandSrc '*') -Destination $Scope -Recurse -Force
    if (Test-Path $ProfilesNm) {
        Remove-Item (Join-Path $ProfilesNm '@deepseek-ai') -Recurse -Force -ErrorAction SilentlyContinue
        Copy-Item (Join-Path $BrandSrc '*') -Destination $ProfilesNm -Recurse -Force
    }
    Write-Host '      + brand-patch (ForensicDSH 品牌)'
}

Write-Host '[2/5] 确保 web profile 已生成' -ForegroundColor Cyan
if (-not (Test-Path (Join-Path $Profile 'package.json'))) {
    $env:DSH_HOME = Join-Path $Target 'data\dsh'
    & $Node $DshBin --profile web --dump-config | Out-Null
    if (-not (Test-Path (Join-Path $Profile 'package.json'))) {
        throw '自动生成 web profile 失败。请先运行一次 launch.bat setup。'
    }
}

Write-Host '[3/5] 将取证 bundle 加入 profile bundles' -ForegroundColor Cyan
$pkgFile = Join-Path $Profile 'package.json'
$pkg = (Get-Content $pkgFile -Raw) | ConvertFrom-Json
$bundles = @($pkg.dsh.profile.bundles)
if ($bundles -notcontains $BundleName) {
    $bundles += $BundleName
    $pkg.dsh.profile.bundles = $bundles
    # 用无 BOM UTF8 写回，避免 Node 侧 JSON.parse 因 BOM 失败
    $json = $pkg | ConvertTo-Json -Depth 12
    [IO.File]::WriteAllText($pkgFile, $json, (New-Object Text.UTF8Encoding($false)))
    Write-Host "      + $BundleName"
} else {
    Write-Host "      = $BundleName 已存在"
}

if (-not $SkipZones) {
    if (-not $StickRoot) { $StickRoot = Split-Path -Parent $Target }
    Write-Host "[4/5] 初始化盘上三区：$StickRoot" -ForegroundColor Cyan
    foreach ($d in @('固证区', '案件区', 'device')) {
        New-Item -ItemType Directory -Force -Path (Join-Path $StickRoot $d) | Out-Null
        Write-Host "      + $d"
    }
    # 盘标记：取证核心据此判定盘根（无需依赖环境变量）
    $marker = Join-Path $StickRoot 'forensic-stick.json'
    if (-not (Test-Path $marker)) {
        $obj = [ordered]@{
            product    = 'ForensicDSH'
            version    = '0.1.0'
            created_at = (Get-Date).ToString('s')
            zones      = @('固证区', '案件区', 'device')
        }
        [IO.File]::WriteAllText($marker, ($obj | ConvertTo-Json -Depth 5), (New-Object Text.UTF8Encoding($false)))
        Write-Host '      + forensic-stick.json'
    }
} else {
    Write-Host '[4/5] 跳过三区创建（-SkipZones）' -ForegroundColor DarkGray
}

# 重建 profile 共享模块链接：把 .cache\app\node_modules 的结构按当前盘符镜像进
# data\dsh\profiles\node_modules（复制母盘后绝对路径 Junction 会退化成空占位目录）。
Write-Host '[5/5] 重建 profile 共享模块链接（profiles\node_modules）' -ForegroundColor Cyan
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'Repair-Stick.ps1') -HarnessRoot $Target
if ($LASTEXITCODE -ne 0) { throw "模块链接重建失败（退出码 $LASTEXITCODE）" }

Write-Host '完成。' -ForegroundColor Green

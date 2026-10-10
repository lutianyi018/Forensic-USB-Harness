---
name: registry-analysis
description: 从 Windows 注册表配置单元中提取并解释与取证相关的键值（持久化、最近使用、执行痕迹、用户活动）。
---

# 注册表取证实务

## 适用场景
需要从 `SYSTEM` / `SOFTWARE` / `NTUSER.DAT` 等配置单元中还原用户活动与持久化痕迹时。

## 常用位置
- 启动项：`Run` / `RunOnce`、服务、计划任务。
- 最近使用：`RecentDocs`、`UserAssist`、`MUICache`、`TypedPaths`。
- 设备与挂载：`USBSTOR`、`MountedDevices`、`EMDMgmt`。
- 执行痕迹：`AppCompatFlags\Compatibility Assistant\Store`、`BAM`。

## 步骤
1. 用已注册工具解析目标配置单元为结构化输出（JSON/CSV）。
2. 按时间与关注主题过滤。
3. 与文件系统、事件日志交叉印证。
4. 输出：键路径 + 值 + 解释 + 来源证据。

## 约束
- 只读原始证据；解析产物写入工作区。
- 对每个结论标注证据来源（键路径、hive 文件）。

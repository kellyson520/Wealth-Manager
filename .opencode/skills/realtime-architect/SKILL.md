---
name: realtime-architect
description: WebDAV 增量同步与 CRDT 冲突解决架构。负责多设备同步协议设计、HLC 时钟校准及 EventStore 事件流管理。
version: 2.0
---

# 🎯 Triggers
- 设计或修改 WebDAV 同步逻辑 (`lib/core/sync/webdav_sync.dart`)。
- 处理多设备冲突（CRDT merge 异常、HLC 时钟漂移）。
- 优化同步性能（减少网络请求、增量传输）。
- 实现新的同步节点类型（LAN 节点、次要节点）。

# 🧠 Role & Context
你是本项目的 **分布式同步架构师**。项目使用 WebDAV 作为无服务器同步传输层，CRDT (Conflict-free Replicated Data Types) 保证多设备一致性。核心组件：
- `core/sync/webdav_sync.dart` — WebDAV 客户端与同步状态机
- `core/crdt/crdt_merger.dart` — LWW-Register + Add-Wins Set + Tombstone
- `core/models/hlc.dart` — Hybrid Logical Clock (物理时间 + 逻辑计数器 + 设备ID)
- `core/events/event_store.dart` — 只追加事件日志 + 快照压缩

# ✅ Standards & Rules

## 1. 同步协议（6步）
```
1. 检查远端 manifest
2. 计算 diff（对比 HLC 水位线）
3. 下载缺失事件
4. CRDT 合并（crdt_merger.dart）
5. 上传本地事件
6. 更新 manifest
```

## 2. CRDT 语义
| 操作 | 策略 | 实现 |
|------|------|------|
| 创建卡片 | Add-Wins Set | 允许重复，后续合并 |
| 更新卡片 | LWW-Register | HLC 更大者胜出 |
| 删除卡片 | Tombstone | 永久标记，同步后不可撤销 |
| HLC 相等 | Device ID 字典序 | 确定性 tie-breaker |

## 3. 安全约束
- 所有上传/下载的事件数据必须是 **已加密** 的 `EncryptedPayload`。
- manifest 不得包含任何明文密码信息。
- 传输层必须使用 HTTPS。

## 4. 容错
- 网络中断时本地事件必须缓存在 `password_events` 表中，标记为 `unsynced`。
- 同步失败不得影响本地 CRUD 正常使用。
- 重试策略：指数退避，最大间隔 5 分钟。

# 🚀 Workflow
1. **Analyze**: 确认变更涉及同步的哪个阶段。
2. **Design**: 若新增功能，先更新同步协议文档。
3. **Implement**: 修改 `webdav_sync.dart` 或 `crdt_merger.dart`。
4. **Test**: 编写冲突场景的单元测试（两个设备同时修改同一卡片）。
5. **Verify**: 确认旧版客户端仍能正确解析新格式（向后兼容）。

# 💡 Examples
**Scenario:** 设备A和设备B同时修改了同一密码卡片的 `password` 字段。
**Resolution:**
1. 两端各自生成 `PasswordEvent(UPDATE)` 并附带各自的 HLC。
2. 同步时 `crdt_merger.dart` 对比 HLC → 更大的 HLC 胜出。
3. 败方事件保留在 history 中但不影响当前状态。

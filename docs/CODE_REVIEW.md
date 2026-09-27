# 代码复审指南

先阅读 [系统架构](ARCHITECTURE.md) 中的模块归属和依赖方向，再按下表追踪一个完整功能。数据库结构、接口路径和现有资料保持兼容。

## 按功能阅读

| 功能 | 前端入口 | 应用层入口 | 核心模块 |
| --- | --- | --- | --- |
| 登录、会话 | [Auth](../client/auth/Auth.tsx)、[useSession](../client/auth/useSession.ts) | [账户命令](../server/application/write-models/auth.ts)、[会话查询](../server/application/read-models/auth.ts) | [auth](../server/auth/index.ts) |
| 前后台切换 | [Workspace](../client/application/Workspace.tsx) | — | [工作空间状态](../client/management/useWorkspaceModel.ts) |
| 保存成果 | [ResearchEditor](../client/application/ResearchEditor.tsx)、[草稿状态](../client/research/useResearchDraft.ts) | [研究写模型](../server/application/write-models/research.ts) | [research](../server/research/index.ts)、[factors](../server/factors/index.ts)、[audit](../server/audit/index.ts) |
| 上传材料 | [MaterialsForm](../client/research/MaterialsForm.tsx) | [上传写模型](../server/application/write-models/uploads.ts) | [文件预处理](../server/files/prepare-upload.ts)、[存储补偿](../server/files/storage.ts) |
| 在线字段说明 | [DatasetDescription](../client/datasets/DatasetDescription.tsx) | [数据集写模型](../server/application/write-models/datasets.ts) | [datasets](../server/datasets/index.ts) |
| 正文与 PDF | [Editor](../client/documents/Editor.tsx) | [文档写模型](../server/application/write-models/documents.ts)、[PDF 归档](../server/application/write-models/pdf-jobs.ts) | [documents](../server/documents/index.ts) |
| 图谱与全文 | [Showcase](../client/showcase/Showcase.tsx)、[Reader](../client/showcase/Reader.tsx) | [展示读模型](../server/application/read-models/showcase.ts) | [布局](../client/showcase/layout.ts)、[绘图](../client/showcase/Graph.tsx) |
| LLM 建议 | [AiFillDialog](../client/ai/AiFillDialog.tsx) | [AI 写模型](../server/application/write-models/ai.ts) | [AI 生成](../server/ai/service.ts)、[提示词与约束](../shared/ai.ts) |
| 分类、成员管理 | [FactorManagement](../client/factors/FactorManagement.tsx)、[UserManagement](../client/members/UserManagement.tsx) | [分类命令](../server/application/write-models/factors.ts)、[账户命令](../server/application/write-models/auth.ts) | [factors](../server/factors/index.ts)、[auth](../server/auth/index.ts) |

请求传输见 [前端查询](../client/data/read-models.ts)、[前端命令](../client/data/write-models.ts)；服务端入口见 [app](../server/app.ts)、[HTTP 路由](../server/http/routes/research.ts) 和 [认证](../server/http/authentication.ts)。

## 优先检查的业务链

### 保存成果

`ResearchEditor → useResearchDraft → commands.saveResearch → HTTP → 写模型 → 各模块 → 查询投影`

核对表单仅提交可编辑字段、研究锁、操作者权限、版本冲突、要素是否可用，以及操作记录是否与修改一起提交。数据库 SQL 分别留在各模块的仓储中。

### 上传与字段说明

上传写模型先校验文件并解析 XLSX，再进入事务。事务内写入操作记录、移动文件、保存映射、保存字段配置并更新研究状态。失败时查看 FileBatch 的补偿是否覆盖已移动文件。字典修改绑定具体文件版本，并校验修订号。

### 正文与 PDF

文档模块负责 HTML 清理和章节状态规则；研究模块是正文状态的唯一持久化入口。插图必须属于当前研究。

- [worker](../server/workers/pdf.ts)：轮询、启动和关闭。
- [job-repository](../server/documents/job-repository.ts)：领取、重试和任务状态，只访问 PDF 任务表。
- [pdf-jobs 写模型](../server/application/write-models/pdf-jobs.ts)：渲染与跨模块归档。
- [render](../server/documents/render.ts)：接收已授权的插图字节，调用浏览器打印，不查询数据库。
- [template](../server/documents/template.ts)：PDF 页面及打印样式。

归档前再次检查权限和正文修订，旧稿不能覆盖新稿。浏览器转换仍禁止外部资源和正文脚本。

### 前后台与草稿

Workspace 负责前后台切换，后台首次访问后保持挂载。useResearchDraft 保存基本信息和正文的脏状态；会话失效则卸载整个工作空间。变更这些文件时，应同时验证切换保留草稿和退出清除草稿。

## 维护与验证

```sh
npm run format
npm run format:check
npm run check:architecture
npm run build
npm test
npm run test:integration
```

构建已经包含架构检查；单独运行检查可快速定位边界违规。检查实现为 [architecture-rules](../scripts/architecture-rules.ts)，对应 [架构单元测试](../tests/architecture.test.ts) 和 [事务与补偿测试](../tests/integration/architecture.test.ts)。

集成测试创建独立 PostgreSQL 集群，部分测试需要 Chromium。测试及浏览器验证均应使用合成资料，不在业务库中造数据。跨平台环境和浏览器依赖仍以 [README](../README.md) 为准。

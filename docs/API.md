# API 接入说明

管理界面和成果展示前端使用同源 `/api`。全部研究资料仅对登录成员开放，不提供匿名公开发布。共享字段定义与输入约束在 `shared/contracts.ts`，展示读模型在 `shared/showcase.ts`。

## 登录与安全

所有写请求必须带 `Origin`，与配置的 `APP_ORIGIN` 完全一致。登录后返回 `{ user, csrf }`，同时设置 `research_session` HttpOnly Cookie；后续写请求再携带 `X-CSRF-Token: csrf`。前端跨端口开发时使用 Vite 代理，避免自行处理跨域。401 表示需重新登录，403 表示来源、安全校验或权限不符合要求。

| 方法 | 路径 | 用途 / 权限 |
| --- | --- | --- |
| POST | `/auth/register` | `{email,password,real_name,institution,invite_code?}`，永远只创建 member |
| POST | `/auth/login` | `{email,password}`，返回用户与 CSRF 令牌 |
| GET | `/auth/me` | 当前用户与 CSRF 令牌，供刷新页面恢复会话 |
| POST | `/auth/logout` | 撤销当前会话 |
| GET | `/users` | 管理员读取成员列表（最多 500 条） |
| PATCH | `/users/:id` | 管理员提交 `{role,active}`，撤销被修改账号会话；禁止自我停用、自我降权 |
| GET | `/factors` | 全部要素字典及研究、当前文件数量 |
| POST | `/factors` | 管理员新增 `{name}` |
| PATCH | `/factors/:id` | 管理员更新 `{name,active}` |
| GET | `/factors/:id/files` | `page=1&history=false`，每页 50 份；`history=true` 含历史 |
| GET | `/research` | `q` 标题关键词、`type` 研究类型、`factor` UUID、`mine=true/false`、`page`；每页 20 项，返回 `{items,total,page,page_size}` |
| POST | `/research` | 登录成员创建成果 |
| GET | `/research/:id` | 成果详情、说明原稿与当前及历史文件元数据 |
| PUT | `/research/:id` | 作者或管理员更新；必须提交读到的 `version` |
| GET | `/research/:id/history` | 最近 200 次操作记录 |
| POST | `/files/research/:id` | 作者或管理员批量上传，multipart 字段名为文件 role，最多 12 个文件 |
| GET | `/files/:id/content` | 已登录成员读取文件；`?download=1` 强制下载 |
| PUT | `/documents/research/:id/:section` | 作者或管理员保存 `{html,revision}`；首次 revision=0 |
| POST | `/documents/research/:id/:section/pdf` | 入队，202 返回 PDF 任务。先保存原稿。相同版本的在途任务去重 |
| GET | `/documents/jobs/:id` | 查询状态 `queued/running/completed/failed/superseded` 与文件 ID |
| GET | `/uploads` | 组内最近 100 次操作快照 |
| GET | `/stats` | 当前组内成果、文件、类型和本人研究数量 |

`/health` 为进程存活检查，`/ready` 为数据库连通性检查，均无 `/api` 前缀。

## 成果图谱展示

以下只读接口要求有效登录，响应使用 `Cache-Control: private, no-store`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/showcase` | 可选 `q` 题目关键词（最多 200 字符）、`type` 研究类型、`factor` 要素 UUID；返回 `{groups,total,page_size:3}` |
| GET | `/showcase/factors/:id/research` | 同样支持 `q/type`，`page` 从 1 开始；返回 `{items,total,page,page_size:3}` |
| GET | `/showcase/research/:id` | 返回研究题目、要素、类型、署名、更新时间、四类 `sections` 和当前 `manuscript` 元数据 |

`groups` 包含 `{id,name,active,total,items}`，每组初始最多 3 项，按更新时间降序、ID 排序。启用的空要素仍展示；停用要素有匹配研究时保留。摘要 `items` 不包含全文 HTML、磁盘路径或上传历史。

`sections.mechanism/impact/risk/policy` 均包含 `{html,summary,pdf}`。HTML 从现有 `documents` 字段读取并再次清理；保留合法的本研究插图引用。`pdf` 和 `manuscript` 为 `{id,original_name,size_bytes}`，不存在时为 `null`。使用 `/api/files/:id/content` 在新标签页预览 PDF（`application/pdf`、`inline`），使用 `?download=1` 下载（`attachment`），两者均要求登录。

## 研究资料写入对象

```json
{
  "title": "研究题目",
  "research_type": "要素集聚",
  "factor_type_id": "请使用字典接口返回的 UUID",
  "economic_data_names": ["地区生产总值", "就业人数"],
  "mechanism_summary": "产生机制摘要",
  "impact_summary": "经济影响摘要",
  "risk_summary": "可能风险摘要",
  "policy_summary": "政策启示摘要"
}
```

编辑时增加 `version`；返回 409 时重新读取，不能用旧稿静默覆盖。字段长度、类别、邮箱等受服务器约束，不依赖前端检查。

## LLM 服务

以下路径同样以 `/api` 为前缀，均要求登录；写操作要求 CSRF。配置和测试仅限管理员。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/ai/status` | 返回 `ready/enabled/model/provider_host/message`，无密钥 |
| GET | `/ai/settings` | 管理员读取配置及 `has_api_key/revision`，不返回密文或明文密钥 |
| PUT | `/ai/settings` | `{enabled,base_url,model,api_key?,clear_api_key?,json_mode,timeout_seconds,revision}`；留空密钥保留原值，配置版本冲突返回 409 |
| POST | `/ai/test` | 用已保存配置发出固定 JSON 连通性测试，即使未启用也可测试 |
| POST | `/ai/generate` | 返回 `{suggestions,notes,model,input_chars}`，不写入研究记录 |

生成参数：`{research_id?,mode,current,source_text?,section?,html?}`。`current` 为研究资料写入对象，不含 `version`，允许空题目和空要素 ID；摘要统一按每项 200 字符以内生成，包含标点等，复用对应研究摘要字段的保存校验规则；不接受 `summary_length` 参数。超长模型输出返回 502，不截断、不返回填充建议。`mode=research` 组合当前草稿、补充长文和该成果已保存的图文正文；新建成果可省略 `research_id`。`mode=section` 需提交 `section` 与编辑器 `html`，只返回对应摘要。传入成果 ID 时必须为作者或管理员。只提取 HTML 文字，不获取图片地址。总原文超过 60,000 字返回 400；无可用建议为 422，上游失败为 502，未配置/停用为 503，超时为 504。同用户并发生成返回 409，每 5 分钟最多 10 次测试或生成请求，超限 429。客户端断开时取消上游请求，不自动重试。

模型请求使用兼容 Chat Completions 接口，启用 JSON 模式时增加 `response_format:{type:'json_object'}`，再用共享 schema 校验响应字段、类型和长度。模型输出经预览选用后，通过普通研究资料更新接口保存。

## 图文与 PDF

`section` 只能是 `mechanism / impact / risk / policy`。编辑器支持段落、标题、粗斜体、列表、引用、表格、链接、插图及撤销重做。

插图先作为 `editor_image` 上传到当前研究，再在 HTML 中引用 `/api/files/<id>/content`。服务器会验证图片属于当前研究，移除脚本、事件属性、iframe 和远程图片；不从外部网站抓取图片。网页复制的文字及基本格式可以直接粘贴，图片需要从剪贴板文件、拖入或按钮上传。

PDF 转换独立进程把已授权插图读为内嵌图片，禁止浏览器网络请求，再生成 A4 PDF；支持中文字体、表格和分页。成功后的文件自动进入文件映射和上传事件。生成期间用户继续编辑会使旧任务过期，需要重新生成。手动上传的 PDF 可以浏览下载；不解析回可编辑 HTML。

错误响应形如 `{message,code?,fields?,requestId?}`，400 输入错误、401 未登录、403 无权限、404 不存在、409 冲突、413 内容过大、429 认证请求过频、500 服务错误。

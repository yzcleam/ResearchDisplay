// 会话验证封装在账户模块，查询不暴露密码或令牌哈希。
export { assertAdministrator, resolveSession } from '../../auth/index.js';

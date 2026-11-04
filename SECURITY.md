# 安全说明

## 部署边界

本项目按**受信任局域网内部系统**设计，不适用于直接暴露到互联网。

- 不要将 5080 端口映射到公网
- 建议仅在专用网络/域网络使用
- 主机应设置 Windows 登录密码和锁屏
- 所有初始账号首次登录后必须修改密码
- 定期把 `data/backups/` 复制到离线介质

## 凭据

- 密码使用 PBKDF2 哈希保存，服务端不保存明文
- 登录会话 12 小时过期，Cookie 为 HttpOnly、SameSite=Lax
- API 写操作校验 CSRF 和 Origin
- 备份恢复、人员管理、分类管理等仅管理层可用

## 数据

公开仓库不包含实际业务数据库、备份、日志或密钥。请勿把以下内容提交到 Git：

```text
data/
server/devdata/
server/testdata/
*.db
*.db-wal
*.db-shm
secret.key
backups/
logs/
```

## 漏洞反馈

如发现安全问题，请通过仓库 Issues 私下联系维护人，不要在公开 Issue 中粘贴真实业务数据、账号或数据库文件。

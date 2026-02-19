# SAFE-UT Crisis Training MVP

一个可快速分享的危机干预培训平台 MVP，包含：

- AI 来访者角色扮演（学员与“危机来访者”多轮对话）
- 案例模板（不同风险等级）
- 督导反馈生成（对整段对话进行评分与改进建议）

## 1) 安装依赖

```bash
npm install
```

## 2) 配置 API Key

复制示例文件并填写：

```bash
cp .env.local.example .env.local
```

编辑 `.env.local`：

```env
BIGMODEL_API_KEY=你的真实key
BIGMODEL_MODEL=GLM-4.7-FlashX
BIGMODEL_BASE_URL=https://open.bigmodel.cn
```

请不要把真实 key 写进仓库文件或截图里。

## 3) 运行

```bash
npm run dev
```

打开 `http://localhost:3000`。

## 4) 如何使用（演练流程）

1. 先选一个案例并点击“开始演练”
2. 在“AI 来访者对话”中，以咨询师身份提问
3. 对话至少 2 轮后，点击“生成本轮反馈”
4. 查看督导反馈中的评分和下一轮提问建议

## 5) 分享给别人（MVP）

- 部署到 Vercel / Netlify（推荐 Vercel）
- 不需要先买域名，先用平台给的临时域名分享即可
- 在部署平台中同样配置环境变量：
  - `BIGMODEL_API_KEY`
  - `BIGMODEL_MODEL`（可选）
  - `BIGMODEL_BASE_URL`（可选）

## API 说明

- `POST /api/roleplay`：AI 扮演来访者，返回来访者下一句回应
- `POST /api/feedback`：根据整段对话生成督导反馈

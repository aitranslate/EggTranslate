// src/data/guideContent.ts

export interface GuideSection {
  id: string;
  title: string;
  content: string;
}

export const guideSections: GuideSection[] = [
  {
    id: 'quick-start',
    title: '快速入门',
    content: `欢迎使用蛋蛋字幕翻译！

5 步开始（音视频转录）：
1️⃣ 下载并加载转录模型（设置 → 转录设置）
2️⃣ 配置翻译服务（设置 → 翻译设置）
3️⃣ 上传音视频文件，等待转录完成
4️⃣ 点击"开始翻译"
5️⃣ 翻译完成后导出

已有 SRT 字幕文件？直接跳到第 2、4 步即可。`,
  },
  {
    id: 'transcribe',
    title: '音视频转录',
    content: `1. 设置 → 转录设置 → 下载模型（需代理，约 2.3GB）
2. 选择模型：
   • 英语内容 → parakeet-tdt-0.6b-v2-onnx
   • 其他欧洲语言 → parakeet-tdt-0.6b-v3-onnx
3. 加载模型到内存
4. 上传音视频文件
5. 等待转录完成 → 点击翻译`,
  },
  {
    id: 'configure',
    title: '配置翻译服务',
    content: `1. 打开「设置 → 翻译设置」

2. 获取 API Key：
   • 推荐火山引擎：https://console.volcengine.com/
     每天上千万免费 Tokens，支持 DeepSeek、GLM、豆包最新模型

3. 填写配置（以火山引擎为例）：
   • API Key：sk-xxxxx
   • Base URL：https://ark.cn-beijing.volces.com/api/v3

4. 选择模型
5. 开启「反思翻译」优化质量（可选，耗时更长）
6. 调整批次大小和并发数（可选）`,
  },
  {
    id: 'translate',
    title: '开始翻译',
    content: `上传 → 选择配置 → 开始翻译 → 导出

• 编辑字幕：点击编辑按钮
• 重译单条：点击刷新按钮
• 查看进度：实时显示百分比`,
  },
  {
    id: 'terms',
    title: '术语管理',
    content: `术语确保专有名词翻译一致。

• 添加：原文 → 译文 [说明]
• 导入：原文:译文 [说明]（批量导入）
• 作用：AI 翻译时自动使用术语表`,
  },
];

/** Public production credits only. Never add deployment details or private contributors here. */
export const COPYRIGHT = {
  year: 2026,
  owner: 'OpenQS',
  title: '齐盛Online',
  short: '© 2026 OpenQS · 齐盛Online',
  statement: '齐盛Online由OpenQS制作与维护。公开程序源码依MIT许可证提供；第三方软件、音乐、标志与其他素材遵循各自许可及权利声明。正式校园、人物及视觉素材未纳入公开源码许可。',
} as const;

export const CREDITS_MODELS = [
  {name: 'OpenAI GPT-6.1 Sol', brand: 'openai'},
  {name: 'OpenAI GPT-6 Astra', brand: 'openai'},
  {name: 'Google Gemini 4 Argon', brand: 'gemini'},
  {name: 'DeepSeek V4.1 Flash', brand: 'deepseek'},
  {name: 'GLM 5.3 Flash', brand: 'chatglm'},
] as const;

export const CREDITS_THANKS = [
  {title: '致参与测试的玩家', text: '谨向所有参与《齐盛Online》测试的玩家致以诚挚谢意。你们在一次次游玩中发现问题、验证改进，并以耐心与热情推动这座数字校园不断完善。每一份认真记录的体验，都是这项作品继续前行的依据。'},
  {title: '致视觉资料提供者', text: '感谢为本项目提供校园照片、影像、模型参考与空间资料的朋友。你们留下的细节，让道路、建筑与庭院逐渐拥有可被重访的轮廓，也让记忆中的校园成为可以共同探索的地方。'},
  {title: '致创意与建议的贡献者', text: '感谢每一位分享玩法构想、交互建议与创作思路的参与者。每一次认真提出的意见，都成为这项作品继续发展的力量。从最初的设想到每一次修改，感谢你们始终在场。'},
  {title: '致开源社区与创作者', text: '感谢开源社区与创作者提供的技术、工具与素材。你们的分享让创作成为可能，也让改进能够不断发生。谨以这份制作名单，向所有共同促成《齐盛Online》的人致意。'},
] as const;

export const CREDITS_TECHNOLOGIES = [
  {name: 'React · React DOM', role: '界面与交互', license: 'MIT'},
  {name: 'Three.js', role: '三维画面', license: 'MIT'},
  {name: 'Rapier', role: '物理模拟', license: 'Apache-2.0'},
  {name: 'Recast Navigation', role: '导航与寻路', license: 'MIT'},
  {name: 'Colyseus', role: '联机房间与同步', license: 'MIT'},
  {name: 'Fastify · better-sqlite3', role: '账号、记录与社区服务', license: 'MIT'},
  {name: 'SQLite', role: '数据存储', license: 'Public domain'},
  {name: 'TypeScript', role: '程序开发', license: 'Apache-2.0'},
  {name: 'Vite · Meshoptimizer · glTF Transform', role: '构建与资源处理', license: 'MIT'},
  {name: 'Quaternius', role: '通用联机角色素材', license: 'CC0'},
  {name: 'LobeHub Icons', role: '模型品牌标志', license: 'MIT'},
] as const;

export const CREDITS_MUSIC = {
  title: 'Wildflowers', artist: 'Scott Buckley',
  source: 'https://www.scottbuckley.com.au/library/wildflowers/',
  license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  attribution: "'Wildflowers' by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au",
} as const;

export const CREDITS_DURATION_SECONDS = 180;

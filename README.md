# 多智能体监控台（Multi-Agent Mission Control）

赛博科幻风的实时多智能体监控台：Three.js 3D「神经星环」信息流 + 工作前确认审批流，监测本机 AI 智能体工作进程。

## 功能

- **默认大屏作战视图**：启动即进入全屏 3D 星环，四角 HUD 展示系统遥测、智能体强度、待确认请求与实时事件流；可切换经典视图或浏览器全屏；智能体保持固定布局，镜头自动巡航支持 0–2 倍调速（0 暂停）并持久保存。画质、音量、巡航与 90%–140% 字体比例统一收进右上角页面设置，支持恢复默认
- **像素级渲染**：流畅／高清／极致三档画质；渲染器与后处理管线同步 DPR，极致档支持原生高分屏与最高 2.5 倍超采样，SMAA 抗锯齿配合边缘自适应锐化，档位持久保存
- **A 方案迷你悬浮窗**：横向环形星核、实时总负载与最多 4 个智能体负载环；按在线智能体数量在 650／720／780／840px 间自适应宽度，窄窗使用紧凑布局；独立显示设置提供 75%–150% 的 1% 连续微调与居中平滑缩放；支持无边框拖动、置顶切换、桌面位置锁定、告警跳转、展开主屏和关闭，设置持久保存
- **太空寂静音景**：本机 Web Audio 实时合成低频 drone、呼吸泛音、棕色噪声与空间混响，无外部音频依赖；默认静音，点击后淡入，支持 0–100% 音量记忆，关闭后淡出并挂起音频渲染
- **高质感深空**：六层 FBM 程序化星云、暗尘带、微表面纹理与 720 颗低亮度三维恒星；减少亮星比例、闪烁和衍射光，兼顾纹理、清晰度与深空对比
- **体积能量材质**：主脑使用噪声顶点位移、明暗面、表面电弧、Fresnel 边缘光；智能体使用精细能量回路、微表面颗粒、双层高光与外围光晕，不再是纯色发光球
- **子进程卫星**：每个子进程是一颗绕行卫星，转速、尺寸与热力色温随处理强度变化；智能体与主脑之间由聚合主干连接
- **流动光带与拖尾**：GLSL 纵向脉冲沿主干流动，彗星粒子与幽灵拖尾表示实时数据流，颜色随负载从冰蓝渐变为炽红
- **电影级视效**：ACES 色调映射、阈值型选择性 Bloom、前景尘埃与背景星云纵深、开场相机飞入 + 自动巡航、Orbitron / JetBrains Mono 赛博字体；为保证星空锐度不使用全屏景深模糊
- **悬停解读**：核心球显示子进程 TOP5；数据流光带显示工作类型聚合（模型推理 / 界面渲染 / Python 任务 / 代码构建 / 后台服务等）
- **事件视觉反馈**：放行 → 双层光束（束芯 + 外辉光）与目标闪光；终止 → 粒子爆炸 + 冲击波 + 画面故障闪烁；新智能体 → 跃迁入场
- **审批状态 3D 化**：待确认智能体包裹琥珀扫描护盾并竖起信标柱；已拒绝智能体转为暗红低亮度状态
- **实时监控**：每 2 秒扫描本机进程，识别 Kimi、Claude Code、Cursor、ChatGPT、Ollama、豆包、Qoder、WorkBuddy、ima 等 20+ 种 AI 智能体，展示 PID、CPU、内存、趋势曲线
- **任务／会话视角**：macOS / Linux 按真实进程树聚合工作会话，展示主工作阶段、处理强度、资源占用、运行时长和 PID / PPID 明细；Windows 暂按智能体聚合。会话为进程推断结果，不代表智能体内部真实对话 ID
- **智能告警中心**：支持 CPU、内存、低活动、智能体退出及监控服务断线告警，提供阈值持久化、告警知晓、恢复记录、系统通知和星环定位；首次启动尚未连接时不会误报离线
- **工作前确认**：未授权智能体在「确认中心」生成授权请求卡，由您「确认放行」或「拒绝并终止」，策略持久保存于本机浏览器
- **进程管控**：可对 AI 进程发送终止信号（带二次确认；接口只允许终止命中 AI 特征库的进程，防止误杀系统进程）
- **事件日志**：智能体出现 / 退出 / 授权 / 拒绝 / 终止全程留痕

## 下载 v1.0.0

无需安装 Node.js，可直接下载对应平台的桌面安装包：

| 平台 | 格式 | 下载 |
| --- | --- | --- |
| macOS Apple Silicon | DMG 安装镜像 | [多智能体监控台-1.0.0-arm64.dmg](https://github.com/Tyler-dot233/multi-agent-mission-control/releases/download/v1.0.0/多智能体监控台-1.0.0-arm64.dmg) |
| macOS Apple Silicon | ZIP 压缩包 | [多智能体监控台-1.0.0-arm64-mac.zip](https://github.com/Tyler-dot233/multi-agent-mission-control/releases/download/v1.0.0/多智能体监控台-1.0.0-arm64-mac.zip) |
| Windows x64 | 免安装 ZIP | [多智能体监控台-1.0.0-win.zip](https://github.com/Tyler-dot233/multi-agent-mission-control/releases/download/v1.0.0/多智能体监控台-1.0.0-win.zip) |

完整更新说明与全部文件见 [v1.0.0 Release](https://github.com/Tyler-dot233/multi-agent-mission-control/releases/tag/v1.0.0)。本项目采用 [MIT License](LICENSE)，允许自由使用、修改和分发，但请保留原作者版权声明。

## 运行（Windows / macOS 通用）

需要 Node.js ≥ 18。

```bash
npm install
npm run dev        # 开发模式，默认 http://localhost:3000
```

生产模式：

```bash
npm run build
npm run start      # 静态页面 + 监控 API，默认 http://localhost:4173
```

桌面应用（内嵌本机监控服务，无需单独启动终端服务）：

```bash
npm run desktop
```

## 封装安装包

```bash
npm run dist:mac       # macOS Apple Silicon（arm64）：DMG + ZIP
npm run dist:win       # Windows x64：NSIS 安装程序
npm run dist:win:zip   # Windows x64：免安装 ZIP
```

安装包输出到 `release/`。Windows 安装程序支持选择安装目录，并可创建桌面和开始菜单快捷方式。在 Apple Silicon Mac 上交叉构建 NSIS 需要 Rosetta 2；若没有 Rosetta 2，可使用免安装 ZIP，解压后运行其中的「多智能体监控台.exe」。

当前 macOS 安装包未进行 Apple 开发者签名与公证。首次打开若被系统拦截，请在「系统设置 → 隐私与安全性」中确认仍要打开。Windows 安装包同样未配置代码签名，SmartScreen 可能显示未知发布者提示；正式发布前建议配置各自平台的正式签名。

## 架构

```
server/scanner.mjs              跨平台进程扫描（macOS/Linux 用 ps，Windows 用 PowerShell）
server/serve.mjs                生产服务器（静态文件 + /api/scan、/api/kill）
desktop/main.mjs                主窗口、迷你悬浮窗与跨窗口 IPC
desktop/preload.cjs             安全暴露悬浮窗控制接口
vite.config.ts                  开发服务器内嵌同一套监控 API
src/sections/MiniWidget         A 方案横向环形悬浮窗、整体缩放与位置锁定
src/sections/FlowField3D        高分屏 Three.js 场景、SMAA、像素锐化与镜头巡航
src/sections/PageSettings.tsx   右上角画质、音景、巡航与字体比例设置
src/lib/renderQuality.ts        流畅／高清／极致画质配置与本地持久化
src/lib/fontSize.ts             90%–140% 字体比例与本地持久化
src/lib/spaceAmbience.ts        本机太空环境音景与音量持久化
src/lib/taskSessions.ts         进程树任务／会话推断
src/hooks/useAlerts.ts          告警规则、冷却、知晓、恢复与系统通知
src/sections/TaskSessionView    任务／会话聚合与 PID / PPID 明细
src/sections/AlertCenter        告警阈值、活动告警与恢复记录
src/hooks/                      轮询与授权策略（localStorage 持久化）
src/sections/                   HUD 仪表盘 / 确认中心 / 事件日志
```

## 说明

- 视觉灵感参考 github.com/cyberdaddyleo/agent-display（赛博战术大屏），代码为原创实现且接入真实进程数据（该项目为模拟数据）
- 策略与事件日志保存在浏览器 localStorage，清除浏览器数据会丢失
- Windows 下瞬时 CPU% 需要采样，界面显示为「—」；macOS 正常显示
- 特征库可在 `server/scanner.mjs` 的 `SIGNATURES` 中扩展
- 3D 场景需要 WebGL；不支持时会降级提示，「监控总览」标签不受影响


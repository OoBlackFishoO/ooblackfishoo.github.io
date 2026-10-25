# 小黑鱼的手作小窝 🐟

3D 黏土 + 物理微动效风格的个人网站。纯静态、零构建工具——改文件即改网站。

## 目录结构

```
├── index.html        首页（3D 黏土黑鱼 + 作品/游戏/B站板块）
├── works.html        作品集
├── games.html        游戏区（内置《黏土泡泡》小游戏）
├── css/style.css     全站样式（改配色去 :root 里的变量）
├── js/
│   ├── clay.js       全站微动效（Q弹、倾斜、进场动画）
│   ├── fish3d.js     首页 3D 黏土鱼（three.js）
│   └── bubbles-game.js  内置小游戏的物理与画面
├── libs/             three.js 与 matter.js（已本地化，不需要联网加载）
├── games/            以后你自己的小游戏放这里
└── images/           图片（logo.jpg 是你的头像）
```

## 怎么改

- **改文字**：直接在 html 里搜中文改掉。
- **改配色**：`css/style.css` 顶部的 `:root` 变量。
- **加作品**：复制 `works.html` 里任意一张 `clay-card` 改内容。
- **加游戏**：游戏文件放进 `games/`，在 `games.html` 加一张卡片链接过去。
- **放B站视频**：B站视频页 → 分享 → 嵌入代码，粘到 `index.html` 里 `.video-slot` 槽内。

## 怎么发布

这个仓库就是 GitHub Pages 仓库（OoBlackFishoO/ooblackfishoo.github.io），
提交并推送到 main 分支后，稍等一分钟 [ooblackfishoo.github.io](https://ooblackfishoo.github.io) 就会更新：

```bash
git add .
git commit -m "重做成黏土小窝"
git push
```

## 技术

- 3D：[three.js](https://threejs.org)（球体拼出的黏土鱼，可拖拽、可戳）
- 物理：[matter.js](https://brm.io/matter-js/)（游戏区泡泡）
- 其余全部手写：无框架、无构建、无外部字体。

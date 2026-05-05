# 哈基米闯关

浏览器里的竖屏小游戏：操纵 Happy 小猫往上爬到终点线，躲避横向飞来的刀盾狗。

## 本地运行

需要用本地静态服务器打开（避免 `file://` 下音频/图片异常），在项目根目录执行：

```bash
python -m http.server 8080
```

浏览器访问：`http://localhost:8080`

## 发布到 GitHub Pages

1. 在本仓库 **Settings → Pages** 中，Source 选择分支（如 `main`）与文件夹 **`/`（root）**。
2. 保存后等待几分钟，即可通过 `https://<你的用户名>.github.io/<仓库名>/` 访问。
3. 确保仓库中包含 `index.html`，且资源路径为相对路径（当前工程已按 `assets/` 相对引用）。

## 资源文件（需自行放入）

将素材放到下列路径（缺失时游戏仍可运行，但无图/无声）：

| 类型 | 路径示例 |
|------|----------|
| 小猫 | `assets/happy猫抠像后.gif` 等（见 `game.js` 中 `CAT_IMAGE_PATHS`） |
| 刀盾狗 | `assets/刀盾狗.gif` 等 |
| 背景音乐 / 音效 | `assets/sounds/` 下 `happy猫`、`我的刀盾`、`喝彩`、`夸张失败` 等（见 `SOUND_PATHS`） |

## 项目结构

```
├── index.html
├── style.css
├── game.js
├── assets/          # 图片与音效（自建）
└── README.md
```

## 许可

素材与音效版权归各自权利人；代码可按你的需要选用开源协议。

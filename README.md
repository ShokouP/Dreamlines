# Dreamlines · 走回家

一个梦核（dreamcore）风格的数据驱动卡牌游戏。你是「我」，从门口走进童年的旧房子，穿过玄关→客厅→厨房→卧室→地下室，沿途撞见积水、旧电视、衣柜这些童年梦魇——它们不是要被打败，是要被想起来。最后回到自己的房间，面对「家」。

> 你想起来的不是家，是你为什么要离开。

## 玩法

- **对镜（1v1）**：选一个角色与镜像对决。战斗日志由 DeepSeek 实时改写成梦核小说，对局结束后可在主页「梦的记录」回读。
- **走回家（肉鸽）**：2D 节点地图，五段房间 = 五段被压抑的童年记忆。精英节点掉落记忆碎片，集齐五段 + 打通「家」解锁真结局。
- **渐进式噩梦**：每层房间一个修正词（影渐浓 / 光脚而行 / 深眠 / 梦将醒 / 家），加力、加血、加手牌、玩家开局带 debuff；每完成一节点噩梦值 +1，敌人血量随之缩放。

## 四位角色

| 角色 | 定位 | 清醒 | 特色 |
|------|------|------|------|
| 执灯人 | 战士 | 75 | 攻防均衡，火球/重击 |
| 拾梦人 | 法师 | 55 | 高法力成长，冰火远程 |
| 守夜人 | 防御/控制 | 80 | 格挡+反伤+金属甲拖后期 |
| 梦游者 | 高风险/消耗 | 60 | 消耗牌联动、高伤下坠 |

43 张卡牌全是寻常物件名（泡泡糖、被子、滑滑梯、铅笔、镜子……），效果动词也是梦核化的（碰到 / 挡住 / 想起 / 沾上 / 涌出）。

## 视觉

苹果发布会式黑白极简 + 单一红强调，深浅双主题自动切换。漂浮梦雾、低血淡彩粒子、构成主义几何卡牌美术。命名是梦核的寻常物件错位感。

## 技术栈

- **后端**：FastAPI + 文件型 JSON 存储（`data/`），JWT-like token 认证
- **前端**：纯 HTML/CSS/JS，无构建工具
- **AI 叙述**：DeepSeek `deepseek-chat`（flash、不思考），后端代理藏 key

## 运行

```bash
pip install -r requirements.txt
```

把 DeepSeek key 放进 `secrets.json`（已被 `.gitignore`，不入库）：

```json
{ "deepseek_key": "sk-你的key" }
```

启动：

```bash
python -m uvicorn server:app --host 0.0.0.0 --port 8001
```

打开 `http://localhost:8001`。

- 默认管理员：`admin` / `admin`（管理后台 `/`）
- 玩家可在 `/login.html` 自助注册，进入 `/play.html`

## 公开部署

平台（Render / Railway / Fly 等）从 GitHub 自动构建。环境变量必设：

| 变量 | 说明 |
|------|------|
| `ADMIN_PASSWORD` | 管理员密码，**务必改掉默认 admin** |
| `DEEPSEEK_API_KEY` | DeepSeek key（或写入 `secrets.json`，但平台建议用环境变量） |
| `OPEN_REGISTRATION` | 设为 `false` 关闭自助注册（防账号刷量；管理员仍可经 `/api/players` 建号） |

注意：
- `data/players/`、`data/matches/` 是运行时数据，免费平台文件系统多为准ephemeral，重新部署会丢。需要持久化请挂载卷或换数据库。
- `/api/dream-narrate` 已限流（每用户 30 次/分钟）防 DeepSeek 额度被刷。
- 注册开放（玩家可自助注册），如需关闭请改 `server.py` 的 `/api/auth/register`。

## 目录结构

```
server.py            FastAPI 后端（数据CRUD / 认证 / 对局 / DreamSeek代理）
auth.py              认证与用户管理
schemas.py           Pydantic 数据模型
secrets.json         DeepSeek key（gitignored）
data/                游戏数据（cards/effects/buffs/characters/game-modes/keywords）
  players/           玩家存档（gitignored）
  matches/           对局记录（gitignored）
static/              前端
  battle.*           对战页（STS布局 / 意图 / 拖拽 / 粒子 / AI小说）
  roguelike*         肉鸽地图页
  play.*             玩家主页
  dream-fx.js        梦雾 + 淡彩粒子
  style.css          设计系统（黑白极简 + 深浅主题）
spec/                openspec 规范文档
```

## 状态机与机制

- 回合制：玩家回合 → 敌人意图展示 → 敌人执行
- 资源：清醒（HP）、回想（法力）、安心（格挡）
- buff：光脚（易伤）/ 长高了（力量）/ 肚子疼（毒）/ 扎手（荆棘）/ 发烧（燃烧）/ 穿外套（金属甲）
- 出牌：点击或拖拽到目标，悬停看伤害预估

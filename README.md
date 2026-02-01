# HashGame 自动下注机器人 🎲

HashGame 经典模式自动下注脚本，使用私钥直接签名交易，完全自动化。

## ✨ 功能

- 🎯 **Random10** - 随机选择 10 个数字
- 💰 **按比例下注** - 使用余额的固定比例下注
- 🔄 **自动参与** - 每场比赛自动参与
- 🏆 **自动 Claim** - 定期检查并领取奖励
- ✅ **自动授权** - 首次运行自动授权代币

## 📋 前置要求

- Node.js 16+
- BSC 测试网代币（USDC）
- 测试钱包私钥

## 🚀 快速开始

### 1. 克隆项目

```bash
git clone <your-repo>
cd hashgameplaybot
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
PRIVATE_KEY=你的私钥
BET_RATIO=0.05
MIN_BET=0.1
MAX_BET=10
```

### 3. 安装依赖

```bash
npm install
```

### 4. 启动

```bash
npm start
```

按 `Ctrl+C` 停止运行。

## ⚙️ 配置说明

| 参数 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `PRIVATE_KEY` | - | 钱包私钥（必填） |
| `BET_RATIO` | 0.05 | 每次下注使用余额的比例（5%） |
| `MIN_BET` | 0.1 | 最小下注金额（USDC） |
| `MAX_BET` | 10 | 最大下注金额（USDC） |

## 🔗 合约信息

| 名称 | 地址 | 网络 |
| :--- | :--- | :--- |
| 游戏合约 | `0x0C3EAaAfB06A42a11b7Df0D9e59fA9681a4Ca585` | BSC Testnet |
| USDC 合约 | `0x7b55354900d2a7C241785fe178e90A0f7685bF57` | BSC Testnet |

## 📁 项目结构

```
hashgameplaybot/
├── bot.js           # 主脚本（私钥签名）
├── hashgame_bot.js  # 浏览器控制台脚本
├── package.json     # 依赖配置
├── .env.example     # 环境变量模板
├── .gitignore       # Git 忽略
└── README.md        # 本文件
```

## 📝 日志示例

```
[2026-02-01T21:00:00.000Z] ✅ 已连接到网络: bnbt (chainId: 97)
[2026-02-01T21:00:01.000Z] 📌 钱包地址: 0x...
[2026-02-01T21:00:02.000Z] 📌 USDC 余额: 100.0000
[2026-02-01T21:00:10.000Z] 🎲 开始下注游戏 #934592
[2026-02-01T21:00:11.000Z] 📝 发送下注交易...
[2026-02-01T21:00:15.000Z] ✅ 下注成功！
```

## 📄 许可证

MIT

/**
 * HashGame 自动下注机器人
 * 
 * 使用私钥直接签名交易，完全自动化
 * 
 * 使用方法：
 * 1. 直接传入私钥: PRIVATE_KEY=0x... npm start
 * 2. 或命令行参数: node bot.js 0x私钥
 * 3. 或在 .env 文件中设置
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { ethers } = require('ethers');

// 获取私钥（支持多种方式）
function getPrivateKey() {
    // 1. 从命令行参数
    if (process.argv[2] && process.argv[2].startsWith('0x')) {
        return process.argv[2];
    }
    // 2. 从环境变量
    if (process.env.PRIVATE_KEY && process.env.PRIVATE_KEY.startsWith('0x')) {
        return process.env.PRIVATE_KEY;
    }
    return null;
}

// ===================== 配置 =====================
const CONFIG = {
    // 网络配置 - BSC Testnet
    RPC_URL: process.env.RPC_URL || 'https://data-seed-prebsc-1-s1.bnbchain.org:8545',
    CHAIN_ID: 97,

    // 合约地址 - 实际游戏使用的地址
    GAME_CONTRACT: '0x26b43E5bE5B325d5113AbedC706113084d374F7F',
    USDC_CONTRACT: '0x78f623e9408cc8cac5a64b1623cddd793fdfeb57',

    // 下注配置
    BET_RATIO: parseFloat(process.env.BET_RATIO) || 0.05,
    MIN_BET: parseFloat(process.env.MIN_BET) || 0.1,
    MAX_BET: parseFloat(process.env.MAX_BET) || 10,

    // 时间配置（毫秒）
    CHECK_INTERVAL: 30000,       // 检查新游戏的间隔
    CLAIM_INTERVAL: 120000,      // 检查 Claim 的间隔
    TX_DEADLINE: 300,            // 交易截止时间（秒）
};

// ===================== 合约 ABI =====================
const GAME_ABI = [
    // joinGame: 6 参数版本（根据成功交易 0xb5ccca... 分析）
    // gameId: BTC 区块高度
    // picks: 第一组竞猜（bytes32，用 formatBytes32String 编码）
    // multiplier: 第一组倍率
    // picks2: 第二组竞猜（bytes32）
    // multiplier2: 第二组倍率
    // deadline: 交易截止时间戳
    'function joinGame(uint256 gameId, bytes32 picks, uint256 multiplier, bytes32 picks2, uint256 multiplier2, uint256 deadline) external',
    // 领取奖励
    'function claimBetPrize(uint32[] calldata _gameIds, uint8 _tokenType) external',
];

const ERC20_ABI = [
    'function balanceOf(address owner) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function allowance(address owner, address spender) view returns (uint256)',
];

// ===================== 状态变量 =====================
let provider;
let wallet;
let gameContract;
let usdcContract;
let lastBetGameId = 0;
let betHistory = [];
let isRunning = false;
let stats = {
    bets: 0,
    claims: 0,
    totalBetAmount: 0,
    totalClaimAmount: 0,
};

// ===================== 工具函数 =====================

function log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = {
        'info': '📌',
        'success': '✅',
        'warning': '⚠️',
        'error': '❌',
        'bet': '🎲',
        'claim': '💰',
        'tx': '📝',
    }[type] || '📌';
    console.log(`[${timestamp}] ${prefix} ${message}`);
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 随机延迟（模拟真人行为）
function randomDelay(minMs, maxMs) {
    const randomMs = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    log(`等待 ${(randomMs / 1000).toFixed(1)} 秒...`, 'info');
    return delay(randomMs);
}

// 生成随机 10 个数字（0-15，即 0-f）
function generateRandom10Picks() {
    const allNumbers = Array.from({ length: 16 }, (_, i) => i);
    const shuffled = allNumbers.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, 10).sort((a, b) => a - b);

    // 编码为 bytes10：每个数字占 4 位
    // bytes10 = 10 字节 = 80 位，可存储 20 个 4 位数字
    // 但游戏可能只用前 10 个字节的每个字节存储一个选择（0-15）
    let result = '0x';
    for (let i = 0; i < 10; i++) {
        result += selected[i].toString(16).padStart(2, '0');
    }

    log(`生成 Random10: ${selected.map(n => n.toString(16).toUpperCase()).join(', ')}`, 'info');
    return result;
}

// ===================== 核心功能 =====================

async function initialize() {
    const privateKey = getPrivateKey();
    if (!privateKey) {
        throw new Error('请提供私钥！使用方法：\n  1. PRIVATE_KEY=0x... npm start\n  2. node bot.js 0x私钥\n  3. 在 .env 文件中设置 PRIVATE_KEY=0x...');
    }

    log('正在连接到 BSC 测试网...', 'info');

    provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
    wallet = new ethers.Wallet(privateKey, provider);

    // 验证连接
    const network = await provider.getNetwork();
    log(`已连接到网络: ${network.name} (chainId: ${network.chainId})`, 'success');

    gameContract = new ethers.Contract(CONFIG.GAME_CONTRACT, GAME_ABI, wallet);
    usdcContract = new ethers.Contract(CONFIG.USDC_CONTRACT, ERC20_ABI, wallet);

    log(`钱包地址: ${wallet.address}`, 'info');

    // 检查余额
    const balance = await getBalance();
    log(`USDC 余额: ${balance.toFixed(4)}`, 'info');

    // 检查授权
    await checkAndApprove();

    return true;
}

async function getBalance() {
    const decimals = await usdcContract.decimals();
    const balance = await usdcContract.balanceOf(wallet.address);
    return parseFloat(ethers.formatUnits(balance, decimals));
}

async function checkAndApprove() {
    const decimals = await usdcContract.decimals();
    const allowance = await usdcContract.allowance(wallet.address, CONFIG.GAME_CONTRACT);
    const allowanceNum = parseFloat(ethers.formatUnits(allowance, decimals));

    if (allowanceNum < CONFIG.MAX_BET * 1000) {
        log('需要授权代币...', 'tx');
        const maxApproval = ethers.parseUnits('999999999', decimals);
        const tx = await usdcContract.approve(CONFIG.GAME_CONTRACT, maxApproval);
        await tx.wait();
        log('代币授权完成', 'success');
    } else {
        log(`当前授权额度充足: ${allowanceNum.toFixed(2)}`, 'info');
    }
}

async function getCurrentGameId() {
    try {
        // 使用 Blockchain.info API 获取当前 BTC 区块高度
        const response = await fetch('https://blockchain.info/q/getblockcount');
        const blockHeight = await response.text();
        const currentHeight = parseInt(blockHeight);

        // 返回下一个区块高度，因为玩家竞猜的是未来区块的哈希
        const nextGameId = currentHeight + 1;
        log(`当前 BTC 区块: ${currentHeight}, 竞猜目标: ${nextGameId}`, 'info');
        return nextGameId;
    } catch (error) {
        log(`获取 BTC 区块高度失败: ${error.message}`, 'error');
        return null;
    }
}

// 生成竞猜选择（bytes32 格式）
// 根据成功交易分析：picks 是 ASCII 字符编码后右填充至 32 字节
// 例如 "234567abcd" -> 0x32333435363761626364000...（右填充0）
function generatePicksBytes32() {
    const allChars = '0123456789abcdef'.split('');
    const shuffled = allChars.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, 10).sort();
    const picksString = selected.join('');

    // 将字符串转为 UTF-8 字节，然后右填充至 32 字节
    const encoder = new TextEncoder();
    const bytes = encoder.encode(picksString);

    // 创建 32 字节的数组并填充
    const padded = new Uint8Array(32);
    padded.set(bytes);

    // 转换为 hex 字符串
    const result = '0x' + Array.from(padded).map(b => b.toString(16).padStart(2, '0')).join('');

    log(`生成竞猜: ${picksString} -> ${result.substring(0, 24)}...`, 'info');
    return result;
}

async function placeBet() {
    const balance = await getBalance();
    if (balance <= CONFIG.MIN_BET) {
        log(`余额不足: ${balance.toFixed(4)} USDC`, 'warning');
        return false;
    }

    const gameId = await getCurrentGameId();
    if (!gameId) {
        log('无法获取当前游戏 ID', 'warning');
        return false;
    }

    // 不限制同一游戏重复下注，每次都下注

    // 计算下注金额
    let betAmount = balance * CONFIG.BET_RATIO;
    betAmount = Math.max(CONFIG.MIN_BET, Math.min(CONFIG.MAX_BET, betAmount));

    log(`开始下注游戏 #${gameId}`, 'bet');
    log(`余额: ${balance.toFixed(4)} USDC, 下注: ${betAmount.toFixed(4)} USDC`, 'info');

    try {
        // 生成两组竞猜选择（bytes32 格式）
        const picks1Hex = generatePicksBytes32();
        const picks2Hex = generatePicksBytes32();

        // 将 hex 字符串转换为 bytes32（确保正确编码）
        const picks1 = ethers.getBytes(picks1Hex);
        const picks2 = ethers.getBytes(picks2Hex);

        // 倍数（随机 3-10 之间的整数）
        const multiplier1 = BigInt(Math.floor(Math.random() * 8) + 3);
        const multiplier2 = BigInt(Math.floor(Math.random() * 8) + 3);

        // 设置交易截止时间（当前时间 + 5 分钟）
        const deadline = BigInt(Math.floor(Date.now() / 1000) + CONFIG.TX_DEADLINE);

        log(`发送下注交易...`, 'tx');
        log(`  gameId: ${gameId}`, 'info');
        log(`  picks1: ${picks1Hex.substring(0, 24)}..., multiplier: ${multiplier1}`, 'info');
        log(`  picks2: ${picks2Hex.substring(0, 24)}..., multiplier: ${multiplier2}`, 'info');
        log(`  deadline: ${deadline}`, 'info');

        // 手动构造 calldata，使用正确的 Method ID 0x121984c6
        // 成功交易使用的函数签名（可能是私有或未知名称）
        const METHOD_ID = '0x121984c6';
        const abiCoder = ethers.AbiCoder.defaultAbiCoder();
        const encodedParams = abiCoder.encode(
            ['uint256', 'bytes32', 'uint256', 'bytes32', 'uint256', 'uint256'],
            [BigInt(gameId), picks1, multiplier1, picks2, multiplier2, deadline]
        );
        const calldata = METHOD_ID + encodedParams.slice(2);

        log(`  Calldata (前50字符): ${calldata.substring(0, 50)}...`, 'info');

        // 发送原始交易
        const tx = await wallet.sendTransaction({
            to: CONFIG.GAME_CONTRACT,
            data: calldata,
            gasLimit: 500000,
        });

        log(`交易已发送: ${tx.hash}`, 'tx');
        const receipt = await tx.wait();

        if (receipt.status === 1) {
            lastBetGameId = gameId;
            betHistory.push({ gameId, picks: picks1Hex, amount: betAmount, timestamp: Date.now() });
            stats.bets++;
            stats.totalBetAmount += betAmount;
            log(`下注成功！游戏 #${gameId}, 金额: ${betAmount.toFixed(4)} USDC`, 'success');
            return true;
        } else {
            log('交易失败', 'error');
            return false;
        }
    } catch (error) {
        log(`下注失败: ${error.message}`, 'error');
        return false;
    }
}

async function checkAndClaim() {
    if (betHistory.length === 0) {
        return 0;
    }

    log('检查可领取的奖励...', 'claim');

    // 获取所有历史游戏 ID
    const gameIds = betHistory.map(b => b.gameId);
    const tokenType = 2; // USDC

    try {
        // 手动构造 calldata，使用正确的 Method ID 0x73869701
        // 函数签名: claimBetPrize(uint32[] _gameIds, uint8 _tokenType)
        const METHOD_ID = '0x73869701';

        // 动态数组编码：
        // 1. 数组指针偏移量（64 = 0x40，因为有2个32字节的头部参数）
        // 2. tokenType
        // 3. 数组长度
        // 4. 数组元素...
        const abiCoder = ethers.AbiCoder.defaultAbiCoder();

        // 编码动态数组和 tokenType
        // 注意：Solidity 的动态数组在 ABI 中需要特殊处理
        const encodedParams = abiCoder.encode(
            ['uint32[]', 'uint8'],
            [gameIds.map(id => id), tokenType]
        );

        const calldata = METHOD_ID + encodedParams.slice(2);

        log(`尝试领取 ${gameIds.length} 个游戏: ${gameIds.join(', ')}`, 'info');
        log(`Calldata (前50字符): ${calldata.substring(0, 50)}...`, 'info');

        const tx = await wallet.sendTransaction({
            to: CONFIG.GAME_CONTRACT,
            data: calldata,
            gasLimit: 500000 * gameIds.length,
        });

        log(`领取交易已发送: ${tx.hash}`, 'tx');
        const receipt = await tx.wait();

        if (receipt.status === 1) {
            betHistory = [];
            stats.claims += gameIds.length;
            log(`成功领取 ${gameIds.length} 个奖励`, 'success');
            return gameIds.length;
        }
    } catch (error) {
        log(`领取失败（可能还未开奖）: ${error.message.substring(0, 100)}`, 'info');
    }

    return 0;
}

// ===================== 主循环 =====================

async function mainLoop() {
    let betCount = 0;

    while (isRunning) {
        try {
            const balance = await getBalance();

            // 余额不足时等待后继续检查（不退出循环）
            if (balance < 10) {
                log(`余额不足 (${balance.toFixed(2)} USDC)，等待后重试...`, 'warning');
                await randomDelay(60000, 120000);
                continue;
            }

            // 下注
            const success = await placeBet();
            if (success) {
                betCount++;
                log(`=== 第 ${betCount} 次下注完成 ===`, 'success');
            }
        } catch (error) {
            log(`主循环错误: ${error.message}`, 'error');
        }

        // 随机间隔 5-15 秒，模拟真人行为
        await randomDelay(5000, 15000);
    }

    log(`总共完成 ${betCount} 次下注`, 'info');
}

async function claimLoop() {
    while (isRunning) {
        // 随机等待 CLAIM_INTERVAL ± 30 秒，模拟真人
        const claimWait = CONFIG.CLAIM_INTERVAL + Math.floor(Math.random() * 60000 - 30000);
        log(`等待 ${(claimWait / 1000).toFixed(0)} 秒后检查奖励...`, 'info');
        await delay(claimWait);

        try {
            await checkAndClaim();
        } catch (error) {
            log(`Claim 循环错误: ${error.message}`, 'error');
        }
    }
}

async function start() {
    if (isRunning) {
        log('机器人已在运行中', 'warning');
        return;
    }

    log('='.repeat(50), 'info');
    log('🚀 HashGame 自动下注机器人启动中...', 'info');
    log('='.repeat(50), 'info');

    try {
        await initialize();
    } catch (error) {
        log(`初始化失败: ${error.message}`, 'error');
        process.exit(1);
    }

    isRunning = true;

    log(`配置: 下注比例 ${CONFIG.BET_RATIO * 100}%, 范围 ${CONFIG.MIN_BET}-${CONFIG.MAX_BET} USDC`, 'info');
    log(`检查间隔: ${CONFIG.CHECK_INTERVAL / 1000}秒, Claim 间隔: ${CONFIG.CLAIM_INTERVAL / 1000}秒`, 'info');
    log('='.repeat(50), 'info');

    // 并行启动下注循环和 Claim 循环
    mainLoop();
    claimLoop();

    // 处理退出信号
    process.on('SIGINT', () => {
        log('收到退出信号，正在停止...', 'warning');
        isRunning = false;
        log(`统计: 下注 ${stats.bets} 次, 领取 ${stats.claims} 次`, 'info');
        log(`总下注: ${stats.totalBetAmount.toFixed(4)} USDC`, 'info');
        process.exit(0);
    });
}

// 启动
start();

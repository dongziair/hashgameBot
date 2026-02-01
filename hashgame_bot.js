/**
 * HashGame 经典模式自动下注脚本
 * 
 * 功能：
 * - 自动选择 Random10
 * - 按比例下注
 * - 每场比赛自动参与
 * - 自动 Claim 领取奖励
 * 
 * 使用方法：
 * 1. 在 hashgame.io 连接钱包后
 * 2. 打开开发者工具 Console
 * 3. 粘贴此脚本并回车运行
 */

(function() {
    'use strict';

    // ===================== 配置参数 =====================
    const CONFIG = {
        BET_RATIO: 0.05,           // 每次下注使用余额的比例（5%）
        MIN_BET: 0.1,              // 最小下注金额（USDC）
        MAX_BET: 10,               // 最大下注金额（USDC）
        CHECK_INTERVAL: 15000,     // 检查新游戏的间隔（毫秒）
        CLAIM_INTERVAL: 60000,     // 检查 Claim 的间隔（毫秒）
        AUTO_CONFIRM: false,       // 是否尝试自动确认钱包（需要钱包支持）
    };

    // ===================== 状态变量 =====================
    let lastGameId = null;
    let isRunning = false;
    let betCount = 0;
    let claimCount = 0;

    // ===================== 工具函数 =====================
    
    // 日志输出
    function log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const prefix = {
            'info': '📌',
            'success': '✅',
            'warning': '⚠️',
            'error': '❌',
            'bet': '🎲',
            'claim': '💰'
        }[type] || '📌';
        console.log(`[${timestamp}] ${prefix} ${message}`);
    }

    // 等待延迟
    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // 查找包含特定文字的按钮
    function findButtonByText(text) {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
            if (btn.innerText.includes(text)) {
                return btn;
            }
        }
        return null;
    }

    // 模拟点击
    function simulateClick(element) {
        if (!element) return false;
        element.click();
        return true;
    }

    // 设置输入框值
    function setInputValue(input, value) {
        if (!input) return false;
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value'
        ).set;
        nativeInputValueSetter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }

    // ===================== 核心功能 =====================

    // 获取当前余额
    function getBalance() {
        // 尝试从页面获取余额信息
        const balanceElements = document.querySelectorAll('span, div');
        for (const el of balanceElements) {
            const text = el.innerText;
            // 查找包含 USDC 余额的元素
            if (text && text.includes('USDC') && !text.includes('Make')) {
                const match = text.match(/(\d+\.?\d*)\s*USDC/);
                if (match) {
                    return parseFloat(match[1]);
                }
            }
        }
        
        // 尝试从 wallet 页面的余额显示获取
        const walletBalance = document.querySelector('[class*="balance"]');
        if (walletBalance) {
            const match = walletBalance.innerText.match(/(\d+\.?\d*)/);
            if (match) return parseFloat(match[1]);
        }
        
        return null;
    }

    // 获取当前游戏 ID
    function getCurrentGameId() {
        // 查找当前活跃的游戏 ID 按钮（通常是金黄色的）
        const gameButtons = document.querySelectorAll('button');
        for (const btn of gameButtons) {
            const text = btn.innerText;
            if (text && text.startsWith('#')) {
                const match = text.match(/#(\d+)/);
                if (match) {
                    return match[1];
                }
            }
        }
        return null;
    }

    // 检查是否已经下注过当前游戏
    function hasAlreadyBet(gameId) {
        // 检查投注记录表格
        const rows = document.querySelectorAll('tr, [class*="row"]');
        for (const row of rows) {
            if (row.innerText && row.innerText.includes(`#${gameId}`)) {
                return true;
            }
        }
        return false;
    }

    // 点击 Random10
    function clickRandom10() {
        const random10Btn = findButtonByText('Random10');
        if (random10Btn) {
            simulateClick(random10Btn);
            log('已点击 Random10', 'success');
            return true;
        }
        
        // 备选：查找 random 相关的按钮
        const randomBtns = document.querySelectorAll('button[class*="random"]');
        for (const btn of randomBtns) {
            if (btn.innerText.includes('10')) {
                simulateClick(btn);
                log('已点击 Random10（备选）', 'success');
                return true;
            }
        }
        
        log('未找到 Random10 按钮', 'warning');
        return false;
    }

    // 设置下注金额
    function setBetAmount(amount) {
        // 尝试找到金额输入框
        const amountInput = document.querySelector('#calculatedLengthInput') 
            || document.querySelector('input[placeholder*="amount"]')
            || document.querySelector('input[type="number"]');
        
        if (amountInput) {
            setInputValue(amountInput, amount.toFixed(2));
            log(`已设置下注金额: ${amount.toFixed(2)} USDC`, 'info');
            return true;
        }
        
        // 尝试倍数输入框
        const multipleInput = document.querySelector('#multipleInput');
        if (multipleInput) {
            setInputValue(multipleInput, '1');
            log('已设置倍数为 1', 'info');
            return true;
        }
        
        log('未找到金额输入框', 'warning');
        return false;
    }

    // 点击 Make Guess
    function clickMakeGuess() {
        const makeGuessBtn = findButtonByText('Make Guess');
        if (makeGuessBtn) {
            simulateClick(makeGuessBtn);
            log('已点击 Make Guess', 'bet');
            return true;
        }
        log('未找到 Make Guess 按钮', 'warning');
        return false;
    }

    // 执行下注
    async function placeBet() {
        const balance = getBalance();
        if (!balance || balance <= 0) {
            log('余额不足或无法获取余额', 'warning');
            return false;
        }

        const gameId = getCurrentGameId();
        if (!gameId) {
            log('无法获取当前游戏 ID', 'warning');
            return false;
        }

        if (gameId === lastGameId) {
            log(`游戏 #${gameId} 已处理过，等待下一局`, 'info');
            return false;
        }

        // 计算下注金额
        let betAmount = balance * CONFIG.BET_RATIO;
        betAmount = Math.max(CONFIG.MIN_BET, Math.min(CONFIG.MAX_BET, betAmount));

        if (balance < betAmount) {
            log(`余额 ${balance} 不足以下注 ${betAmount}`, 'warning');
            return false;
        }

        log(`开始下注游戏 #${gameId}，余额: ${balance.toFixed(2)} USDC`, 'bet');

        // 步骤 1: 点击 Random10
        if (!clickRandom10()) {
            return false;
        }
        await delay(500);

        // 步骤 2: 设置下注金额
        setBetAmount(betAmount);
        await delay(500);

        // 步骤 3: 点击 Make Guess
        if (!clickMakeGuess()) {
            return false;
        }

        lastGameId = gameId;
        betCount++;
        log(`下注成功提交！累计下注: ${betCount} 次`, 'success');
        
        return true;
    }

    // 检查并执行 Claim
    async function checkAndClaim() {
        log('检查可领取的奖励...', 'claim');
        
        // 查找所有 Claim 按钮
        const claimButtons = [];
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
            const text = btn.innerText.trim().toLowerCase();
            if (text === 'claim' && !btn.disabled) {
                claimButtons.push(btn);
            }
        }

        if (claimButtons.length === 0) {
            log('暂无可领取的奖励', 'info');
            return 0;
        }

        log(`发现 ${claimButtons.length} 个可领取奖励`, 'claim');
        
        let claimed = 0;
        for (const btn of claimButtons) {
            simulateClick(btn);
            claimed++;
            claimCount++;
            log(`领取奖励 ${claimed}/${claimButtons.length}`, 'success');
            await delay(2000); // 等待钱包确认
        }

        return claimed;
    }

    // 切换到 Wallet 页面检查 Claim
    async function switchToWalletAndClaim() {
        // 尝试点击 Wallet 菜单
        const walletMenu = findButtonByText('Wallet') 
            || document.querySelector('[href*="wallet"]')
            || document.querySelector('a[href="/wallet"]');
        
        if (walletMenu) {
            simulateClick(walletMenu);
            await delay(2000);
            await checkAndClaim();
            
            // 切回首页
            const homeMenu = findButtonByText('Home') 
                || document.querySelector('[href="/"]')
                || document.querySelector('a[href="/"]');
            if (homeMenu) {
                simulateClick(homeMenu);
                await delay(1000);
            }
        }
    }

    // ===================== 主循环 =====================

    async function mainLoop() {
        if (!isRunning) return;

        try {
            await placeBet();
        } catch (error) {
            log(`下注出错: ${error.message}`, 'error');
        }

        setTimeout(mainLoop, CONFIG.CHECK_INTERVAL);
    }

    async function claimLoop() {
        if (!isRunning) return;

        try {
            await checkAndClaim();
        } catch (error) {
            log(`领取出错: ${error.message}`, 'error');
        }

        setTimeout(claimLoop, CONFIG.CLAIM_INTERVAL);
    }

    // ===================== 控制函数 =====================

    function start() {
        if (isRunning) {
            log('脚本已在运行中', 'warning');
            return;
        }

        isRunning = true;
        log('🚀 HashGame 自动下注脚本已启动！', 'success');
        log(`配置: 下注比例 ${CONFIG.BET_RATIO * 100}%, 最小 ${CONFIG.MIN_BET} USDC, 最大 ${CONFIG.MAX_BET} USDC`, 'info');
        
        // 启动主循环
        mainLoop();
        
        // 启动 Claim 循环
        setTimeout(claimLoop, 10000);
    }

    function stop() {
        isRunning = false;
        log('⏹️ 脚本已停止', 'info');
        log(`统计: 累计下注 ${betCount} 次, 领取 ${claimCount} 次`, 'info');
    }

    function status() {
        const balance = getBalance();
        const gameId = getCurrentGameId();
        log(`运行状态: ${isRunning ? '运行中' : '已停止'}`, 'info');
        log(`当前余额: ${balance ? balance.toFixed(2) : '未知'} USDC`, 'info');
        log(`当前游戏: #${gameId || '未知'}`, 'info');
        log(`累计下注: ${betCount} 次`, 'info');
        log(`累计领取: ${claimCount} 次`, 'info');
    }

    // ===================== 暴露全局 API =====================

    window.HashGameBot = {
        start,
        stop,
        status,
        config: CONFIG,
        placeBet,
        checkClaim: checkAndClaim,
    };

    // 启动提示
    log('='.repeat(50), 'info');
    log('HashGame 自动下注脚本已加载！', 'success');
    log('使用方法:', 'info');
    log('  HashGameBot.start()  - 启动自动下注', 'info');
    log('  HashGameBot.stop()   - 停止脚本', 'info');
    log('  HashGameBot.status() - 查看状态', 'info');
    log('='.repeat(50), 'info');

    // 自动启动（可选）
    // start();

})();

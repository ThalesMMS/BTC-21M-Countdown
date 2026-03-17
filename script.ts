type Block = {
    height: number;
    timestamp: number;
};

// Constants
const TOTAL_BTC_SUPPLY = 21000000;
const SATS_PER_BTC = 100000000;
const HALVING_INTERVAL = 210000;
const INITIAL_SUBSIDY_SATS = 50 * SATS_PER_BTC;
const FIXED_BLOCK_TIME_MS = 10 * 60 * 1000; // 10 minutes in milliseconds
const API_POLL_INTERVAL = 30000; // 30 seconds
const BLOCKS_API_URL = 'https://mempool.space/api/blocks';
const HEIGHT_API_URL = 'https://mempool.space/api/blocks/tip/height';
const DAY_MS = 24 * 60 * 60 * 1000;

const FINAL_REWARD_BLOCK = calculateFinalRewardBlock();
const MAX_ISSUABLE_SATS = totalIssuedAtHeight(FINAL_REWARD_BLOCK);
const UNISSUED_SATS = (TOTAL_BTC_SUPPLY * SATS_PER_BTC) - MAX_ISSUABLE_SATS;

// State
let currentBlock: number | null = null;
let lastBlockTimeMs: number | null = null;
let estimatedTargetTimeMs: number | null = null;

function getRequiredElement<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`Missing element: ${id}`);
    }
    return element as T;
}

// DOM Elements
const elements = {
    years: getRequiredElement<HTMLSpanElement>('years'),
    days: getRequiredElement<HTMLSpanElement>('days'),
    hours: getRequiredElement<HTMLSpanElement>('hours'),
    mins: getRequiredElement<HTMLSpanElement>('mins'),
    secs: getRequiredElement<HTMLSpanElement>('secs'),
    yearsFlip: getRequiredElement<HTMLDivElement>('years-flip'),
    daysFlip: getRequiredElement<HTMLDivElement>('days-flip'),
    hoursFlip: getRequiredElement<HTMLDivElement>('hours-flip'),
    minsFlip: getRequiredElement<HTMLDivElement>('mins-flip'),
    secsFlip: getRequiredElement<HTMLDivElement>('secs-flip'),
    currentBlock: getRequiredElement<HTMLSpanElement>('current-block'),
    targetBlock: getRequiredElement<HTMLSpanElement>('target-block'),
    targetBlockHero: getRequiredElement<HTMLSpanElement>('target-block-hero'),
    blocksLeft: getRequiredElement<HTMLSpanElement>('blocks-left'),
    btcLeft: getRequiredElement<HTMLSpanElement>('btc-left'),
    currentReward: getRequiredElement<HTMLSpanElement>('current-reward'),
    estimatedDate: getRequiredElement<HTMLSpanElement>('estimated-date'),
    btcMined: getRequiredElement<HTMLSpanElement>('btc-mined'),
    finalSupply: getRequiredElement<HTMLSpanElement>('final-supply'),
    progressTargetSupply: getRequiredElement<HTMLSpanElement>('progress-target-supply'),
    unissuedAmount: getRequiredElement<HTMLSpanElement>('unissued-amount'),
    progressPercent: getRequiredElement<HTMLSpanElement>('progress-percent'),
    progressFill: getRequiredElement<HTMLDivElement>('progress-fill'),
    lastUpdate: getRequiredElement<HTMLSpanElement>('last-update')
};

// Calculate total BTC issued through mining rewards (in satoshis) at a given block height
function totalIssuedAtHeight(height: number | null): number {
    if (height === null || height < 0) return 0;

    let remainingBlocks = height + 1;
    let reward = INITIAL_SUBSIDY_SATS;
    let total = 0;

    while (remainingBlocks > 0 && reward > 0) {
        const blocksThisEra = Math.min(remainingBlocks, HALVING_INTERVAL);
        total += blocksThisEra * reward;
        remainingBlocks -= blocksThisEra;
        reward = Math.floor(reward / 2);
    }

    return total;
}

function rewardAtHeight(height: number | null): number {
    if (height === null || height < 0) return 0;
    const era = Math.floor(height / HALVING_INTERVAL);
    return Math.floor(INITIAL_SUBSIDY_SATS / (2 ** era));
}

function calculateFinalRewardBlock(): number {
    let erasWithReward = 0;
    let reward = INITIAL_SUBSIDY_SATS;

    while (reward > 0) {
        erasWithReward += 1;
        reward = Math.floor(reward / 2);
    }

    return (erasWithReward * HALVING_INTERVAL) - 1;
}

function updateEstimatedTargetTime(blocksLeft: number | null, anchorTimeMs: number | null = lastBlockTimeMs): void {
    if (anchorTimeMs === null || blocksLeft === null) return;
    estimatedTargetTimeMs = anchorTimeMs + (blocksLeft * FIXED_BLOCK_TIME_MS);
}

// Fetch current block data from mempool.space
async function fetchBlockData(): Promise<boolean> {
    try {
        const response = await fetch(BLOCKS_API_URL);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const blocks = (await response.json()) as Block[];
        if (!Array.isArray(blocks) || blocks.length === 0) {
            throw new Error('Invalid blocks response');
        }

        const sortedBlocks = [...blocks].sort((a, b) => b.height - a.height);
        const tipBlock = sortedBlocks[0];
        const nextHeight = tipBlock.height;
        const isNewBlock = currentBlock === null || nextHeight !== currentBlock;
        currentBlock = nextHeight;

        const blockTimeMs = tipBlock.timestamp * 1000;
        if (isNewBlock || estimatedTargetTimeMs === null || lastBlockTimeMs !== blockTimeMs) {
            lastBlockTimeMs = blockTimeMs;
            updateEstimatedTargetTime(Math.max(0, FINAL_REWARD_BLOCK - currentBlock), blockTimeMs);
        }
        updateLastUpdateTime();
        return true;
    } catch (error) {
        console.error('Error fetching block data:', error);
        return fetchBlockHeightFallback();
    }
}

async function fetchBlockHeightFallback(): Promise<boolean> {
    try {
        const response = await fetch(HEIGHT_API_URL);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const height = Number(await response.json());
        if (!Number.isFinite(height)) {
            throw new Error('Invalid height response');
        }
        const isNewBlock = currentBlock === null || height !== currentBlock;
        currentBlock = height;
        if (isNewBlock || estimatedTargetTimeMs === null) {
            lastBlockTimeMs = Date.now();
            updateEstimatedTargetTime(Math.max(0, FINAL_REWARD_BLOCK - currentBlock), lastBlockTimeMs);
        }
        updateLastUpdateTime();
        return true;
    } catch (error) {
        console.error('Error fetching block height:', error);
        elements.currentBlock.classList.add('error');
        elements.currentBlock.textContent = 'API Error';
        return false;
    }
}

// Calculate remaining blocks, BTC, and total mined
function calculateRemaining(): { blocksLeft: number; totalMinedSats: number; btcLeftSats: number; currentRewardSats: number } | null {
    if (currentBlock === null) return null;

    const blocksLeft = Math.max(0, FINAL_REWARD_BLOCK - currentBlock);
    const totalMinedSats = totalIssuedAtHeight(currentBlock);
    const btcLeftSats = Math.max(0, MAX_ISSUABLE_SATS - totalMinedSats);
    const currentRewardSats = rewardAtHeight(currentBlock);

    return { blocksLeft, totalMinedSats, btcLeftSats, currentRewardSats };
}

// Format number with commas
function formatNumber(num: number): string {
    return num.toLocaleString('en-US');
}

function formatBtc(amount: number, maximumFractionDigits = 8): string {
    return amount.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits
    });
}

function formatMiningReward(rewardSats: number): string {
    if (rewardSats <= 0) return '0 BTC';
    if (rewardSats < SATS_PER_BTC) {
        const satsLabel = rewardSats === 1 ? 'sat' : 'sats';
        return `${formatBtc(rewardSats / SATS_PER_BTC, 8)} BTC (${formatNumber(rewardSats)} ${satsLabel})`;
    }
    return `${formatBtc(rewardSats / SATS_PER_BTC, 8)} BTC`;
}

function padDigits(num: number, digits = 2): string {
    return String(Math.floor(num)).padStart(digits, '0');
}

function addUtcYears(date: Date, years: number): Date {
    return new Date(Date.UTC(
        date.getUTCFullYear() + years,
        date.getUTCMonth(),
        date.getUTCDate(),
        date.getUTCHours(),
        date.getUTCMinutes(),
        date.getUTCSeconds(),
        date.getUTCMilliseconds()
    ));
}

function getCountdownParts(targetTimeMs: number): { years: number; days: number; hours: number; mins: number; secs: number } {
    const now = new Date();
    const target = new Date(targetTimeMs);

    if (target <= now) {
        return { years: 0, days: 0, hours: 0, mins: 0, secs: 0 };
    }

    let years = target.getUTCFullYear() - now.getUTCFullYear();
    let yearAnchor = addUtcYears(now, years);

    if (yearAnchor > target) {
        years -= 1;
        yearAnchor = addUtcYears(now, years);
    }

    let remainingMs = target.getTime() - yearAnchor.getTime();
    const days = Math.floor(remainingMs / DAY_MS);
    remainingMs -= days * DAY_MS;

    const hours = Math.floor(remainingMs / (60 * 60 * 1000));
    remainingMs -= hours * 60 * 60 * 1000;

    const mins = Math.floor(remainingMs / (60 * 1000));
    remainingMs -= mins * 60 * 1000;

    const secs = Math.floor(remainingMs / 1000);

    return { years, days, hours, mins, secs };
}

// Trigger flip animation
function triggerFlip(element: HTMLElement, newValue: string): void {
    const span = element.querySelector('span');
    if (!span) return;
    const currentValue = span.textContent ?? '';
    if (currentValue !== newValue) {
        element.classList.add('flip');
        setTimeout(() => {
            span.textContent = newValue;
        }, 300);
        setTimeout(() => {
            element.classList.remove('flip');
        }, 600);
    }
}

// Update countdown display
function updateCountdownDisplay(targetTimeMs: number | null): void {
    if (targetTimeMs === null) {
        triggerFlip(elements.yearsFlip, '---');
        triggerFlip(elements.daysFlip, '--');
        triggerFlip(elements.hoursFlip, '--');
        triggerFlip(elements.minsFlip, '--');
        triggerFlip(elements.secsFlip, '--');
        return;
    }

    const parts = getCountdownParts(targetTimeMs);

    const yearsStr = padDigits(parts.years, 3);
    const daysStr = padDigits(parts.days, 3);
    const hoursStr = padDigits(parts.hours);
    const minsStr = padDigits(parts.mins);
    const secsStr = padDigits(parts.secs);

    // Update with flip animation
    triggerFlip(elements.yearsFlip, yearsStr);
    triggerFlip(elements.daysFlip, daysStr);
    triggerFlip(elements.hoursFlip, hoursStr);
    triggerFlip(elements.minsFlip, minsStr);
    triggerFlip(elements.secsFlip, secsStr);
}

// Format estimated date
function formatEstimatedDate(targetTimeMs: number): string {
    const estimatedDate = new Date(targetTimeMs);
    const options: Intl.DateTimeFormatOptions = {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
    };
    return estimatedDate.toLocaleString('en-US', options);
}

// Update stats display
function updateStatsDisplay(
    data: { blocksLeft: number; totalMinedSats: number; btcLeftSats: number; currentRewardSats: number },
    targetTimeMs: number | null
): void {
    elements.currentBlock.classList.remove('error');
    elements.currentBlock.textContent = formatNumber(currentBlock ?? 0);
    elements.targetBlock.textContent = formatNumber(FINAL_REWARD_BLOCK);
    elements.targetBlockHero.textContent = formatNumber(FINAL_REWARD_BLOCK);
    elements.blocksLeft.textContent = formatNumber(data.blocksLeft);
    elements.btcLeft.textContent = `${formatBtc(data.btcLeftSats / SATS_PER_BTC)} BTC`;
    elements.currentReward.textContent = formatMiningReward(data.currentRewardSats);

    if (data.blocksLeft === 0) {
        elements.estimatedDate.textContent = 'Final mining reward mined';
    } else if (targetTimeMs !== null) {
        elements.estimatedDate.textContent = formatEstimatedDate(targetTimeMs);
    } else {
        elements.estimatedDate.textContent = '--';
    }

    // Update progress
    const totalMinedBtc = data.totalMinedSats / SATS_PER_BTC;
    const progressPercent = Math.min((data.totalMinedSats / MAX_ISSUABLE_SATS) * 100, 100);

    elements.btcMined.textContent = formatBtc(totalMinedBtc);
    elements.progressPercent.textContent = progressPercent.toFixed(2);
    elements.progressFill.style.width = `${progressPercent}%`;
}

// Update last update time display
function updateLastUpdateTime(): void {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    elements.lastUpdate.textContent = `Last update: ${timeStr}`;
}

function populateStaticCopy(): void {
    const finalSupplyText = `${formatBtc(MAX_ISSUABLE_SATS / SATS_PER_BTC)} BTC`;
    elements.finalSupply.textContent = finalSupplyText;
    elements.progressTargetSupply.textContent = finalSupplyText;
    elements.unissuedAmount.textContent = `${formatBtc(UNISSUED_SATS / SATS_PER_BTC)} BTC`;
    elements.targetBlock.textContent = formatNumber(FINAL_REWARD_BLOCK);
    elements.targetBlockHero.textContent = formatNumber(FINAL_REWARD_BLOCK);
}

// Main update function
function updateDisplay(): void {
    const data = calculateRemaining();
    if (!data) {
        updateCountdownDisplay(null);
        return;
    }

    const targetTimeMs = estimatedTargetTimeMs === null
        ? null
        : Math.max(Date.now(), estimatedTargetTimeMs);

    updateCountdownDisplay(targetTimeMs);
    updateStatsDisplay(data, targetTimeMs);
}

// Start the countdown
async function startCountdown(): Promise<void> {
    // Initial fetch
    await fetchBlockData();
    updateDisplay();

    // Update countdown every second
    window.setInterval(updateDisplay, 1000);

    // Fetch new block height every 30 seconds
    window.setInterval(async () => {
        await fetchBlockData();
        updateDisplay();
    }, API_POLL_INTERVAL);
}

// Handle visibility change (refresh data when tab becomes visible)
document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
        await fetchBlockData();
        updateDisplay();
    }
});

// Initialize
populateStaticCopy();
startCountdown();

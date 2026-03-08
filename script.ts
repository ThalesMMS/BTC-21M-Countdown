type Block = {
    height: number;
    timestamp: number;
};

type EstimateMode = 'average' | 'fixed';
type TargetMode = 'exact' | 'estimate';

// Constants
const TARGET_BTC = 20000000;
const TOTAL_BTC_SUPPLY = 21000000;
const SATS_PER_BTC = 100000000;
const HALVING_INTERVAL = 210000;
const INITIAL_SUBSIDY_SATS = 50 * SATS_PER_BTC;
const FIXED_BLOCK_TIME_MS = 10 * 60 * 1000; // 10 minutes in milliseconds
const FALLBACK_BLOCK_TIME_MS = FIXED_BLOCK_TIME_MS;
const API_POLL_INTERVAL = 30000; // 30 seconds
const BLOCKS_API_URL = 'https://mempool.space/api/blocks';
const HEIGHT_API_URL = 'https://mempool.space/api/blocks/tip/height';

const TARGET_SATS = TARGET_BTC * SATS_PER_BTC;
const _exactBlock = blockHeightForSupply(TARGET_SATS);
if (_exactBlock === null) {
    throw new Error('Unable to compute target block height.');
}
const EXACT_TARGET_BLOCK: number = _exactBlock;
const ESTIMATED_TARGET_BLOCK = 940217;

// State
let currentBlock: number | null = null;
let avgBlockTimeMs = FALLBACK_BLOCK_TIME_MS;
let lastBlockTimeMs: number | null = null;
let estimatedTargetTimeMs: number | null = null;
let countdownInterval: number | null = null;
let estimateMode: EstimateMode = 'fixed';
let targetMode: TargetMode = 'exact';

function getRequiredElement<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`Missing element: ${id}`);
    }
    return element as T;
}

// DOM Elements
const elements = {
    days: getRequiredElement<HTMLSpanElement>('days'),
    hours: getRequiredElement<HTMLSpanElement>('hours'),
    mins: getRequiredElement<HTMLSpanElement>('mins'),
    secs: getRequiredElement<HTMLSpanElement>('secs'),
    daysFlip: getRequiredElement<HTMLDivElement>('days-flip'),
    hoursFlip: getRequiredElement<HTMLDivElement>('hours-flip'),
    minsFlip: getRequiredElement<HTMLDivElement>('mins-flip'),
    secsFlip: getRequiredElement<HTMLDivElement>('secs-flip'),
    currentBlock: getRequiredElement<HTMLSpanElement>('current-block'),
    targetBlock: getRequiredElement<HTMLSpanElement>('target-block'),
    blocksLeft: getRequiredElement<HTMLSpanElement>('blocks-left'),
    btcLeft: getRequiredElement<HTMLSpanElement>('btc-left'),
    estimatedDate: getRequiredElement<HTMLSpanElement>('estimated-date'),
    btcMined: getRequiredElement<HTMLSpanElement>('btc-mined'),
    progressPercent: getRequiredElement<HTMLSpanElement>('progress-percent'),
    progressFill: getRequiredElement<HTMLDivElement>('progress-fill'),
    estimateMode: getRequiredElement<HTMLInputElement>('estimate-mode'),
    estimateModeLabel: getRequiredElement<HTMLSpanElement>('estimate-mode-label'),
    modeFixedLabel: getRequiredElement<HTMLSpanElement>('mode-fixed-label'),
    modeAvgLabel: getRequiredElement<HTMLSpanElement>('mode-avg-label'),
    avgBlockTime: getRequiredElement<HTMLSpanElement>('avg-block-time'),
    lastUpdate: getRequiredElement<HTMLSpanElement>('last-update'),
    targetMode: getRequiredElement<HTMLInputElement>('target-mode'),
    targetModeLabel: getRequiredElement<HTMLSpanElement>('target-mode-label'),
    modeExactLabel: getRequiredElement<HTMLSpanElement>('mode-exact-label'),
    modeEstimateLabel: getRequiredElement<HTMLSpanElement>('mode-estimate-label')
};

// Calculate total subsidy mined (in satoshis) at a given block height
function totalSubsidyAtHeight(height: number | null): number {
    if (height === null || height < 0) return 0;

    let remainingBlocks = height + 1;
    let subsidy = INITIAL_SUBSIDY_SATS;
    let total = 0;

    while (remainingBlocks > 0 && subsidy > 0) {
        const blocksThisEra = Math.min(remainingBlocks, HALVING_INTERVAL);
        total += blocksThisEra * subsidy;
        remainingBlocks -= blocksThisEra;
        subsidy = Math.floor(subsidy / 2);
    }

    return total;
}

// Find the first block height where total subsidy >= target (in satoshis)
function blockHeightForSupply(targetSats: number): number | null {
    let subsidy = INITIAL_SUBSIDY_SATS;
    let remaining = targetSats;
    let blocks = 0;

    while (subsidy > 0) {
        const eraSupply = subsidy * HALVING_INTERVAL;
        if (remaining > eraSupply) {
            remaining -= eraSupply;
            blocks += HALVING_INTERVAL;
            subsidy = Math.floor(subsidy / 2);
            continue;
        }

        const blocksNeeded = Math.ceil(remaining / subsidy);
        return blocks + blocksNeeded - 1;
    }

    return null;
}

function calculateAverageBlockTimeMs(blocks: Block[]): number | null {
    if (!Array.isArray(blocks) || blocks.length < 2) return null;

    let totalSeconds = 0;
    let samples = 0;
    for (let i = 0; i < blocks.length - 1; i += 1) {
        const delta = blocks[i].timestamp - blocks[i + 1].timestamp;
        if (delta > 0) {
            totalSeconds += delta;
            samples += 1;
        }
    }

    if (samples === 0) return null;
    return (totalSeconds / samples) * 1000;
}

function getTargetBlock(): number {
    return targetMode === 'exact' ? EXACT_TARGET_BLOCK : ESTIMATED_TARGET_BLOCK;
}

function getActiveBlockTimeMs(): number {
    return estimateMode === 'fixed' ? FIXED_BLOCK_TIME_MS : avgBlockTimeMs;
}

function updateEstimatedTargetTime(blocksLeft: number | null, anchorTimeMs: number | null = lastBlockTimeMs): void {
    if (anchorTimeMs === null || blocksLeft === null) return;
    estimatedTargetTimeMs = anchorTimeMs + (blocksLeft * getActiveBlockTimeMs());
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
        const averageMs = calculateAverageBlockTimeMs(sortedBlocks);
        if (averageMs) {
            avgBlockTimeMs = averageMs;
        }

        const blockTimeMs = tipBlock.timestamp * 1000;
        if (isNewBlock || estimatedTargetTimeMs === null || lastBlockTimeMs !== blockTimeMs) {
            lastBlockTimeMs = blockTimeMs;
            updateEstimatedTargetTime(Math.max(0, getTargetBlock() - currentBlock), blockTimeMs);
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
            updateEstimatedTargetTime(Math.max(0, getTargetBlock() - currentBlock), lastBlockTimeMs);
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
function calculateRemaining(): { blocksLeft: number; totalMinedSats: number; btcLeftSats: number } | null {
    if (currentBlock === null) return null;

    const blocksLeft = Math.max(0, getTargetBlock() - currentBlock);
    const totalMinedSats = totalSubsidyAtHeight(currentBlock);
    const btcLeftSats = Math.max(0, TARGET_SATS - totalMinedSats);

    return { blocksLeft, totalMinedSats, btcLeftSats };
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

function formatDurationShort(ms: number): string {
    if (!Number.isFinite(ms) || ms <= 0) return '--';
    const totalSeconds = Math.round(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

// Pad number with leading zero
function padZero(num: number): string {
    return String(Math.floor(num)).padStart(2, '0');
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
function updateCountdownDisplay(msLeft: number | null): void {
    if (msLeft === null) {
        triggerFlip(elements.daysFlip, '--');
        triggerFlip(elements.hoursFlip, '--');
        triggerFlip(elements.minsFlip, '--');
        triggerFlip(elements.secsFlip, '--');
        return;
    }

    const totalSeconds = Math.floor(msLeft / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    const daysStr = padZero(days);
    const hoursStr = padZero(hours);
    const minsStr = padZero(mins);
    const secsStr = padZero(secs);

    // Update with flip animation
    triggerFlip(elements.daysFlip, daysStr);
    triggerFlip(elements.hoursFlip, hoursStr);
    triggerFlip(elements.minsFlip, minsStr);
    triggerFlip(elements.secsFlip, secsStr);
}

// Format estimated date
function formatEstimatedDate(msLeft: number): string {
    const estimatedDate = new Date(Date.now() + msLeft);
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
function updateStatsDisplay(data: { blocksLeft: number; totalMinedSats: number; btcLeftSats: number }, msLeft: number | null): void {
    elements.currentBlock.classList.remove('error');
    elements.currentBlock.textContent = formatNumber(currentBlock ?? 0);
    elements.targetBlock.textContent = formatNumber(getTargetBlock());
    elements.blocksLeft.textContent = formatNumber(data.blocksLeft);
    elements.btcLeft.textContent = `${formatBtc(data.btcLeftSats / SATS_PER_BTC)} BTC`;

    if (data.blocksLeft === 0) {
        elements.estimatedDate.textContent = 'Reached';
    } else if (msLeft !== null) {
        elements.estimatedDate.textContent = formatEstimatedDate(msLeft);
    } else {
        elements.estimatedDate.textContent = '--';
    }

    // Update progress
    const totalMinedBtc = data.totalMinedSats / SATS_PER_BTC;
    const progressPercent = Math.min((data.totalMinedSats / (TOTAL_BTC_SUPPLY * SATS_PER_BTC)) * 100, 100);

    elements.btcMined.textContent = formatBtc(totalMinedBtc);
    elements.progressPercent.textContent = progressPercent.toFixed(2);
    elements.progressFill.style.width = `${progressPercent}%`;

    const activeBlockTimeMs = getActiveBlockTimeMs();
    elements.avgBlockTime.textContent = formatDurationShort(activeBlockTimeMs);
    elements.estimateModeLabel.textContent = estimateMode === 'fixed'
        ? 'fixed 10-minute blocks'
        : 'the last 10 blocks average time';
    elements.modeFixedLabel.classList.toggle('active', estimateMode === 'fixed');
    elements.modeAvgLabel.classList.toggle('active', estimateMode === 'average');

    elements.targetModeLabel.textContent = targetMode === 'exact'
        ? `exact protocol block (${formatNumber(EXACT_TARGET_BLOCK)})`
        : `market estimate block (${formatNumber(ESTIMATED_TARGET_BLOCK)})`;
    elements.modeExactLabel.classList.toggle('active', targetMode === 'exact');
    elements.modeEstimateLabel.classList.toggle('active', targetMode === 'estimate');
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

function setupTargetModeToggle(): void {
    elements.targetMode.checked = targetMode === 'estimate';
    elements.modeExactLabel.classList.toggle('active', targetMode === 'exact');
    elements.modeEstimateLabel.classList.toggle('active', targetMode === 'estimate');

    elements.targetMode.addEventListener('change', () => {
        targetMode = elements.targetMode.checked ? 'estimate' : 'exact';
        if (currentBlock !== null && lastBlockTimeMs !== null) {
            updateEstimatedTargetTime(Math.max(0, getTargetBlock() - currentBlock), lastBlockTimeMs);
        }
        updateDisplay();
    });
}

function setupEstimateModeToggle(): void {
    elements.estimateMode.checked = estimateMode === 'average';
    elements.modeFixedLabel.classList.toggle('active', estimateMode === 'fixed');
    elements.modeAvgLabel.classList.toggle('active', estimateMode === 'average');

    elements.estimateMode.addEventListener('change', () => {
        estimateMode = elements.estimateMode.checked ? 'average' : 'fixed';
        if (currentBlock !== null && lastBlockTimeMs !== null) {
            updateEstimatedTargetTime(Math.max(0, getTargetBlock() - currentBlock), lastBlockTimeMs);
        }
        updateDisplay();
    });
}

// Main update function
function updateDisplay(): void {
    const data = calculateRemaining();
    if (!data) {
        updateCountdownDisplay(null);
        return;
    }

    const msLeft = estimatedTargetTimeMs === null
        ? null
        : Math.max(0, estimatedTargetTimeMs - Date.now());

    updateCountdownDisplay(msLeft);
    updateStatsDisplay(data, msLeft);
}

// Start the countdown
async function startCountdown(): Promise<void> {
    // Initial fetch
    await fetchBlockData();
    updateDisplay();

    // Update countdown every second
    countdownInterval = window.setInterval(updateDisplay, 1000);

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
setupTargetModeToggle();
setupEstimateModeToggle();
startCountdown();

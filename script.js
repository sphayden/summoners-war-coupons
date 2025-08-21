// Global coupons array - will be loaded from API
let coupons = [
    {
        id: "sample1",
        code: "SWQFREE2024",
        addedOn: "2024-01-15T10:00:00Z",
        rewards: [
            { type: "energy", amount: 50 },
            { type: "crystals", amount: 100 }
        ],
        status: "valid",
        votes: { up: 15, down: 2 }
    },
    {
        id: "sample2", 
        code: "NEWPLAYER123",
        addedOn: "2024-01-10T08:30:00Z",
        rewards: [
            { type: "mystical_scroll", amount: 1 },
            { type: "energy", amount: 30 },
            { type: "swc_emblems", amount: 5 }
        ],
        status: "verified",
        votes: { up: 8, down: 1 }
    },
    {
        id: "sample3",
        code: "EXPIRED2023", 
        addedOn: "2023-12-01T12:00:00Z",
        rewards: [
            { type: "crystals", amount: 200 },
            { type: "runes", amount: 3 }
        ],
        status: "expired",
        votes: { up: 5, down: 12 }
    },
    {
        id: "sample4",
        code: "SCROLLPACK2024",
        addedOn: "2024-01-12T14:15:00Z", 
        rewards: [
            { type: "fire_scroll", amount: 1 },
            { type: "water_scroll", amount: 1 },
            { type: "wind_scroll", amount: 1 },
            { type: "light_scroll", amount: 1 }
        ],
        status: "valid",
        votes: { up: 23, down: 0 }
    }
];

// S3 base URL for images
const S3_BASE_URL = "https://sph-sw-bot-image-hosting.s3.us-east-2.amazonaws.com";

// Background images from S3
const BACKGROUND_IMAGES = [
    `${S3_BASE_URL}/4k/2024_Dec_New monsters.png`,
    `${S3_BASE_URL}/4k/2024_Nov Transmog.png`,
    `${S3_BASE_URL}/4k/Oct New monster.png`,
    `${S3_BASE_URL}/4k/2408_Transmog.png`,
    `${S3_BASE_URL}/4k/JujutsuKaisen Collab_Teaser.png`,
    `${S3_BASE_URL}/4k/0225_2025_1월_형상변환57차_홍보이미지.png`
];

let currentBackgroundIndex = 0;
let nextBackgroundIndex = 1;
let isTransitioning = false;
let parallaxAnimation;

// Reward types configuration
const rewardTypes = {
    energy: { 
        name: "Energy", 
        icon: `${S3_BASE_URL}/energy.png`
    },
    crystals: { 
        name: "Crystals", 
        icon: `${S3_BASE_URL}/crystal.png`
    },
    mana: { 
        name: "Mana", 
        icon: `${S3_BASE_URL}/mana.png`
    },
    mystical_scroll: { 
        name: "Mystical Scroll", 
        icon: `${S3_BASE_URL}/scroll_mystical.png`
    },
    fire_scroll: { 
        name: "Fire Scroll", 
        icon: `${S3_BASE_URL}/scroll_fire.png`
    },
    water_scroll: { 
        name: "Water Scroll", 
        icon: `${S3_BASE_URL}/scroll_water.png`
    },
    wind_scroll: { 
        name: "Wind Scroll", 
        icon: `${S3_BASE_URL}/scroll_wind.png`
    },
    ld_scroll: { 
        name: "LD Scroll", 
        icon: `${S3_BASE_URL}/scroll_light_and_dark.png`
    },
    summoning_stones: { 
        name: "Summoning Stones", 
        icon: `${S3_BASE_URL}/summon_exclusive.png`
    },
    runes: { 
        name: "Runes", 
        icon: `${S3_BASE_URL}/rune.png`
    },
    swc_emblems: { 
        name: "SWC Emblems", 
        icon: `${S3_BASE_URL}/swc2.png`
    }
};

// User session data (stored in localStorage)
let userSession = {
    votedCoupons: JSON.parse(localStorage.getItem('votedCoupons') || '{}'),
    dailySubmissions: JSON.parse(localStorage.getItem('dailySubmissions') || '{}'),
    lastSubmission: localStorage.getItem('lastSubmission') || null
};

// DOM elements
const addCouponBtn = document.getElementById('addCouponBtn');
const addCouponModal = document.getElementById('addCouponModal');
const closeModal = document.querySelector('.close');
const cancelBtn = document.getElementById('cancelBtn');
const addCouponForm = document.getElementById('addCouponForm');
const couponTableBody = document.getElementById('couponTableBody');
const rewardGrid = document.getElementById('rewardGrid');
const messageContainer = document.getElementById('messageContainer');
const refreshBtn = document.getElementById('refreshBtn');

// API base URL
const API_BASE = '/.netlify/functions';

// Subtle parallax movement
function getSubtleParallaxPosition() {
    const x = Math.random() * 20 + 40; // 40-60% (subtle movement)
    const y = Math.random() * 20 + 40; // 40-60% (subtle movement)
    return { x, y };
}

// Start subtle parallax movement for current background
function startSubtleParallax() {
    if (parallaxAnimation) {
        clearInterval(parallaxAnimation);
    }
    
    // Slower, smoother parallax movement every 8 seconds
    parallaxAnimation = setInterval(() => {
        const { x, y } = getSubtleParallaxPosition();
        document.body.style.setProperty('--bg-x', `${x}%`);
        document.body.style.setProperty('--bg-y', `${y}%`);
    }, 8000);
}

// Stop parallax movement
function stopParallax() {
    if (parallaxAnimation) {
        clearInterval(parallaxAnimation);
        parallaxAnimation = null;
    }
}

// Initialize background rotation with smooth fade transitions
function initializeBackgroundRotation() {
    // Set initial backgrounds for dual system
    document.body.style.setProperty('--bg-image', `url('${BACKGROUND_IMAGES[currentBackgroundIndex]}')`);
    document.body.style.setProperty('--bg-image-next', `url('${BACKGROUND_IMAGES[nextBackgroundIndex]}')`);
    document.body.style.setProperty('--bg-opacity', '0.2');
    document.body.style.setProperty('--bg-opacity-next', '0');
    
    // Set initial position to center
    document.body.style.setProperty('--bg-x', '50%');
    document.body.style.setProperty('--bg-y', '50%');
    
    // Start continuous parallax movement immediately
    startSubtleParallax();
    
    // Rotate backgrounds every 15 seconds with smooth crossfade
    setInterval(() => {
        if (isTransitioning) return; // Prevent overlapping transitions
        
        transitionToNextBackground();
    }, 15000);
}

// Clean crossfade transition - new image fades in at center
function transitionToNextBackground() {
    isTransitioning = true;
    
    // Calculate the NEXT image index (don't change current yet)
    const nextIndex = (currentBackgroundIndex + 1) % BACKGROUND_IMAGES.length;
    
    // Set the next background image at center position
    document.body.style.setProperty('--bg-image-next', `url('${BACKGROUND_IMAGES[nextIndex]}')`);
    document.body.style.setProperty('--bg-x-next', '50%');
    document.body.style.setProperty('--bg-y-next', '50%');
    
    // Crossfade: current fades out, next fades in
    document.body.style.setProperty('--bg-opacity', '0');
    document.body.style.setProperty('--bg-opacity-next', '0.2');
    
    // After transition completes, clean up and start parallax
    setTimeout(() => {
        // Update the current index
        currentBackgroundIndex = nextIndex;
        nextBackgroundIndex = (nextIndex + 1) % BACKGROUND_IMAGES.length;
        
        // Temporarily disable transitions to prevent flicker
        document.body.style.transition = 'none';
        
        // Move the visible next background to current background (at center)
        document.body.style.setProperty('--bg-image', `url('${BACKGROUND_IMAGES[currentBackgroundIndex]}')`);
        document.body.style.setProperty('--bg-x', '50%');
        document.body.style.setProperty('--bg-y', '50%');
        document.body.style.setProperty('--bg-opacity', '0.2');
        
        // Hide the next background completely
        document.body.style.setProperty('--bg-opacity-next', '0');
        
        // Re-enable transitions after the swap
        setTimeout(() => {
            document.body.style.transition = '';
            isTransitioning = false;
            
            // Start parallax movement AFTER transition is fully complete
            setTimeout(() => {
                startSubtleParallax();
            }, 500);
        }, 50);
    }, 2000); // Match the CSS transition duration
}

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeRewardGrid();
    loadCoupons(); // Use loadCoupons() for production
    setupEventListeners();
    initializeBackgroundRotation();
});

// Setup event listeners
function setupEventListeners() {
    addCouponBtn.addEventListener('click', openModal);
    closeModal.addEventListener('click', closeModalHandler);
    cancelBtn.addEventListener('click', closeModalHandler);
    addCouponForm.addEventListener('submit', handleCouponSubmission);
    
    // Refresh icon handler
    refreshBtn.addEventListener('click', handleRefreshClick);
    
    // Close modal when clicking outside
    window.addEventListener('click', function(event) {
        if (event.target === addCouponModal) {
            closeModalHandler();
        }
    });
}

// Initialize reward grid in the modal
function initializeRewardGrid() {
    rewardGrid.innerHTML = '';
    
    Object.entries(rewardTypes).forEach(([type, config]) => {
        const rewardItem = document.createElement('div');
        rewardItem.className = 'reward-item';
        rewardItem.innerHTML = `
            <img src="${config.icon}" alt="${config.name}" style="width: 40px; height: 40px; object-fit: contain;" />
            <label>${config.name}</label>
            <input type="number" name="reward_${type}" min="0" value="0" />
        `;
        rewardGrid.appendChild(rewardItem);
    });
}

// Cache settings
const CACHE_DURATION = 30 * 1000; // 30 seconds

// Load coupons from API with caching
async function loadCoupons() {
    try {
        // 1. Check for cached data and show immediately if available
        const cached = localStorage.getItem('coupons_cache');
        const cacheTime = localStorage.getItem('coupons_cache_time');
        let showedCached = false;
        
        if (cached && cacheTime) {
            const age = Date.now() - parseInt(cacheTime);
            console.log(`Cache found, age: ${age}ms, fresh: ${age < CACHE_DURATION}`);
            
            // Show cached data immediately (regardless of age)
            coupons = JSON.parse(cached);
            renderCouponTable();
            showedCached = true;
            console.log('Displaying cached data');
            
            // If cache is fresh, we're done
            if (age < CACHE_DURATION) {
                console.log('Cache is fresh, skipping API call');
                hideMessage();
                return;
            }
        }
        
        // 2. Show loading only if we don't have cached data
        if (!showedCached) {
            showMessage('Loading coupons...', 'info');
        }
        
        console.log('Fetching fresh data from API');
        
        // 3. Always fetch fresh data (but show cached while waiting)
        const response = await fetch(`${API_BASE}/get-coupons`);
        const data = await response.json();
        
        if (data.success) {
            // 4. Update cache
            localStorage.setItem('coupons_cache', JSON.stringify(data.coupons));
            localStorage.setItem('coupons_cache_time', Date.now().toString());
            
            // 5. Update display only if data changed
            const dataChanged = JSON.stringify(coupons) !== JSON.stringify(data.coupons);
            if (dataChanged || !showedCached) {
                console.log('Updating display with fresh data');
                coupons = data.coupons;
                renderCouponTable();
                
            } else {
                console.log('Data unchanged, keeping current display');
            }
            
            hideMessage();
        } else {
            throw new Error(data.error || 'Failed to load coupons');
        }
    } catch (error) {
        console.error('Error loading coupons:', error);
        // If we showed cached data, don't show error
        if (!showedCached) {
            showMessage('Failed to load coupons. Please refresh the page.', 'error');
        } else {
            console.log('API failed but showing cached data');
        }
    }
}

// Render the coupon table
function renderCouponTable() {
    couponTableBody.innerHTML = '';
    
    if (coupons.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="5" style="text-align: center; padding: 40px;">No coupons available yet. Be the first to add one!</td>';
        couponTableBody.appendChild(row);
        return;
    }
    
    coupons.forEach(coupon => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <a href="http://withhive.me/313/${coupon.code}" target="_blank" class="coupon-code">${coupon.code}</a>
            </td>
            <td>
                <span class="status-badge status-${coupon.status}">
                    <span class="status-text">${coupon.status}</span>
                    <span class="status-icon">${coupon.status === 'valid' || coupon.status === 'verified' ? '✓' : '✗'}</span>
                </span>
            </td>
            <td>${formatDate(coupon.addedOn)}</td>
            <td>${formatRewards(coupon.rewards)}</td>
            <td>
                <div class="vote-buttons">
                    <button class="vote-btn ${userSession.votedCoupons[coupon.id] === 'up' ? 'voted' : ''}" 
                            onclick="vote('${coupon.id}', 'up')">
                        👍 ${coupon.votes.up}
                    </button>
                    <button class="vote-btn ${userSession.votedCoupons[coupon.id] === 'down' ? 'voted' : ''}" 
                            onclick="vote('${coupon.id}', 'down')">
                        👎 ${coupon.votes.down}
                    </button>
                </div>
            </td>
            <td>
                <a href="https://event.withhive.com/ci/smon/evt_coupon?code=${coupon.code}" target="_blank" class="web-redeem-btn" onclick="copyToClipboard('${coupon.code}')" title="Redeem on web">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </a>
            </td>
        `;
        couponTableBody.appendChild(row);
    });
}

// Format date for display
function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// Format rewards for display
function formatRewards(rewards) {
    return rewards.map(reward => {
        let config = rewardTypes[reward.type];
        
        // Handle legacy light_scroll and dark_scroll entries
        if (!config && (reward.type === 'light_scroll' || reward.type === 'dark_scroll')) {
            config = rewardTypes.ld_scroll;
        }
        
        // Fallback for unknown reward types
        if (!config) {
            config = { name: reward.type, icon: `${S3_BASE_URL}/crystal.png` };
        }
        
        return `<img src="${config.icon}" alt="${config.name}" style="width: 20px; height: 20px; vertical-align: middle; margin-right: 2px;" />x${reward.amount}`;
    }).join(', ');
}

// Handle voting
async function vote(couponId, voteType) {
    const previousVote = userSession.votedCoupons[couponId];
    
    try {
        const response = await fetch(`${API_BASE}/vote-coupon`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                couponId: couponId,
                voteType: voteType,
                userHash: getUserHash(),
                previousVote: previousVote
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Update local data
            const couponIndex = coupons.findIndex(c => c.id === couponId);
            if (couponIndex !== -1) {
                coupons[couponIndex] = data.coupon;
            }
            
            // Update user session
            if (previousVote === voteType) {
                // Removing vote
                delete userSession.votedCoupons[couponId];
                showMessage('Vote removed!', 'success');
            } else {
                // Adding or changing vote
                userSession.votedCoupons[couponId] = voteType;
                const message = previousVote ? 'Vote changed!' : 'Vote recorded!';
                showMessage(message, 'success');
            }
            
            localStorage.setItem('votedCoupons', JSON.stringify(userSession.votedCoupons));
            
            // Re-render table
            renderCouponTable();
        } else {
            throw new Error(data.error || 'Failed to record vote');
        }
    } catch (error) {
        console.error('Error voting:', error);
        showMessage('Failed to record vote. Please try again.', 'error');
    }
}

// Modal functions
function openModal() {
    addCouponModal.style.display = 'block';
}

function closeModalHandler() {
    addCouponModal.style.display = 'none';
    addCouponForm.reset();
}

// Handle coupon submission
async function handleCouponSubmission(event) {
    event.preventDefault();
    
    const formData = new FormData(addCouponForm);
    const couponCode = formData.get('couponCode').trim().toUpperCase();
    
    // Validation checks
    if (!validateSubmission(couponCode)) {
        return;
    }
    
    // Collect rewards
    const rewards = [];
    Object.keys(rewardTypes).forEach(type => {
        const amount = parseInt(formData.get(`reward_${type}`)) || 0;
        if (amount > 0) {
            rewards.push({ type, amount });
        }
    });
    
    if (rewards.length === 0) {
        showMessage('Please select at least one reward!', 'error');
        return;
    }
    
    try {
        showMessage('Adding coupon...', 'info');
        
        // Submitting coupon to API
        const response = await fetch(`${API_BASE}/add-coupon`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                code: couponCode,
                rewards: rewards,
                userHash: getUserHash()
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Update user session
            updateUserSession();
            
            // Clear only coupon cache to force fresh data
            localStorage.removeItem('coupons_cache');
            localStorage.removeItem('coupons_cache_time');
            console.log('Cleared coupon cache after adding new coupon');
            
            // Reload coupons from server
            await loadCoupons();
            
            // Close modal and show success
            closeModalHandler();
            showMessage('Coupon added successfully!', 'success');
        } else if (response.status === 409) {
            // Coupon already exists
            showMessage(data.error || 'This coupon code has already been submitted.', 'warning');
            closeModalHandler();
        } else if (response.status === 400) {
            // Invalid coupon code
            showMessage(data.error || 'Invalid coupon code.', 'error');
        } else {
            console.error('API Error:', data);
            throw new Error(data.error || 'Failed to add coupon');
        }
    } catch (error) {
        console.error('Error adding coupon:', error);
        showMessage('Failed to add coupon. Please try again.', 'error');
    }
}

// Validate submission
function validateSubmission(couponCode) {
    if (!couponCode) {
        showMessage('Please enter a coupon code!', 'error');
        return false;
    }
    
    // Daily limit disabled for testing
    // TODO: Re-enable or replace with hourly limit later
    
    // Rate limiting disabled for testing
    // TODO: Implement 10 per hour limit later
    
    return true;
}

// Update user session data
function updateUserSession() {
    const today = new Date().toDateString();
    userSession.dailySubmissions[today] = (userSession.dailySubmissions[today] || 0) + 1;
    userSession.lastSubmission = new Date().toISOString();
    
    localStorage.setItem('dailySubmissions', JSON.stringify(userSession.dailySubmissions));
    localStorage.setItem('lastSubmission', userSession.lastSubmission);
}

// Generate or get user hash for anonymous identification
function getUserHash() {
    let userHash = localStorage.getItem('userHash');
    if (!userHash) {
        userHash = 'user_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('userHash', userHash);
    }
    return userHash;
}

// Hide loading message
function hideMessage() {
    const messages = messageContainer.querySelectorAll('.message');
    messages.forEach(message => {
        if (message.textContent.includes('Loading')) {
            message.remove();
        }
    });
}



// Handle refresh button click
async function handleRefreshClick() {
    // Clear only coupon cache to force fresh data
    localStorage.removeItem('coupons_cache');
    localStorage.removeItem('coupons_cache_time');
    console.log('Manual refresh: cleared coupon cache only');
    
    // Reload coupons
    showMessage('Refreshing coupons...', 'info');
    await loadCoupons();
}

// Copy coupon code to clipboard when web redeem link is clicked
async function copyToClipboard(couponCode) {
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(couponCode);
        } else {
            // Fallback for older browsers
            fallbackCopyTextToClipboard(couponCode);
        }
    } catch (err) {
        console.error('Failed to copy: ', err);
    }
}

// Open web redemption page with coupon code (legacy function, kept for compatibility)
async function openWebRedeem(couponCode) {
    try {
        // Copy to clipboard FIRST (before opening popup)
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(couponCode);
        } else {
            // Fallback for older browsers
            fallbackCopyTextToClipboard(couponCode);
        }
        
        // Then open the page
        window.open('https://event.withhive.com/ci/smon/evt_coupon', '_blank');
        
    } catch (err) {
        console.error('Failed to copy: ', err);
        // Still open the page even if copy fails
        window.open('https://event.withhive.com/ci/smon/evt_coupon', '_blank');
    }
}

// Fallback copy function for older browsers
function fallbackCopyTextToClipboard(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    
    // Avoid scrolling to bottom
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        const successful = document.execCommand('copy');
        if (!successful) {
            throw new Error('execCommand failed');
        }
    } catch (err) {
        console.error('Fallback: Could not copy text: ', err);
        throw err;
    }
    
    document.body.removeChild(textArea);
}

// Show message to user
function showMessage(text, type = 'info') {
    // Remove existing loading messages if showing a new one
    if (type === 'info' && text.includes('Loading')) {
        hideMessage();
    }
    
    const message = document.createElement('div');
    message.className = `message ${type}`;
    message.textContent = text;
    
    messageContainer.appendChild(message);
    
    // Trigger animation
    setTimeout(() => {
        message.classList.add('show');
    }, 100);
    
    // Remove after 5 seconds (except loading messages)
    if (!text.includes('Loading')) {
        setTimeout(() => {
            message.classList.remove('show');
            setTimeout(() => {
                if (message.parentNode) {
                    message.parentNode.removeChild(message);
                }
            }, 300);
        }, 5000);
    }
}
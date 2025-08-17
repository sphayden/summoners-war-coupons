// Global coupons array - will be loaded from API
let coupons = [];

// Reward types configuration
const rewardTypes = {
    energy: { name: "Energy", icon: "⚡" },
    crystals: { name: "Crystals", icon: "💎" },
    mana: { name: "Mana", icon: "🔮" },
    mystical_scroll: { name: "Mystical Scroll", icon: "📜" },
    fire_scroll: { name: "Fire Scroll", icon: "🔥" },
    water_scroll: { name: "Water Scroll", icon: "💧" },
    wind_scroll: { name: "Wind Scroll", icon: "💨" },
    light_scroll: { name: "Light Scroll", icon: "☀️" },
    dark_scroll: { name: "Dark Scroll", icon: "🌙" },
    summoning_stones: { name: "Summoning Stones", icon: "🗿" },
    runes: { name: "Runes", icon: "⚗️" }
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

// API base URL
const API_BASE = '/.netlify/functions';

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeRewardGrid();
    loadCoupons();
    setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
    addCouponBtn.addEventListener('click', openModal);
    closeModal.addEventListener('click', closeModalHandler);
    cancelBtn.addEventListener('click', closeModalHandler);
    addCouponForm.addEventListener('submit', handleCouponSubmission);
    
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
            <div style="font-size: 24px;">${config.icon}</div>
            <label>${config.name}</label>
            <input type="number" name="reward_${type}" min="0" value="0" />
        `;
        rewardGrid.appendChild(rewardItem);
    });
}

// Load coupons from API
async function loadCoupons() {
    try {
        showMessage('Loading coupons...', 'info');
        
        const response = await fetch(`${API_BASE}/get-coupons`);
        const data = await response.json();
        
        if (data.success) {
            coupons = data.coupons;
            renderCouponTable();
            hideMessage();
        } else {
            throw new Error(data.error || 'Failed to load coupons');
        }
    } catch (error) {
        console.error('Error loading coupons:', error);
        showMessage('Failed to load coupons. Please refresh the page.', 'error');
    }
}

// Render the coupon table
function renderCouponTable() {
    couponTableBody.innerHTML = '';
    
    if (coupons.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="4" style="text-align: center; padding: 40px;">No coupons available yet. Be the first to add one!</td>';
        couponTableBody.appendChild(row);
        return;
    }
    
    coupons.forEach(coupon => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <span class="coupon-code">${coupon.code}</span>
                <span class="status-badge status-${coupon.status}">${coupon.status}</span>
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
        const config = rewardTypes[reward.type];
        return `${config.icon} ${reward.amount} ${config.name}`;
    }).join(', ');
}

// Handle voting
async function vote(couponId, voteType) {
    const previousVote = userSession.votedCoupons[couponId];
    
    if (previousVote === voteType) {
        showMessage('You have already voted on this coupon!', 'warning');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/vote-coupon`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                couponId: couponId,
                voteType: voteType,
                userHash: getUserHash()
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
            userSession.votedCoupons[couponId] = voteType;
            localStorage.setItem('votedCoupons', JSON.stringify(userSession.votedCoupons));
            
            // Re-render table
            renderCouponTable();
            showMessage('Vote recorded!', 'success');
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
            
            // Reload coupons from server
            await loadCoupons();
            
            // Close modal and show success
            closeModalHandler();
            showMessage('Coupon added successfully!', 'success');
        } else if (response.status === 409) {
            // Coupon already exists, vote on it
            const existingCoupon = data.existingCoupon;
            if (existingCoupon) {
                await vote(existingCoupon.id, 'up');
                showMessage('Coupon already exists! Your submission counted as an upvote.', 'warning');
                closeModalHandler();
            }
        } else {
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
    
    // Check daily limit
    const today = new Date().toDateString();
    const todaySubmissions = userSession.dailySubmissions[today] || 0;
    
    if (todaySubmissions >= 10) {
        showMessage('You have reached the daily limit of 10 coupon submissions!', 'error');
        return false;
    }
    
    // Check rate limiting (24 hours between submissions)
    if (userSession.lastSubmission) {
        const lastSubmissionTime = new Date(userSession.lastSubmission);
        const now = new Date();
        const hoursSinceLastSubmission = (now - lastSubmissionTime) / (1000 * 60 * 60);
        
        if (hoursSinceLastSubmission < 24) {
            const hoursRemaining = Math.ceil(24 - hoursSinceLastSubmission);
            showMessage(`Please wait ${hoursRemaining} more hours before submitting another coupon.`, 'error');
            return false;
        }
    }
    
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
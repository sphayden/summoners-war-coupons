import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';

const configureAWS = (env) => {
  AWS.config.update({
    region: env.CUSTOM_AWS_REGION || 'us-east-2',
    accessKeyId: env.CUSTOM_AWS_ACCESS_KEY_ID,
    secretAccessKey: env.CUSTOM_AWS_SECRET_ACCESS_KEY
  });
};

const getHiveId = (env) => {
  return env.HIVE_ID || 'test_hive_id';
};

const validateCouponCode = async (couponCode, env) => {
  try {
    const data = new URLSearchParams({
      'country': 'US',
      'lang': 'en', 
      'server': 'global',
      'hiveid': getHiveId(env),
      'coupon': couponCode
    });

    const response = await fetch('https://event.withhive.com/ci/smon/evt_coupon/useCoupon', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': 'https://event.withhive.com',
        'Referer': 'https://event.withhive.com/ci/smon/evt_coupon'
      },
      body: data
    });

    const responseData = await response.json();
    const isValid = responseData.retMsg === "The coupon gift has been sent.";
    
    return {
      isValid: isValid,
      message: responseData.retMsg || 'Unknown response'
    };

  } catch (error) {
    console.error('Error validating coupon:', error);
    return {
      isValid: false,
      message: 'Validation failed - network error'
    };
  }
};

const handleAddCoupon = async (request, env) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (request.method === 'OPTIONS') {
    return new Response('', { status: 200, headers });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers
    });
  }

  try {
    configureAWS(env);
    const dynamodb = new AWS.DynamoDB.DocumentClient();
    const TABLE_NAME = env.DYNAMODB_TABLE_NAME || 'summoners-war-coupons';

    const body = await request.json();
    const { code, rewards, userHash } = body;

    if (!code || !rewards || rewards.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing required fields: code and rewards'
      }), { status: 400, headers });
    }

    if (typeof code !== 'string' || code.length > 50) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid coupon code format'
      }), { status: 400, headers });
    }

    if (!Array.isArray(rewards) || rewards.length > 20) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid rewards format'
      }), { status: 400, headers });
    }

    for (const reward of rewards) {
      if (!reward.type || !reward.amount || typeof reward.amount !== 'number' || reward.amount <= 0 || reward.amount > 10000) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Invalid reward data'
        }), { status: 400, headers });
      }
    }

    const couponCode = code.trim().toUpperCase();

    const checkParams = {
      TableName: TABLE_NAME,
      FilterExpression: 'code = :code',
      ExpressionAttributeValues: {
        ':code': couponCode
      }
    };

    const existingCoupons = await dynamodb.scan(checkParams).promise();
    
    if (existingCoupons.Items && existingCoupons.Items.length > 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'This coupon code has already been submitted to the community database.',
        existingCoupon: existingCoupons.Items[0]
      }), { status: 409, headers });
    }

    const verification = await validateCouponCode(couponCode, env);

    if (!verification.isValid) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid coupon code. Please double-check the spelling - this code may be expired, invalid, or region-specific.',
        verification: verification
      }), { status: 400, headers });
    }

    const now = new Date().toISOString();
    const newCoupon = {
      id: uuidv4(),
      code: couponCode,
      status: 'valid',
      addedOn: now,
      lastUpdated: now,
      rewards: rewards,
      votes: {
        up: 0,
        down: 0
      },
      submittedBy: userHash || 'anonymous',
      verificationResult: verification
    };

    const putParams = {
      TableName: TABLE_NAME,
      Item: newCoupon
    };

    await dynamodb.put(putParams).promise();

    return new Response(JSON.stringify({
      success: true,
      coupon: newCoupon,
      verification: verification,
      message: 'Coupon added successfully and verified as valid!'
    }), { status: 201, headers });

  } catch (error) {
    console.error('Error adding coupon:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to add coupon'
    }), { status: 500, headers });
  }
};

const handleGetCoupons = async (request, env) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (request.method === 'OPTIONS') {
    return new Response('', { status: 200, headers });
  }

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers
    });
  }

  try {
    configureAWS(env);
    const dynamodb = new AWS.DynamoDB.DocumentClient();
    const TABLE_NAME = env.DYNAMODB_TABLE_NAME || 'summoners-war-coupons';

    const params = {
      TableName: TABLE_NAME
    };

    const result = await dynamodb.scan(params).promise();
    
    const coupons = result.Items.sort((a, b) => 
      new Date(b.addedOn) - new Date(a.addedOn)
    );

    return new Response(JSON.stringify({
      success: true,
      coupons: coupons
    }), { status: 200, headers });

  } catch (error) {
    console.error('Error fetching coupons:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to fetch coupons'
    }), { status: 500, headers });
  }
};

const handleVoteCoupon = async (request, env) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'PUT, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (request.method === 'OPTIONS') {
    return new Response('', { status: 200, headers });
  }

  if (request.method !== 'PUT') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers
    });
  }

  try {
    configureAWS(env);
    const dynamodb = new AWS.DynamoDB.DocumentClient();
    const TABLE_NAME = env.DYNAMODB_TABLE_NAME || 'summoners-war-coupons';

    const body = await request.json();
    const { couponId, voteType, userHash, previousVote } = body;

    if (!couponId || !voteType || !['up', 'down'].includes(voteType)) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid couponId or voteType (must be "up" or "down")'
      }), { status: 400, headers });
    }

    if (typeof couponId !== 'string' || couponId.length > 100) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid coupon ID format'
      }), { status: 400, headers });
    }

    if (userHash && (typeof userHash !== 'string' || userHash.length > 100)) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid user hash format'
      }), { status: 400, headers });
    }

    const getParams = {
      TableName: TABLE_NAME,
      Key: { id: couponId }
    };

    const couponResult = await dynamodb.get(getParams).promise();
    
    if (!couponResult.Item) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Coupon not found'
      }), { status: 404, headers });
    }

    const coupon = couponResult.Item;

    let updateExpression, expressionAttributeValues;
    
    if (previousVote === voteType) {
      updateExpression = `SET votes.${voteType} = votes.${voteType} - :dec, lastUpdated = :now`;
      expressionAttributeValues = {
        ':dec': 1,
        ':now': new Date().toISOString()
      };
    } else if (previousVote) {
      if (previousVote === 'up' && voteType === 'down') {
        updateExpression = `SET votes.up = votes.up - :dec, votes.down = votes.down + :inc, lastUpdated = :now`;
        expressionAttributeValues = {
          ':inc': 1,
          ':dec': 1,
          ':now': new Date().toISOString()
        };
      } else if (previousVote === 'down' && voteType === 'up') {
        updateExpression = `SET votes.down = votes.down - :dec, votes.up = votes.up + :inc, lastUpdated = :now`;
        expressionAttributeValues = {
          ':inc': 1,
          ':dec': 1,
          ':now': new Date().toISOString()
        };
      }
    } else {
      updateExpression = `SET votes.${voteType} = votes.${voteType} + :inc, lastUpdated = :now`;
      expressionAttributeValues = {
        ':inc': 1,
        ':now': new Date().toISOString()
      };
    }

    const updateParams = {
      TableName: TABLE_NAME,
      Key: { id: couponId },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    };

    const result = await dynamodb.update(updateParams).promise();

    return new Response(JSON.stringify({
      success: true,
      coupon: result.Attributes,
      message: 'Vote recorded successfully'
    }), { status: 200, headers });

  } catch (error) {
    console.error('Error voting on coupon:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to record vote'
    }), { status: 500, headers });
  }
};

// Static files embedded directly
const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Summoners War Coupon Codes</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <div class="container">
        <header>
            <h1>Summoners War Coupon Codes</h1>
            <p>Community-driven platform for sharing Summoners War mobile game coupon codes</p>
        </header>

        <main>
            <div class="actions">
                <button id="addCouponBtn" class="btn btn-primary">Add New Coupon</button>
            </div>

            <div class="coupon-table-container">
                <table id="couponTable" class="coupon-table">
                    <thead>
                        <tr>
                            <th>Code</th>
                            <th>Status</th>
                            <th>Added On</th>
                            <th>Reward</th>
                            <th>Vote</th>
                        </tr>
                    </thead>
                    <tbody id="couponTableBody">
                        <!-- Dynamic content will be loaded here -->
                    </tbody>
                </table>
            </div>
        </main>

        <!-- Add Coupon Modal -->
        <div id="addCouponModal" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Add New Coupon</h2>
                    <span class="close">&times;</span>
                </div>
                <div class="modal-body">
                    <p class="help-text">Thanks for willing to help the community, you are awesome!</p>
                    <form id="addCouponForm">
                        <div class="form-group">
                            <label for="couponCode">Coupon Code *</label>
                            <input type="text" id="couponCode" name="couponCode" required>
                        </div>
                        
                        <div class="form-group">
                            <label>Rewards</label>
                            <div class="reward-grid" id="rewardGrid">
                                <!-- Reward items will be generated here -->
                            </div>
                        </div>
                        
                        <div class="form-actions">
                            <button type="button" class="btn btn-secondary" id="cancelBtn">Cancel</button>
                            <button type="submit" class="btn btn-primary">Submit Coupon</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>

        <!-- Success/Error Messages -->
        <div id="messageContainer" class="message-container"></div>
    </div>

    <script src="script.js"></script>
</body>
</html>`;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Route API endpoints
    if (path === '/add-coupon') {
      return handleAddCoupon(request, env);
    } else if (path === '/get-coupons') {
      return handleGetCoupons(request, env);
    } else if (path === '/vote-coupon') {
      return handleVoteCoupon(request, env);
    }
    
    // Serve static files
    if (path === '/' || path === '/index.html') {
      return new Response(indexHtml, {
        headers: { 'Content-Type': 'text/html' }
      });
    } else if (path === '/styles.css') {
      return serveCSS();
    } else if (path === '/script.js') {
      return serveJS();
    }
    
    return new Response('Not found', { status: 404 });
  },
};

function serveCSS() {
  const css = `:root {
    --primary-color: #5c7cfa;
    --bg-dark: #1a1a1a;
    --bg-secondary: #2d2d2d;
    --text-light: #f8f9fa;
    --text-muted: #adb5bd;
    --border-color: #495057;
    --success-color: #28a745;
    --danger-color: #dc3545;
    --warning-color: #ffc107;
}

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background-color: var(--bg-dark);
    color: var(--text-light);
    line-height: 1.6;
    position: relative;
}

body::before {
    content: '';
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background-image: var(--bg-image);
    background-size: cover;
    background-position: var(--bg-x, 50%) var(--bg-y, 50%);
    background-repeat: no-repeat;
    opacity: var(--bg-opacity, 0.2);
    z-index: -3;
    transition: opacity 2s ease-in-out, background-position 6s ease-in-out;
    transform: translateZ(0);
    will-change: opacity, background-position;
}

body::after {
    content: '';
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background-image: var(--bg-image-next);
    background-size: cover;
    background-position: var(--bg-x-next, 50%) var(--bg-y-next, 50%);
    background-repeat: no-repeat;
    opacity: var(--bg-opacity-next, 0);
    z-index: -2;
    transition: opacity 2s ease-in-out, background-position 6s ease-in-out;
    transform: translateZ(0);
    will-change: opacity, background-position;
}

.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
}

header {
    text-align: center;
    margin-bottom: 40px;
}

header h1 {
    color: var(--primary-color);
    margin-bottom: 10px;
    font-size: 2.5rem;
}

header p {
    color: var(--text-muted);
    margin-bottom: 20px;
}

.actions {
    text-align: center;
    margin-bottom: 30px;
}

.btn {
    padding: 12px 24px;
    border: none;
    border-radius: 6px;
    font-size: 16px;
    cursor: pointer;
    transition: all 0.3s ease;
    text-decoration: none;
    display: inline-block;
}

.btn-primary {
    background: var(--primary-color);
    color: white;
}

.btn-primary:hover {
    background: #4c6ef5;
}

.btn-secondary {
    background: var(--bg-secondary);
    color: var(--text-light);
    border: 1px solid var(--border-color);
}

.btn-secondary:hover {
    background: var(--border-color);
}

.coupon-table-container {
    background: rgba(45, 45, 45, 0.75);
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
}

.coupon-table {
    width: 100%;
    border-collapse: collapse;
}

.coupon-table th,
.coupon-table td {
    padding: 15px;
    text-align: left;
    border-bottom: 1px solid var(--border-color);
}

.coupon-table th {
    background: var(--bg-dark);
    font-weight: 600;
    color: var(--primary-color);
}

.coupon-table tr:hover {
    background: rgba(92, 124, 250, 0.1);
}

.coupon-code {
    font-family: 'Courier New', monospace;
    font-weight: bold;
    color: var(--primary-color);
    text-decoration: none;
    transition: all 0.3s ease;
}

.coupon-code:hover {
    color: var(--text-light);
    text-decoration: underline;
}

.status-badge {
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: bold;
    text-transform: uppercase;
}

.status-valid {
    background: var(--success-color);
    color: white;
}

.status-expired {
    background: var(--danger-color);
    color: white;
}

.status-verified {
    background: var(--warning-color);
    color: black;
}

.vote-buttons {
    display: flex;
    gap: 10px;
    align-items: center;
}

.vote-btn {
    background: none;
    border: 1px solid var(--border-color);
    color: var(--text-muted);
    padding: 6px 10px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.3s ease;
}

.vote-btn:hover {
    color: var(--text-light);
    border-color: var(--primary-color);
}

.vote-btn.voted {
    color: var(--primary-color);
    border-color: var(--primary-color);
}

.vote-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.modal {
    display: none;
    position: fixed;
    z-index: 1000;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.8);
}

.modal-content {
    background-color: var(--bg-secondary);
    margin: 5% auto;
    padding: 0;
    border-radius: 8px;
    width: 90%;
    max-width: 600px;
    max-height: 90vh;
    overflow-y: auto;
}

.modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px;
    border-bottom: 1px solid var(--border-color);
}

.modal-header h2 {
    color: var(--primary-color);
}

.close {
    color: var(--text-muted);
    font-size: 28px;
    font-weight: bold;
    cursor: pointer;
    line-height: 1;
}

.close:hover {
    color: var(--text-light);
}

.modal-body {
    padding: 20px;
}

.help-text {
    color: var(--text-muted);
    margin-bottom: 20px;
    font-style: italic;
}

.form-group {
    margin-bottom: 20px;
}

.form-group label {
    display: block;
    margin-bottom: 8px;
    font-weight: 500;
    color: var(--text-light);
}

.form-group input {
    width: 100%;
    padding: 12px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-dark);
    color: var(--text-light);
    font-size: 16px;
}

.form-group input:focus {
    outline: none;
    border-color: var(--primary-color);
}

.reward-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 15px;
    margin-top: 10px;
}

.reward-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 15px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: var(--bg-dark);
}

.reward-item img {
    width: 40px;
    height: 40px;
    margin-bottom: 8px;
    object-fit: contain;
}

.reward-item label {
    font-size: 12px;
    text-align: center;
    margin-bottom: 8px;
}

.reward-item input {
    width: 60px;
    text-align: center;
    padding: 4px;
}

.form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 30px;
}

.message-container {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 1001;
}

.message {
    padding: 15px 20px;
    border-radius: 6px;
    margin-bottom: 10px;
    color: white;
    font-weight: 500;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
    opacity: 0;
    transform: translateX(100%);
    transition: all 0.3s ease;
}

.message.show {
    opacity: 1;
    transform: translateX(0);
}

.message.success {
    background: var(--success-color);
}

.message.error {
    background: var(--danger-color);
}

.message.warning {
    background: var(--warning-color);
    color: black;
}

@media (max-width: 768px) {
    .container {
        padding: 10px;
    }
    
    header h1 {
        font-size: 2rem;
    }
    
    .coupon-table {
        font-size: 14px;
    }
    
    .coupon-table th,
    .coupon-table td {
        padding: 10px 8px;
    }
    
    .modal-content {
        width: 95%;
        margin: 10% auto;
    }
    
    .reward-grid {
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 10px;
    }
}`;
  
  return new Response(css, {
    headers: { 'Content-Type': 'text/css' }
  });
}

function serveJS() {
  return new Response(`
// Global coupons array - will be loaded from API
let coupons = [];

// S3 base URL for images
const S3_BASE_URL = "https://sph-sw-bot-image-hosting.s3.us-east-2.amazonaws.com";

// Background images from S3
const BACKGROUND_IMAGES = [
    S3_BASE_URL + "/4k/2024_Dec_New monsters.png",
    S3_BASE_URL + "/4k/2024_Nov Transmog.png",
    S3_BASE_URL + "/4k/Oct New monster.png",
    S3_BASE_URL + "/4k/2408_Transmog.png",
    S3_BASE_URL + "/4k/JujutsuKaisen Collab_Teaser.png",
    S3_BASE_URL + "/4k/0225_2025_1월_형상변환57차_홍보이미지.png"
];

let currentBackgroundIndex = 0;
let nextBackgroundIndex = 1;
let isTransitioning = false;
let parallaxAnimation;

// Reward types configuration
const rewardTypes = {
    energy: { 
        name: "Energy", 
        icon: S3_BASE_URL + "/energy.png"
    },
    crystals: { 
        name: "Crystals", 
        icon: S3_BASE_URL + "/crystal.png"
    },
    mana: { 
        name: "Mana", 
        icon: S3_BASE_URL + "/mana.png"
    },
    mystical_scroll: { 
        name: "Mystical Scroll", 
        icon: S3_BASE_URL + "/scroll_mystical.png"
    },
    fire_scroll: { 
        name: "Fire Scroll", 
        icon: S3_BASE_URL + "/scroll_fire.png"
    },
    water_scroll: { 
        name: "Water Scroll", 
        icon: S3_BASE_URL + "/scroll_water.png"
    },
    wind_scroll: { 
        name: "Wind Scroll", 
        icon: S3_BASE_URL + "/scroll_wind.png"
    },
    ld_scroll: { 
        name: "LD Scroll", 
        icon: S3_BASE_URL + "/scroll_light_and_dark.png"
    },
    summoning_stones: { 
        name: "Summoning Stones", 
        icon: S3_BASE_URL + "/summon_exclusive.png"
    },
    runes: { 
        name: "Runes", 
        icon: S3_BASE_URL + "/rune.png"
    },
    swc_emblems: { 
        name: "SWC Emblems", 
        icon: S3_BASE_URL + "/swc2.png"
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

// API base URL - Worker endpoints
const API_BASE = '';

// Subtle parallax movement
function getSubtleParallaxPosition() {
    const x = Math.random() * 20 + 40;
    const y = Math.random() * 20 + 40;
    return { x, y };
}

// Start subtle parallax movement for current background
function startSubtleParallax() {
    if (parallaxAnimation) {
        clearInterval(parallaxAnimation);
    }
    
    parallaxAnimation = setInterval(() => {
        const { x, y } = getSubtleParallaxPosition();
        document.body.style.setProperty('--bg-x', x + '%');
        document.body.style.setProperty('--bg-y', y + '%');
    }, 8000);
}

// Initialize background rotation
function initializeBackgroundRotation() {
    document.body.style.setProperty('--bg-image', 'url("' + BACKGROUND_IMAGES[currentBackgroundIndex] + '")');
    document.body.style.setProperty('--bg-image-next', 'url("' + BACKGROUND_IMAGES[nextBackgroundIndex] + '")');
    document.body.style.setProperty('--bg-opacity', '0.2');
    document.body.style.setProperty('--bg-opacity-next', '0');
    document.body.style.setProperty('--bg-x', '50%');
    document.body.style.setProperty('--bg-y', '50%');
    
    startSubtleParallax();
    
    setInterval(() => {
        if (isTransitioning) return;
        transitionToNextBackground();
    }, 15000);
}

function transitionToNextBackground() {
    isTransitioning = true;
    const nextIndex = (currentBackgroundIndex + 1) % BACKGROUND_IMAGES.length;
    
    document.body.style.setProperty('--bg-image-next', 'url("' + BACKGROUND_IMAGES[nextIndex] + '")');
    document.body.style.setProperty('--bg-x-next', '50%');
    document.body.style.setProperty('--bg-y-next', '50%');
    document.body.style.setProperty('--bg-opacity', '0');
    document.body.style.setProperty('--bg-opacity-next', '0.2');
    
    setTimeout(() => {
        currentBackgroundIndex = nextIndex;
        nextBackgroundIndex = (nextIndex + 1) % BACKGROUND_IMAGES.length;
        
        document.body.style.transition = 'none';
        document.body.style.setProperty('--bg-image', 'url("' + BACKGROUND_IMAGES[currentBackgroundIndex] + '")');
        document.body.style.setProperty('--bg-x', '50%');
        document.body.style.setProperty('--bg-y', '50%');
        document.body.style.setProperty('--bg-opacity', '0.2');
        document.body.style.setProperty('--bg-opacity-next', '0');
        
        setTimeout(() => {
            document.body.style.transition = '';
            isTransitioning = false;
            setTimeout(() => {
                startSubtleParallax();
            }, 500);
        }, 50);
    }, 2000);
}

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeRewardGrid();
    loadCoupons();
    setupEventListeners();
    initializeBackgroundRotation();
});

function setupEventListeners() {
    addCouponBtn.addEventListener('click', openModal);
    closeModal.addEventListener('click', closeModalHandler);
    cancelBtn.addEventListener('click', closeModalHandler);
    addCouponForm.addEventListener('submit', handleCouponSubmission);
    
    window.addEventListener('click', function(event) {
        if (event.target === addCouponModal) {
            closeModalHandler();
        }
    });
}

function initializeRewardGrid() {
    rewardGrid.innerHTML = '';
    
    Object.entries(rewardTypes).forEach(([type, config]) => {
        const rewardItem = document.createElement('div');
        rewardItem.className = 'reward-item';
        rewardItem.innerHTML = '<img src="' + config.icon + '" alt="' + config.name + '" style="width: 40px; height: 40px; object-fit: contain;" /><label>' + config.name + '</label><input type="number" name="reward_' + type + '" min="0" value="0" />';
        rewardGrid.appendChild(rewardItem);
    });
}

async function loadCoupons() {
    try {
        showMessage('Loading coupons...', 'info');
        
        const response = await fetch(API_BASE + '/get-coupons');
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
        row.innerHTML = '<td><a href="http://withhive.me/313/' + coupon.code + '" target="_blank" class="coupon-code">' + coupon.code + '</a></td><td><span class="status-badge status-' + coupon.status + '">' + coupon.status + '</span></td><td>' + formatDate(coupon.addedOn) + '</td><td>' + formatRewards(coupon.rewards) + '</td><td><div class="vote-buttons"><button class="vote-btn ' + (userSession.votedCoupons[coupon.id] === 'up' ? 'voted' : '') + '" onclick="vote(\\''+coupon.id+'\\', \\'up\\')">👍 ' + coupon.votes.up + '</button><button class="vote-btn ' + (userSession.votedCoupons[coupon.id] === 'down' ? 'voted' : '') + '" onclick="vote(\\''+coupon.id+'\\', \\'down\\')">👎 ' + coupon.votes.down + '</button></div></td>';
        couponTableBody.appendChild(row);
    });
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function formatRewards(rewards) {
    return rewards.map(reward => {
        let config = rewardTypes[reward.type];
        
        if (!config && (reward.type === 'light_scroll' || reward.type === 'dark_scroll')) {
            config = rewardTypes.ld_scroll;
        }
        
        if (!config) {
            config = { name: reward.type, icon: S3_BASE_URL + '/crystal.png' };
        }
        
        return '<img src="' + config.icon + '" alt="' + config.name + '" style="width: 20px; height: 20px; vertical-align: middle; margin-right: 4px;" />x' + reward.amount + ' ' + config.name;
    }).join(', ');
}

async function vote(couponId, voteType) {
    const previousVote = userSession.votedCoupons[couponId];
    
    try {
        const response = await fetch(API_BASE + '/vote-coupon', {
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
            const couponIndex = coupons.findIndex(c => c.id === couponId);
            if (couponIndex !== -1) {
                coupons[couponIndex] = data.coupon;
            }
            
            if (previousVote === voteType) {
                delete userSession.votedCoupons[couponId];
                showMessage('Vote removed!', 'success');
            } else {
                userSession.votedCoupons[couponId] = voteType;
                const message = previousVote ? 'Vote changed!' : 'Vote recorded!';
                showMessage(message, 'success');
            }
            
            localStorage.setItem('votedCoupons', JSON.stringify(userSession.votedCoupons));
            renderCouponTable();
        } else {
            throw new Error(data.error || 'Failed to record vote');
        }
    } catch (error) {
        console.error('Error voting:', error);
        showMessage('Failed to record vote. Please try again.', 'error');
    }
}

function openModal() {
    addCouponModal.style.display = 'block';
}

function closeModalHandler() {
    addCouponModal.style.display = 'none';
    addCouponForm.reset();
}

async function handleCouponSubmission(event) {
    event.preventDefault();
    
    const formData = new FormData(addCouponForm);
    const couponCode = formData.get('couponCode').trim().toUpperCase();
    
    if (!validateSubmission(couponCode)) {
        return;
    }
    
    const rewards = [];
    Object.keys(rewardTypes).forEach(type => {
        const amount = parseInt(formData.get('reward_' + type)) || 0;
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
        
        const response = await fetch(API_BASE + '/add-coupon', {
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
            updateUserSession();
            await loadCoupons();
            closeModalHandler();
            showMessage('Coupon added successfully!', 'success');
        } else if (response.status === 409) {
            showMessage(data.error || 'This coupon code has already been submitted.', 'warning');
            closeModalHandler();
        } else if (response.status === 400) {
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

function validateSubmission(couponCode) {
    if (!couponCode) {
        showMessage('Please enter a coupon code!', 'error');
        return false;
    }
    return true;
}

function updateUserSession() {
    const today = new Date().toDateString();
    userSession.dailySubmissions[today] = (userSession.dailySubmissions[today] || 0) + 1;
    userSession.lastSubmission = new Date().toISOString();
    
    localStorage.setItem('dailySubmissions', JSON.stringify(userSession.dailySubmissions));
    localStorage.setItem('lastSubmission', userSession.lastSubmission);
}

function getUserHash() {
    let userHash = localStorage.getItem('userHash');
    if (!userHash) {
        userHash = 'user_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('userHash', userHash);
    }
    return userHash;
}

function hideMessage() {
    const messages = messageContainer.querySelectorAll('.message');
    messages.forEach(message => {
        if (message.textContent.includes('Loading')) {
            message.remove();
        }
    });
}

function showMessage(text, type = 'info') {
    if (type === 'info' && text.includes('Loading')) {
        hideMessage();
    }
    
    const message = document.createElement('div');
    message.className = 'message ' + type;
    message.textContent = text;
    
    messageContainer.appendChild(message);
    
    setTimeout(() => {
        message.classList.add('show');
    }, 100);
    
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
`, {
    headers: { 'Content-Type': 'application/javascript' }
  });
}
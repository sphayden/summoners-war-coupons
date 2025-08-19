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

// Import static files as text
import indexHtml from '../index.html';
import stylesCss from '../styles.css';
import scriptJs from '../script.js';

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
      return new Response(stylesCss, {
        headers: { 'Content-Type': 'text/css' }
      });
    } else if (path === '/script.js') {
      return new Response(scriptJs, {
        headers: { 'Content-Type': 'application/javascript' }
      });
    }
    
    return new Response('Not found', { status: 404 });
  },
};
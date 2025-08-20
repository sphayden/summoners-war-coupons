const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

// Configure AWS
AWS.config.update({
  region: process.env.CUSTOM_AWS_REGION || 'us-east-2',
  accessKeyId: process.env.CUSTOM_AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.CUSTOM_AWS_SECRET_ACCESS_KEY
});

const dynamodb = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'summoners-war-coupons';

// Function to get hive ID (you'll need to set this as environment variable)
function getHiveId() {
  return process.env.HIVE_ID || 'test_hive_id';
}

// Verify coupon with Summoners War API
async function validateCouponCode(couponCode) {
  try {
    const data = new URLSearchParams({
      'country': 'US',
      'lang': 'en', 
      'server': 'global',
      'hiveid': getHiveId(),
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
    // Validation response logged for debugging

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
}

exports.handler = async (event, context) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle OPTIONS request for CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { code, rewards, userHash } = body;

    // Validate input
    if (!code || !rewards || rewards.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Missing required fields: code and rewards'
        })
      };
    }

    // Input validation and sanitization
    if (typeof code !== 'string' || code.length > 50) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Invalid coupon code format'
        })
      };
    }

    if (!Array.isArray(rewards) || rewards.length > 20) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Invalid rewards format'
        })
      };
    }

    // Validate each reward
    for (const reward of rewards) {
      if (!reward.type || !reward.amount || typeof reward.amount !== 'number' || reward.amount <= 0 || reward.amount > 1000000) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'Invalid reward data'
          })
        };
      }
    }

    const couponCode = code.trim().toUpperCase();

    // Verify coupon with Summoners War API FIRST
    // (Don't waste API calls on duplicates we can catch atomically)
    const verification = await validateCouponCode(couponCode);

    // Reject invalid codes - don't store them
    if (!verification.isValid) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Invalid coupon code. Please double-check the spelling - this code may be expired, invalid, or region-specific.',
          verification: verification
        })
      };
    }

    // Create new coupon (only valid codes reach this point)
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

    // Save to DynamoDB with atomic duplicate check
    const putParams = {
      TableName: TABLE_NAME,
      Item: newCoupon,
      ConditionExpression: 'attribute_not_exists(code)' // Prevents race conditions
    };

    try {
      await dynamodb.put(putParams).promise();
    } catch (error) {
      // Handle race condition - another user added same code
      if (error.code === 'ConditionalCheckFailedException') {
        // Fetch the existing coupon to return it
        const getParams = {
          TableName: TABLE_NAME,
          FilterExpression: 'code = :code',
          ExpressionAttributeValues: {
            ':code': couponCode
          }
        };
        
        const existingResult = await dynamodb.scan(getParams).promise();
        
        return {
          statusCode: 409,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'This coupon code was just added by another user!',
            existingCoupon: existingResult.Items?.[0] || null
          })
        };
      }
      // Re-throw other errors
      throw error;
    }

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        success: true,
        coupon: newCoupon,
        verification: verification,
        message: 'Coupon added successfully and verified as valid!'
      })
    };

  } catch (error) {
    console.error('Error adding coupon:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Failed to add coupon'
      })
    };
  }
};
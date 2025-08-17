const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

// Configure AWS
console.log('AWS Config Debug:', {
  region: process.env.CUSTOM_AWS_REGION,
  accessKeyId: process.env.CUSTOM_AWS_ACCESS_KEY_ID,
  secretKeyLength: process.env.CUSTOM_AWS_SECRET_ACCESS_KEY?.length,
  secretKeyFirst10: process.env.CUSTOM_AWS_SECRET_ACCESS_KEY?.substring(0, 10),
  secretKeyLast10: process.env.CUSTOM_AWS_SECRET_ACCESS_KEY?.substring(-10)
});

AWS.config.update({
  region: 'us-east-2',
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
    console.log('Validation response:', responseData);

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

    const couponCode = code.trim().toUpperCase();

    // Verify coupon with Summoners War API first
    console.log(`Verifying coupon: ${couponCode}`);
    const verification = await validateCouponCode(couponCode);
    console.log(`Verification result:`, verification);

    // Check if coupon already exists
    const checkParams = {
      TableName: TABLE_NAME,
      FilterExpression: 'code = :code',
      ExpressionAttributeValues: {
        ':code': couponCode
      }
    };

    const existingCoupons = await dynamodb.scan(checkParams).promise();
    
    if (existingCoupons.Items && existingCoupons.Items.length > 0) {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Coupon already exists',
          existingCoupon: existingCoupons.Items[0]
        })
      };
    }

    // Create new coupon with verification result
    const now = new Date().toISOString();
    const newCoupon = {
      id: uuidv4(),
      code: couponCode,
      status: verification.isValid ? 'valid' : 'expired',
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

    // Save to DynamoDB
    const putParams = {
      TableName: TABLE_NAME,
      Item: newCoupon
    };

    await dynamodb.put(putParams).promise();

    const statusMessage = verification.isValid 
      ? `Coupon added successfully and verified as valid!`
      : `Coupon added but appears to be invalid or already redeemed. Please double-check the spelling or if it's already been submitted.`;

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        success: true,
        coupon: newCoupon,
        verification: verification,
        message: statusMessage
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
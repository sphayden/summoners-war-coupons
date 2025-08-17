const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

// Configure AWS
console.log('AWS Config:', {
  region: process.env.CUSTOM_AWS_REGION,
  accessKeyId: process.env.CUSTOM_AWS_ACCESS_KEY_ID ? 'SET' : 'MISSING',
  secretAccessKey: process.env.CUSTOM_AWS_SECRET_ACCESS_KEY ? 'SET' : 'MISSING'
});

AWS.config.update({
  region: process.env.CUSTOM_AWS_REGION || 'us-east-2',
  accessKeyId: process.env.CUSTOM_AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.CUSTOM_AWS_SECRET_ACCESS_KEY
});

const dynamodb = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'summoners-war-coupons';

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

    // Create new coupon
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
      submittedBy: userHash || 'anonymous'
    };

    // Save to DynamoDB
    const putParams = {
      TableName: TABLE_NAME,
      Item: newCoupon
    };

    await dynamodb.put(putParams).promise();

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        success: true,
        coupon: newCoupon,
        message: 'Coupon added successfully'
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
const AWS = require('aws-sdk');

// Configure AWS
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
    'Access-Control-Allow-Methods': 'PUT, OPTIONS',
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

  if (event.httpMethod !== 'PUT') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { couponId, voteType, userHash, previousVote } = body;

    // Validate input
    if (!couponId || !voteType || !['up', 'down'].includes(voteType)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Invalid couponId or voteType (must be "up" or "down")'
        })
      };
    }

    // Get current coupon
    const getParams = {
      TableName: TABLE_NAME,
      Key: { id: couponId }
    };

    const couponResult = await dynamodb.get(getParams).promise();
    
    if (!couponResult.Item) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Coupon not found'
        })
      };
    }

    const coupon = couponResult.Item;

    // Handle vote logic
    let updateExpression, expressionAttributeValues;
    
    if (previousVote === voteType) {
      // User is removing their vote - just decrement
      updateExpression = `SET votes.${voteType} = votes.${voteType} - :dec, lastUpdated = :now`;
      expressionAttributeValues = {
        ':dec': 1,
        ':now': new Date().toISOString()
      };
    } else if (previousVote) {
      // User is changing their vote - decrement previous and increment new
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
      // New vote - just increment
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

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        coupon: result.Attributes,
        message: 'Vote recorded successfully'
      })
    };

  } catch (error) {
    console.error('Error voting on coupon:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Failed to record vote'
      })
    };
  }
};
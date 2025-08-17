const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({
  region: process.env.AWS_REGION || 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const dynamodb = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'summoners-war-coupons';

exports.handler = async (event, context) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Scan the table to get all coupons
    const params = {
      TableName: TABLE_NAME
    };

    const result = await dynamodb.scan(params).promise();
    
    // Sort by addedOn date (newest first)
    const coupons = result.Items.sort((a, b) => 
      new Date(b.addedOn) - new Date(a.addedOn)
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        coupons: coupons
      })
    };

  } catch (error) {
    console.error('Error fetching coupons:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Failed to fetch coupons'
      })
    };
  }
};
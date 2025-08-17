const AWS = require('aws-sdk');

// Load environment variables
require('dotenv').config();

// Configure AWS
AWS.config.update({
  region: process.env.CUSTOM_AWS_REGION,
  accessKeyId: process.env.CUSTOM_AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.CUSTOM_AWS_SECRET_ACCESS_KEY
});

const dynamodb = new AWS.DynamoDB.DocumentClient();

// Test DynamoDB connection
async function testConnection() {
  try {
    console.log('Testing AWS credentials...');
    
    const params = {
      TableName: process.env.DYNAMODB_TABLE_NAME
    };

    const result = await dynamodb.scan(params).promise();
    console.log('✅ SUCCESS! Connection works');
    console.log('Items found:', result.Items.length);
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error('Code:', error.code);
  }
}

testConnection();
import AWS from 'aws-sdk';

const configureAWS = (env) => {
  AWS.config.update({
    region: env.CUSTOM_AWS_REGION || 'us-east-2',
    accessKeyId: env.CUSTOM_AWS_ACCESS_KEY_ID,
    secretAccessKey: env.CUSTOM_AWS_SECRET_ACCESS_KEY
  });
};

export default {
  async fetch(request, env) {
    configureAWS(env);
    const dynamodb = new AWS.DynamoDB.DocumentClient();
    const TABLE_NAME = env.DYNAMODB_TABLE_NAME || 'summoners-war-coupons';

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
  }
};
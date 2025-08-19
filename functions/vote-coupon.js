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
  }
};
# Summoners War Coupon Codes

A community-driven platform for sharing Summoners War mobile game coupon codes.

## Features

- View and search coupon codes
- Vote on coupon validity
- Add new coupon codes with rewards
- Rate limiting and spam protection
- Real-time updates via DynamoDB

## Setup for Netlify Deployment

### 1. DynamoDB Table Setup

Create a DynamoDB table with the following configuration:

- **Table name:** `summoners-war-coupons`
- **Partition key:** `id` (String)
- **Billing mode:** On-demand (recommended for variable traffic)

### 2. AWS IAM Permissions

Create an IAM user with the following policy for DynamoDB access:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "dynamodb:GetItem",
                "dynamodb:PutItem",
                "dynamodb:UpdateItem",
                "dynamodb:Scan",
                "dynamodb:Query"
            ],
            "Resource": "arn:aws:dynamodb:*:*:table/summoners-war-coupons"
        }
    ]
}
```

### 3. Netlify Environment Variables

Set these environment variables in your Netlify dashboard:

- `AWS_REGION` - Your AWS region (e.g., us-east-1)
- `AWS_ACCESS_KEY_ID` - Your AWS access key
- `AWS_SECRET_ACCESS_KEY` - Your AWS secret key
- `DYNAMODB_TABLE_NAME` - Your DynamoDB table name

### 4. Deploy to Netlify

1. Push your code to GitHub/GitLab
2. Connect your repository to Netlify
3. Set the environment variables
4. Deploy!

## Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Fill in your AWS credentials in `.env`

4. Start the dev server:
   ```bash
   npm run dev
   ```

## API Endpoints

- `GET /.netlify/functions/get-coupons` - Get all coupons
- `POST /.netlify/functions/add-coupon` - Add new coupon
- `PUT /.netlify/functions/vote-coupon` - Vote on coupon

## Data Structure

Each coupon in DynamoDB has the following structure:

```json
{
  "id": "unique-id",
  "code": "COUPON_CODE",
  "status": "valid|expired|verified",
  "addedOn": "2024-01-15T10:00:00Z",
  "lastUpdated": "2024-01-15T10:00:00Z",
  "rewards": [
    {"type": "energy", "amount": 50},
    {"type": "crystals", "amount": 100}
  ],
  "votes": {
    "up": 15,
    "down": 2
  },
  "submittedBy": "user_hash"
}
```
import json
import boto3
from bs4 import BeautifulSoup
import urllib3
import time
from datetime import datetime
import os

http = urllib3.PoolManager()

def is_inactive(code: str) -> bool:
    """
    Check if a coupon code is inactive by looking for the expired indicator
    Returns True if code is expired/inactive
    """
    try:
        formatted_link = f'http://withhive.me/313/{code}'
        headers_mobile = { 
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 9_1 like Mac OS X) AppleWebKit/601.1.46 (KHTML, like Gecko) Version/9.0 Mobile/13B137 Safari/601.1'
        }
        
        response = http.request('GET', formatted_link, headers=headers_mobile)
        soup = BeautifulSoup(response.data, 'html.parser')
        
        if soup.find_all("h1", {"class": "pop_tit"}):
            print(f'Expired Code: {formatted_link}')
            return True
        else:
            print(f'Active Code: {formatted_link}')
            return False
            
    except Exception as e:
        print(f"Error checking code {code}: {e}")
        return False

def lambda_handler(event, context):
    """
    AWS Lambda function to check and expire invalid coupon codes in DynamoDB
    """
    
    try:
        # Check for dry run mode
        dry_run = os.environ.get('DRY_RUN', 'false').lower() == 'true'
        
        if dry_run:
            print("*** RUNNING IN DRY RUN MODE - NO DATABASE CHANGES WILL BE MADE ***")
        
        # Initialize DynamoDB client
        dynamodb = boto3.resource('dynamodb', region_name='us-east-2')
        table_name = os.environ.get('DYNAMODB_TABLE_NAME', 'summoners-war-coupons')
        table = dynamodb.Table(table_name)
        
        # Scan for all valid coupons
        response = table.scan(
            FilterExpression=boto3.dynamodb.conditions.Attr('status').eq('valid')
        )
        
        valid_coupons = response['Items']
        expired_count = 0
        expired_coupons = []
        
        print(f"Found {len(valid_coupons)} valid coupons to check")
        
        # Check each valid coupon
        for coupon in valid_coupons:
            try:
                print(f"Checking coupon: {coupon['code']}")
                
                # Check if coupon is inactive using your validation method
                if is_inactive(coupon['code']):
                    expired_count += 1
                    expired_coupons.append({
                        'id': coupon['id'],
                        'code': coupon['code'],
                        'reason': 'Code expired - found pop_tit element'
                    })
                    
                    if dry_run:
                        print(f"DRY RUN: Would expire coupon: {coupon['code']}")
                    else:
                        # Update coupon status to expired
                        current_time = datetime.utcnow().isoformat()
                        
                        table.update_item(
                            Key={'id': coupon['id']},
                            UpdateExpression='SET #status = :expired_status, lastUpdated = :timestamp, expiredOn = :timestamp',
                            ExpressionAttributeNames={
                                '#status': 'status'
                            },
                            ExpressionAttributeValues={
                                ':expired_status': 'expired',
                                ':timestamp': current_time
                            }
                        )
                        print(f"Expired coupon: {coupon['code']}")
                else:
                    print(f"Still valid: {coupon['code']}")
                    
            except Exception as e:
                print(f"Error processing coupon {coupon['code']}: {str(e)}")
                continue
            
            # Add delay to avoid overwhelming the API
            time.sleep(1)
        
        action_taken = "would expire" if dry_run else "expired"
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'success': True,
                'dryRun': dry_run,
                'message': f'Processed {len(valid_coupons)} coupons, {action_taken} {expired_count} coupons',
                'totalProcessed': len(valid_coupons),
                'expiredCount': expired_count,
                'expiredCoupons': expired_coupons
            })
        }
        
    except Exception as e:
        print(f"Error in expire_coupons function: {str(e)}")
        
        return {
            'statusCode': 500,
            'body': json.dumps({
                'success': False,
                'error': 'Failed to process coupon expiration',
                'details': str(e)
            })
        }
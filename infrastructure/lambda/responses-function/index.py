import json
import boto3
import base64
import uuid
from datetime import datetime, timedelta
from urllib.parse import unquote

# Initialize AWS clients
s3_client = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')

# Configuration
RESPONSES_BUCKET = 'dmgt-basic-form-responses-dev-530545734605'
REGION = 'eu-west-2'

def lambda_handler(event, context):
    """
    Enhanced Lambda handler for DMGT Basic Form
    Handles both form responses AND file uploads
    """
    
    print(f"Event: {json.dumps(event)}")
    
    # CORS headers
    cors_headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'OPTIONS,POST,GET'
    }
    
    try:
        # Handle preflight OPTIONS requests
        if event.get('httpMethod') == 'OPTIONS':
            return {
                'statusCode': 200,
                'headers': cors_headers,
                'body': json.dumps({'message': 'CORS preflight'})
            }
        
        # Parse request body
        body = event.get('body', '{}')
        if isinstance(body, str):
            try:
                body = json.loads(body)
            except json.JSONDecodeError:
                body = {}
        
        # Route based on action or existing functionality
        action = body.get('action')
        
        if action == 'getPresignedUrl':
            return handle_presigned_url_request(body, cors_headers)
        elif action == 'uploadFile':
            return handle_file_upload_request(body, cors_headers)
        elif action == 'getCompany':
            return handle_get_company_request(body, cors_headers)
        elif action == 'getEmployee': 
            return handle_get_employee_request(body, cors_headers)
        else:
            # Default: Handle form response submission
            return handle_form_response(event, body, cors_headers)
            
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': cors_headers,
            'body': json.dumps({'error': str(e)})
        }

def handle_presigned_url_request(body, cors_headers):
    """Generate presigned URL for direct S3 upload"""
    try:
        file_name = body.get('fileName')
        content_type = body.get('contentType') 
        s3_key = body.get('s3Key')
        bucket = body.get('bucket', RESPONSES_BUCKET)
        method = body.get('method', 'PUT')
        expires = body.get('expires', 300)
        
        if not all([file_name, content_type, s3_key]):
            raise ValueError("Missing required parameters: fileName, contentType, s3Key")
        
        # Generate presigned URL
        presigned_url = s3_client.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': bucket,
                'Key': s3_key,
                'ContentType': content_type
            },
            ExpiresIn=expires
        )
        
        return {
            'statusCode': 200,
            'headers': cors_headers,
            'body': json.dumps({
                'presignedUrl': presigned_url,
                's3Key': s3_key,
                'bucket': bucket,
                'expires': expires
            })
        }
        
    except Exception as e:
        print(f"Presigned URL error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': cors_headers,
            'body': json.dumps({'error': f'Failed to generate presigned URL: {str(e)}'})
        }

def handle_file_upload_request(body, cors_headers):
    """Handle direct file upload via Lambda (fallback method)"""
    try:
        file_data = body.get('fileData')  # base64 encoded
        file_name = body.get('fileName')
        content_type = body.get('contentType')
        s3_key = body.get('s3Key')
        bucket = body.get('bucket', RESPONSES_BUCKET)
        company_id = body.get('companyId')
        employee_id = body.get('employeeId')
        question_id = body.get('questionId')
        metadata = body.get('metadata', {})
        
        if not all([file_data, file_name, s3_key]):
            raise ValueError("Missing required parameters: fileData, fileName, s3Key")
        
        # Decode base64 file data
        file_bytes = base64.b64decode(file_data)
        
        # Upload to S3
        s3_client.put_object(
            Bucket=bucket,
            Key=s3_key,
            Body=file_bytes,
            ContentType=content_type,
            Metadata={
                'original-filename': file_name,
                'company-id': str(company_id) if company_id else '',
                'employee-id': str(employee_id) if employee_id else '',
                'question-id': str(question_id) if question_id else '',
                'upload-timestamp': datetime.utcnow().isoformat(),
                'upload-method': 'lambda-fallback'
            }
        )
        
        # Generate unique file ID
        file_id = f"file_{uuid.uuid4().hex[:12]}"
        
        print(f"File uploaded successfully: {s3_key}")
        
        return {
            'statusCode': 200,
            'headers': cors_headers,
            'body': json.dumps({
                'success': True,
                'fileId': file_id,
                's3Key': s3_key,
                'bucket': bucket,
                'uploadMethod': 'lambda',
                'fileName': file_name,
                'uploadedAt': datetime.utcnow().isoformat()
            })
        }
        
    except Exception as e:
        print(f"File upload error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': cors_headers,
            'body': json.dumps({'error': f'File upload failed: {str(e)}'})
        }

def handle_get_company_request(body, cors_headers):
    """Retrieve company responses"""
    try:
        company_id = body.get('companyId')
        if not company_id:
            raise ValueError("Missing companyId")
            
        # Try to get company responses from S3
        response_key = f"company-responses/{company_id}.json"
        
        try:
            response = s3_client.get_object(Bucket=RESPONSES_BUCKET, Key=response_key)
            content = response['Body'].read().decode('utf-8')
            company_data = json.loads(content)
            
            return {
                'statusCode': 200,
                'headers': cors_headers,
                'body': json.dumps({
                    'found': True,
                    'responses': company_data.get('responses', {}),
                    'lastModified': company_data.get('lastModified'),
                    'completionPercentage': company_data.get('completionPercentage', 0)
                })
            }
            
        except s3_client.exceptions.NoSuchKey:
            return {
                'statusCode': 200,
                'headers': cors_headers,
                'body': json.dumps({
                    'found': False,
                    'responses': {},
                    'message': 'No existing company responses found'
                })
            }
            
    except Exception as e:
        print(f"Get company error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': cors_headers,
            'body': json.dumps({'error': str(e)})
        }

def handle_get_employee_request(body, cors_headers):
    """Retrieve employee responses"""
    try:
        company_id = body.get('companyId')
        employee_id = body.get('employeeId')
        
        if not all([company_id, employee_id]):
            raise ValueError("Missing companyId or employeeId")
            
        # Try to get employee responses from S3
        response_key = f"employee-responses/{company_id}/{employee_id}.json"
        
        try:
            response = s3_client.get_object(Bucket=RESPONSES_BUCKET, Key=response_key)
            content = response['Body'].read().decode('utf-8')
            employee_data = json.loads(content)
            
            return {
                'statusCode': 200,
                'headers': cors_headers,
                'body': json.dumps({
                    'found': True,
                    'responses': employee_data.get('responses', {}),
                    'employeeData': employee_data,
                    'lastModified': employee_data.get('lastModified')
                })
            }
            
        except s3_client.exceptions.NoSuchKey:
            return {
                'statusCode': 200,
                'headers': cors_headers,
                'body': json.dumps({
                    'found': False,
                    'responses': {},
                    'message': 'No existing employee responses found'
                })
            }
            
    except Exception as e:
        print(f"Get employee error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': cors_headers,
            'body': json.dumps({'error': str(e)})
        }

def handle_form_response(event, body, cors_headers):
    """Handle form response submission (existing functionality)"""
    try:
        # Extract required fields
        company_id = body.get('companyId')
        form_type = body.get('formType')
        responses = body.get('responses', {})
        
        if not all([company_id, form_type]):
            raise ValueError("Missing required fields: companyId, formType")
        
        # Handle employee ID assignment for new employees
        employee_id = body.get('employeeId')
        is_new_employee = body.get('isNewEmployee', False)
        
        if form_type == 'employee' and is_new_employee and employee_id is None:
            # Assign new employee ID
            employee_id = get_next_employee_id(company_id)
            print(f"Assigned new employee ID: {employee_id}")
        
        # Save response data
        response_data = {
            'companyId': company_id,
            'formType': form_type,
            'responses': responses,
            'lastModified': datetime.utcnow().isoformat(),
            'employeeId': employee_id if form_type == 'employee' else None
        }
        
        # Calculate completion percentage
        total_questions = len(responses) if responses else 0
        answered_questions = len([r for r in responses.values() if r and str(r).strip()]) if responses else 0
        completion_percentage = (answered_questions / total_questions * 100) if total_questions > 0 else 0
        response_data['completionPercentage'] = completion_percentage
        
        # Determine if completed
        complete_audit = body.get('completeAudit', False)
        force_complete = body.get('forceComplete', False)
        prevent_auto_complete = body.get('preventAutoComplete', False)
        
        if complete_audit or force_complete or (completion_percentage == 100 and not prevent_auto_complete):
            response_data['completed'] = True
            response_data['completedAt'] = datetime.utcnow().isoformat()
        
        # Save to S3
        if form_type == 'company':
            s3_key = f"company-responses/{company_id}.json"
        else:
            s3_key = f"employee-responses/{company_id}/{employee_id}.json"
        
        s3_client.put_object(
            Bucket=RESPONSES_BUCKET,
            Key=s3_key,
            Body=json.dumps(response_data, indent=2),
            ContentType='application/json'
        )
        
        # Return response
        result = {
            'success': True,
            'companyId': company_id,
            'formType': form_type,
            'completionPercentage': completion_percentage,
            'lastModified': response_data['lastModified']
        }
        
        if form_type == 'employee':
            result['employeeId'] = employee_id
        
        return {
            'statusCode': 200,
            'headers': cors_headers,
            'body': json.dumps(result)
        }
        
    except Exception as e:
        print(f"Form response error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': cors_headers,
            'body': json.dumps({'error': str(e)})
        }

def get_next_employee_id(company_id):
    """Get the next available employee ID for a company"""
    try:
        # List existing employee responses to find the highest ID
        response = s3_client.list_objects_v2(
            Bucket=RESPONSES_BUCKET,
            Prefix=f"employee-responses/{company_id}/"
        )
        
        max_id = -1
        if 'Contents' in response:
            for obj in response['Contents']:
                key = obj['Key']
                # Extract employee ID from key pattern: employee-responses/{company_id}/{employee_id}.json
                try:
                    filename = key.split('/')[-1]  # Get filename
                    employee_id_str = filename.replace('.json', '')  # Remove .json
                    employee_id = int(employee_id_str)
                    max_id = max(max_id, employee_id)
                except (ValueError, IndexError):
                    continue
        
        return max_id + 1
        
    except Exception as e:
        print(f"Error getting next employee ID: {str(e)}")
        # Fallback to timestamp-based ID
        return int(datetime.utcnow().timestamp()) % 10000

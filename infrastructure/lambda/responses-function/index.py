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
    Handles both form responses AND file uploads with proper error handling
    """
    
    print(f"Event: {json.dumps(event)}")
    
    # Enhanced CORS headers to handle all origins and methods
    cors_headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE,PATCH',
        'Access-Control-Max-Age': '86400'
    }
    
    try:
        # Handle preflight OPTIONS requests
        if event.get('httpMethod') == 'OPTIONS':
            return {
                'statusCode': 200,
                'headers': cors_headers,
                'body': json.dumps({'message': 'CORS preflight successful'})
            }
        
        # Extract path and method
        http_method = event.get('httpMethod', 'GET')
        resource_path = event.get('resource', '')
        path_parameters = event.get('pathParameters') or {}
        query_parameters = event.get('queryStringParameters') or {}
        
        print(f"HTTP Method: {http_method}, Resource Path: {resource_path}")
        print(f"Path Parameters: {path_parameters}")
        print(f"Query Parameters: {query_parameters}")
        
        # Route based on the path and method
        if http_method == 'GET':
            # Handle GET requests based on path
            if '/responses/company-status/' in resource_path:
                company_id = path_parameters.get('companyId')
                return handle_company_status_check(company_id, cors_headers)
            elif '/responses/employee-list/' in resource_path:
                company_id = path_parameters.get('companyId')
                return handle_employee_list(company_id, cors_headers)
            elif '/responses/employee-data/' in resource_path:
                company_id = path_parameters.get('companyId')
                employee_id = path_parameters.get('employeeId')
                return handle_get_employee_data(company_id, employee_id, cors_headers)
            else:
                return handle_get_request(event, cors_headers)
        
        elif http_method == 'POST':
            # Parse request body for POST requests
            body = event.get('body', '{}')
            if isinstance(body, str):
                try:
                    body = json.loads(body)
                except json.JSONDecodeError:
                    body = {}
            
            # Route POST requests based on path
            if '/responses/save-company' in resource_path:
                return handle_save_company(body, cors_headers)
            elif '/responses/save-employee' in resource_path:
                return handle_save_employee(body, cors_headers)
            else:
                # Handle legacy API calls based on action
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
        
        # Default response for unmatched routes
        return {
            'statusCode': 404,
            'headers': cors_headers,
            'body': json.dumps({
                'error': 'Route not found',
                'method': http_method,
                'path': resource_path
            })
        }
            
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': cors_headers,
            'body': json.dumps({'error': str(e)})
        }

def handle_company_status_check(company_id, cors_headers):
    """Handle company status check requests"""
    try:
        if not company_id:
            return {
                'statusCode': 400,
                'headers': cors_headers,
                'body': json.dumps({'error': 'Missing companyId parameter'})
            }
        
        # Get company status
        company_status = get_company_status(company_id)
        
        # Determine status text
        if company_status['companyCompleted']:
            status = 'completed'
        elif company_status['companyInProgress']:
            status = 'in-progress'
        else:
            status = 'not-started'
        
        return {
            'statusCode': 200,
            'headers': cors_headers,
            'body': json.dumps({
                'status': status,
                **company_status
            })
        }
        
    except Exception as e:
        print(f"Company status check error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': cors_headers,
            'body': json.dumps({'error': str(e)})
        }

def handle_employee_list(company_id, cors_headers):
    """Handle employee list requests"""
    try:
        if not company_id:
            return {
                'statusCode': 400,
                'headers': cors_headers,
                'body': json.dumps({'error': 'Missing companyId parameter'})
            }
        
        # Get employee list
        employees = []
        try:
            response = s3_client.list_objects_v2(
                Bucket=RESPONSES_BUCKET,
                Prefix=f"employee-responses/{company_id}/"
            )
            
            if 'Contents' in response:
                for obj in response['Contents']:
                    key = obj['Key']
                    try:
                        # Get employee data
                        employee_response = s3_client.get_object(Bucket=RESPONSES_BUCKET, Key=key)
                        employee_data = json.loads(employee_response['Body'].read().decode('utf-8'))
                        
                        filename = key.split('/')[-1]
                        employee_id = filename.replace('.json', '')
                        
                        employees.append({
                            'id': employee_id,
                            'name': f"{employee_data.get('responses', {}).get('section1', {}).get('firstName', '')} {employee_data.get('responses', {}).get('section1', {}).get('lastName', '')}".strip(),
                            'completed': employee_data.get('completed', False),
                            'lastSaved': employee_data.get('lastModified'),
                            'position': employee_data.get('responses', {}).get('section1', {}).get('position', ''),
                            'department': employee_data.get('responses', {}).get('section1', {}).get('department', '')
                        })
                    except Exception as e:
                        print(f"Error processing employee {key}: {str(e)}")
                        continue
        
        except Exception as e:
            print(f"Error listing employees: {str(e)}")
        
        return {
            'statusCode': 200,
            'headers': cors_headers,
            'body': json.dumps({
                'employees': employees
            })
        }
        
    except Exception as e:
        print(f"Employee list error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': cors_headers,
            'body': json.dumps({'error': str(e)})
        }

def handle_get_employee_data(company_id, employee_id, cors_headers):
    """Handle getting specific employee data"""
    try:
        if not all([company_id, employee_id]):
            return {
                'statusCode': 400,
                'headers': cors_headers,
                'body': json.dumps({'error': 'Missing companyId or employeeId'})
            }
        
        # Try to get employee data
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
                    'formData': employee_data.get('responses', {}),
                    'currentSection': employee_data.get('currentSection', 1),
                    'lastModified': employee_data.get('lastModified')
                })
            }
            
        except s3_client.exceptions.NoSuchKey:
            return {
                'statusCode': 200,
                'headers': cors_headers,
                'body': json.dumps({
                    'found': False,
                    'message': 'Employee data not found'
                })
            }
            
    except Exception as e:
        print(f"Get employee data error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': cors_headers,
            'body': json.dumps({'error': str(e)})
        }

def handle_save_company(body, cors_headers):
    """Handle saving company form data"""
    try:
        company_id = body.get('companyId')
        form_data = body.get('formData', {})
        section = body.get('section', 1)
        
        if not company_id:
            return {
                'statusCode': 400,
                'headers': cors_headers,
                'body': json.dumps({'error': 'Missing companyId'})
            }
        
        # Create response data structure
        response_data = {
            'companyId': company_id,
            'formType': 'company',
            'responses': form_data,
            'currentSection': section,
            'lastModified': datetime.utcnow().isoformat(),
            'completed': form_data.get('isCompleted', False)
        }
        
        if response_data['completed']:
            response_data['completedAt'] = datetime.utcnow().isoformat()
        
        # Save to S3
        s3_key = f"company-responses/{company_id}.json"
        s3_client.put_object(
            Bucket=RESPONSES_BUCKET,
            Key=s3_key,
            Body=json.dumps(response_data, indent=2),
            ContentType='application/json'
        )
        
        return {
            'statusCode': 200,
            'headers': cors_headers,
            'body': json.dumps({
                'success': True,
                'companyId': company_id,
                'section': section,
                'completed': response_data['completed'],
                'lastModified': response_data['lastModified']
            })
        }
        
    except Exception as e:
        print(f"Save company error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': cors_headers,
            'body': json.dumps({'error': str(e)})
        }

def handle_save_employee(body, cors_headers):
    """Handle saving employee form data"""
    try:
        company_id = body.get('companyId')
        employee_id = body.get('employeeId')
        form_data = body.get('formData', {})
        section = body.get('section', 1)
        
        if not all([company_id, employee_id]):
            return {
                'statusCode': 400,
                'headers': cors_headers,
                'body': json.dumps({'error': 'Missing companyId or employeeId'})
            }
        
        # Create response data structure
        response_data = {
            'companyId': company_id,
            'employeeId': employee_id,
            'formType': 'employee',
            'responses': form_data,
            'currentSection': section,
            'lastModified': datetime.utcnow().isoformat(),
            'completed': form_data.get('isCompleted', False)
        }
        
        if response_data['completed']:
            response_data['completedAt'] = datetime.utcnow().isoformat()
        
        # Save to S3
        s3_key = f"employee-responses/{company_id}/{employee_id}.json"
        s3_client.put_object(
            Bucket=RESPONSES_BUCKET,
            Key=s3_key,
            Body=json.dumps(response_data, indent=2),
            ContentType='application/json'
        )
        
        return {
            'statusCode': 200,
            'headers': cors_headers,
            'body': json.dumps({
                'success': True,
                'companyId': company_id,
                'employeeId': employee_id,
                'section': section,
                'completed': response_data['completed'],
                'lastModified': response_data['lastModified']
            })
        }
        
    except Exception as e:
        print(f"Save employee error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': cors_headers,
            'body': json.dumps({'error': str(e)})
        }

def handle_get_request(event, cors_headers):
    """Handle GET requests for company status"""
    try:
        query_params = event.get('queryStringParameters') or {}
        company_id = query_params.get('companyId')
        
        if not company_id:
            return {
                'statusCode': 400,
                'headers': cors_headers,
                'body': json.dumps({'error': 'Missing companyId parameter'})
            }
        
        # Get company status
        company_status = get_company_status(company_id)
        
        return {
            'statusCode': 200,
            'headers': cors_headers,
            'body': json.dumps(company_status)
        }
        
    except Exception as e:
        print(f"GET request error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': cors_headers,
            'body': json.dumps({'error': str(e)})
        }

def get_company_status(company_id):
    """Get comprehensive company status including completion and employee info"""
    try:
        # Check for company responses
        company_key = f"company-responses/{company_id}.json"
        company_completed = False
        company_in_progress = False
        company_completion_percentage = 0
        company_last_modified = None
        
        try:
            response = s3_client.get_object(Bucket=RESPONSES_BUCKET, Key=company_key)
            content = response['Body'].read().decode('utf-8')
            company_data = json.loads(content)
            
            company_completion_percentage = company_data.get('completionPercentage', 0)
            company_completed = company_data.get('completed', False)
            company_in_progress = company_completion_percentage > 0 and not company_completed
            company_last_modified = company_data.get('lastModified')
            
        except s3_client.exceptions.NoSuchKey:
            pass
        
        # Check for employee responses
        employee_ids = []
        employee_count = 0
        
        try:
            response = s3_client.list_objects_v2(
                Bucket=RESPONSES_BUCKET,
                Prefix=f"employee-responses/{company_id}/"
            )
            
            if 'Contents' in response:
                for obj in response['Contents']:
                    key = obj['Key']
                    try:
                        filename = key.split('/')[-1]
                        employee_id_str = filename.replace('.json', '')
                        employee_ids.append(employee_id_str)
                    except (ValueError, IndexError):
                        continue
                
                employee_count = len(employee_ids)
                employee_ids.sort()
        
        except Exception as e:
            print(f"Error listing employee responses: {str(e)}")
        
        return {
            'companyCompleted': company_completed,
            'companyInProgress': company_in_progress,
            'completionPercentage': company_completion_percentage,
            'lastModified': company_last_modified,
            'employeeCount': employee_count,
            'employeeIds': employee_ids
        }
        
    except Exception as e:
        print(f"Error getting company status: {str(e)}")
        return {
            'companyCompleted': False,
            'companyInProgress': False,
            'completionPercentage': 0,
            'lastModified': None,
            'employeeCount': 0,
            'employeeIds': []
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
        
        # Upload to S3 with proper folder structure
        s3_client.put_object(
            Bucket=bucket,
            Key=s3_key,
            Body=file_bytes,
            ContentType=content_type or 'application/octet-stream',
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
                    'completionPercentage': company_data.get('completionPercentage', 0),
                    'completed': company_data.get('completed', False)
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
        
        # Save to S3 with proper folder structure
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
        
        max_id = 0
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

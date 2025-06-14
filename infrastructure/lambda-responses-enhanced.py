import json
import boto3
import os
import uuid
from datetime import datetime
from botocore.exceptions import ClientError

s3 = boto3.client('s3')

def lambda_handler(event, context):
    try:
        http_method = event['httpMethod']
        query_params = event.get('queryStringParameters') or {}
        
        print(f"[v4.0] {http_method} request with params: {query_params}")
        
        # Handle CORS preflight request
        if http_method == 'OPTIONS':
            return cors_response(200, {})
        
        if http_method == 'POST':
            return save_response(event)
        elif http_method == 'GET':
            action = query_params.get('action')
            if action == 'getEmployee':
                return get_employee_data(event)
            elif action == 'getCompany':
                return get_company_data(event)
            else:
                return get_company_status(event)
        
        return cors_response(405, {'error': 'Method not allowed'})
    except Exception as e:
        print(f"[v4.0] Error: {str(e)}")
        return cors_response(500, {'error': str(e)})

def cors_response(status_code, body):
    return {
        'statusCode': status_code,
        'headers': {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
            'Content-Type': 'application/json'
        },
        'body': json.dumps(body)
    }

def save_response(event):
    """Enhanced save response with proper company logic and file handling"""
    body = json.loads(event['body'])
    company_id = body['companyId']
    form_type = body['formType']
    responses = body['responses']
    employee_id = body.get('employeeId')
    is_new_employee = body.get('isNewEmployee', False)
    file_metadata = body.get('fileMetadata')
    
    responses_bucket = os.environ['RESPONSES_BUCKET']
    timestamp = datetime.utcnow().isoformat()
    
    print(f"[v4.0] Saving {form_type} response for company {company_id}")
    
    try:
        if form_type == 'company':
            # FIXED: Allow company questionnaire modifications - only one per company
            filename = f'{company_id}/company.json'
            
            # Check if existing company data exists
            existing_data = None
            try:
                response = s3.get_object(Bucket=responses_bucket, Key=filename)
                existing_data = json.loads(response['Body'].read().decode('utf-8'))
                print(f"[v4.0] Found existing company data, updating...")
            except ClientError as e:
                if e.response['Error']['Code'] != 'NoSuchKey':
                    raise e
                print(f"[v4.0] No existing company data, creating new...")
            
            # Calculate completion percentage
            total_responses = len(responses)
            answered_responses = len([r for r in responses.values() if r and str(r).strip()])
            completion_percentage = int((answered_responses / total_responses * 100)) if total_responses > 0 else 0
            
            # Prepare company data
            company_data = {
                'companyId': company_id,
                'formType': form_type,
                'timestamp': existing_data.get('timestamp', timestamp) if existing_data else timestamp,
                'lastModified': timestamp,
                'responses': responses,
                'completionPercentage': completion_percentage,
                'inProgress': completion_percentage > 0 and completion_percentage < 100,
                'explicitlyCompleted': False  # Only true when user explicitly submits
            }
            
            # Handle file metadata
            if file_metadata:
                if 'fileUploads' not in company_data:
                    company_data['fileUploads'] = {}
                company_data['fileUploads'][file_metadata['questionId']] = file_metadata
                
            # Save company data
            s3.put_object(
                Bucket=responses_bucket,
                Key=filename,
                Body=json.dumps(company_data, indent=2),
                ContentType='application/json'
            )
            
            return cors_response(200, {
                'message': 'Company response saved successfully',
                'filename': filename,
                'completionPercentage': completion_percentage,
                'inProgress': company_data['inProgress'],
                'explicitlyCompleted': company_data['explicitlyCompleted']
            })
            
        else:  # Employee form
            # Handle employee ID assignment
            final_employee_id = employee_id
            if is_new_employee and employee_id is None:
                final_employee_id = get_next_employee_id(company_id)
                print(f"[v4.0] Assigned new employee ID: {final_employee_id}")
            
            filename = f'{company_id}/employee_{final_employee_id}.json'
            
            # Get existing employee data if any
            existing_employee_data = None
            try:
                response = s3.get_object(Bucket=responses_bucket, Key=filename)
                existing_employee_data = json.loads(response['Body'].read().decode('utf-8'))
                print(f"[v4.0] Found existing employee data for ID {final_employee_id}")
            except ClientError as e:
                if e.response['Error']['Code'] != 'NoSuchKey':
                    raise e
                print(f"[v4.0] Creating new employee record for ID {final_employee_id}")
            
            # Prepare employee data
            employee_data = {
                'companyId': company_id,
                'employeeId': final_employee_id,
                'formType': form_type,
                'timestamp': existing_employee_data.get('timestamp', timestamp) if existing_employee_data else timestamp,
                'lastModified': timestamp,
                'responses': responses
            }
            
            # Handle file metadata for employees
            if file_metadata:
                if 'fileUploads' not in employee_data:
                    employee_data['fileUploads'] = {}
                employee_data['fileUploads'][file_metadata['questionId']] = file_metadata
            
            # Save employee data
            s3.put_object(
                Bucket=responses_bucket,
                Key=filename,
                Body=json.dumps(employee_data, indent=2),
                ContentType='application/json'
            )
            
            return cors_response(200, {
                'message': 'Employee response saved successfully',
                'filename': filename,
                'employeeId': final_employee_id
            })
            
    except Exception as e:
        print(f"[v4.0] Error saving response: {str(e)}")
        return cors_response(500, {'error': f'Failed to save response: {str(e)}'})

def get_employee_data(event):
    """Get existing employee data for returning employees"""
    query_params = event.get('queryStringParameters') or {}
    company_id = query_params.get('companyId')
    employee_id = query_params.get('employeeId')
    
    if not company_id or employee_id is None:
        return cors_response(400, {'error': 'companyId and employeeId required'})
    
    responses_bucket = os.environ['RESPONSES_BUCKET']
    filename = f'{company_id}/employee_{employee_id}.json'
    
    try:
        response = s3.get_object(Bucket=responses_bucket, Key=filename)
        employee_data = json.loads(response['Body'].read().decode('utf-8'))
        
        print(f"[v4.0] Retrieved employee {employee_id} data for company {company_id}")
        
        return cors_response(200, {
            'found': True,
            'employeeData': employee_data,
            'responses': employee_data.get('responses', {}),
            'lastModified': employee_data.get('lastModified'),
            'employeeId': employee_id
        })
    except ClientError as e:
        if e.response['Error']['Code'] == 'NoSuchKey':
            return cors_response(200, {
                'found': False,
                'message': f'No employee found with ID {employee_id} for company {company_id}'
            })
        else:
            raise e

def get_company_data(event):
    """Get existing company data for loading"""
    query_params = event.get('queryStringParameters') or {}
    company_id = query_params.get('companyId')
    
    if not company_id:
        return cors_response(400, {'error': 'companyId required'})
    
    responses_bucket = os.environ['RESPONSES_BUCKET']
    filename = f'{company_id}/company.json'
    
    try:
        response = s3.get_object(Bucket=responses_bucket, Key=filename)
        company_data = json.loads(response['Body'].read().decode('utf-8'))
        
        print(f"[v4.0] Retrieved company data for company {company_id}")
        
        return cors_response(200, {
            'found': True,
            'companyData': company_data,
            'responses': company_data.get('responses', {}),
            'lastModified': company_data.get('lastModified'),
            'completionPercentage': company_data.get('completionPercentage', 0),
            'inProgress': company_data.get('inProgress', False),
            'explicitlyCompleted': company_data.get('explicitlyCompleted', False)
        })
    except ClientError as e:
        if e.response['Error']['Code'] == 'NoSuchKey':
            return cors_response(200, {
                'found': False,
                'message': f'No company data found for company {company_id}'
            })
        else:
            raise e

def get_next_employee_id(company_id):
    """Get the next available employee ID for a company"""
    responses_bucket = os.environ['RESPONSES_BUCKET']
    try:
        response = s3.list_objects_v2(Bucket=responses_bucket, Prefix=f'{company_id}/employee_')
        if 'Contents' in response:
            employee_files = [obj['Key'] for obj in response['Contents'] if obj['Key'].startswith(f'{company_id}/employee_')]
            max_id = -1
            for file_key in employee_files:
                try:
                    employee_id = int(file_key.split('employee_')[1].split('.')[0])
                    max_id = max(max_id, employee_id)
                except (ValueError, IndexError):
                    continue
            return max_id + 1
        return 0
    except ClientError:
        return 0

def get_company_status(event):
    """Get company status including employee count and completion status"""
    query_params = event.get('queryStringParameters', {}) or {}
    company_id = query_params.get('companyId')
    
    if not company_id:
        return cors_response(400, {'error': 'companyId required'})
    
    responses_bucket = os.environ['RESPONSES_BUCKET']
    
    # Check company completion status
    company_completed = False
    company_in_progress = False
    completion_percentage = 0
    last_modified = None
    
    try:
        response = s3.get_object(Bucket=responses_bucket, Key=f'{company_id}/company.json')
        company_data = json.loads(response['Body'].read().decode('utf-8'))
        company_completed = company_data.get('explicitlyCompleted', False)
        company_in_progress = company_data.get('inProgress', False)
        completion_percentage = company_data.get('completionPercentage', 0)
        last_modified = company_data.get('lastModified')
    except ClientError:
        pass  # Company questionnaire doesn't exist yet
    
    # Count employees and get their IDs
    try:
        response = s3.list_objects_v2(Bucket=responses_bucket, Prefix=f'{company_id}/employee_')
        employee_files = response.get('Contents', [])
        employee_ids = []
        
        for obj in employee_files:
            try:
                employee_id = int(obj['Key'].split('employee_')[1].split('.')[0])
                employee_ids.append(employee_id)
            except (ValueError, IndexError):
                continue
        
        employee_ids.sort()
        employee_count = len(employee_ids)
    except ClientError:
        employee_count = 0
        employee_ids = []
    
    return cors_response(200, {
        'companyCompleted': company_completed,
        'companyInProgress': company_in_progress,
        'completionPercentage': completion_percentage,
        'lastModified': last_modified,
        'employeeCount': employee_count,
        'employeeIds': employee_ids,
        'nextEmployeeId': max(employee_ids) + 1 if employee_ids else 0
    })

def save_file_metadata(company_id, employee_id, question_id, file_metadata):
    """Save file upload metadata to the uploads metadata registry"""
    responses_bucket = os.environ['RESPONSES_BUCKET']
    
    # Create metadata entry
    metadata_entry = {
        'uploadId': str(uuid.uuid4()),
        'companyId': company_id,
        'employeeId': employee_id,
        'questionId': question_id,
        'fileName': file_metadata['fileName'],
        'fileSize': file_metadata['fileSize'],
        'fileType': file_metadata['fileType'],
        's3Key': file_metadata['s3Key'],
        's3Bucket': file_metadata.get('s3Bucket', responses_bucket),
        'uploadTimestamp': datetime.utcnow().isoformat(),
        'questionText': file_metadata.get('questionText', 'Unknown Question'),
        'formType': 'employee' if employee_id else 'company'
    }
    
    # Save to uploads metadata registry
    metadata_key = f'uploads/metadata/{company_id}/upload-{metadata_entry["uploadId"]}.json'
    
    try:
        s3.put_object(
            Bucket=responses_bucket,
            Key=metadata_key,
            Body=json.dumps(metadata_entry, indent=2),
            ContentType='application/json'
        )
        print(f"[v4.0] Saved file metadata: {metadata_key}")
        return metadata_entry
    except Exception as e:
        print(f"[v4.0] Error saving file metadata: {str(e)}")
        raise e

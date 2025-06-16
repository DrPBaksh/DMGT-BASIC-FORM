deploy_infrastructure() {
    log_step "Deploying CloudFormation Infrastructure"
    
    local cf_start_time=$(date +%s)
    
    log_info "Stack Name: $STACK_NAME"
    log_info "Environment: $ENVIRONMENT"
    log_info "Region: $REGION"
    log_info "Owner: $OWNER_NAME"
    
    # Validate template
    log_info "Validating CloudFormation template..."
    execute_command "aws cloudformation validate-template --template-body file://$INFRASTRUCTURE_DIR/cloudformation-template.yaml --region $REGION" "Template validation"
    
    # Create changeset
    log_info "Creating changeset for review..."
    local changeset_name="changeset-$(date +%s)"
    local changeset_type="CREATE"
    
    if [ "$STACK_EXISTS" = "true" ]; then
        changeset_type="UPDATE"
    fi
    
    # Create changeset with error handling for "no changes" scenario
    local changeset_result=0
    if ! aws cloudformation create-change-set \
        --stack-name $STACK_NAME \
        --template-body file://$INFRASTRUCTURE_DIR/cloudformation-template.yaml \
        --parameters ParameterKey=Environment,ParameterValue=$ENVIRONMENT \
        --capabilities CAPABILITY_NAMED_IAM \
        --change-set-name $changeset_name \
        --change-set-type $changeset_type \
        --region $REGION > /tmp/changeset_output.log 2>&1; then
        changeset_result=$?
        log_warning "Changeset creation returned non-zero exit code: $changeset_result"
    fi
    
    # Wait for changeset with timeout and check for "no changes" error
    log_info "Waiting for changeset to be created..."
    local wait_attempts=0
    local max_attempts=30
    
    while [ $wait_attempts -lt $max_attempts ]; do
        local changeset_status=$(aws cloudformation describe-change-set \
            --stack-name $STACK_NAME \
            --change-set-name $changeset_name \
            --region $REGION \
            --query 'Status' \
            --output text 2>/dev/null || echo "NOT_FOUND")
        
        local changeset_reason=$(aws cloudformation describe-change-set \
            --stack-name $STACK_NAME \
            --change-set-name $changeset_name \
            --region $REGION \
            --query 'StatusReason' \
            --output text 2>/dev/null || echo "")
        
        case $changeset_status in
            "CREATE_COMPLETE")
                log_success "Changeset created successfully"
                break
                ;;
            "FAILED")
                if [[ "$changeset_reason" == *"didn't contain changes"* ]]; then
                    log_warning "No infrastructure changes detected - stack is already up to date"
                    log_info "Skipping infrastructure deployment, continuing with frontend..."
                    
                    # Clean up the failed changeset
                    aws cloudformation delete-change-set \
                        --stack-name $STACK_NAME \
                        --change-set-name $changeset_name \
                        --region $REGION > /dev/null 2>&1 || true
                    
                    local cf_end_time=$(date +%s)
                    local cf_duration=$((cf_end_time - cf_start_time))
                    log_success "Infrastructure check completed in ${cf_duration}s (no changes needed)"
                    return 0
                else
                    log_error "Changeset creation failed: $changeset_reason"
                    # Clean up the failed changeset
                    aws cloudformation delete-change-set \
                        --stack-name $STACK_NAME \
                        --change-set-name $changeset_name \
                        --region $REGION > /dev/null 2>&1 || true
                    exit 1
                fi
                ;;
            "CREATE_PENDING"|"CREATE_IN_PROGRESS")
                printf "\r${CYAN}⏳ Waiting for changeset creation... %ds${NC}" $((wait_attempts * 2))
                sleep 2
                wait_attempts=$((wait_attempts + 1))
                ;;
            *)
                log_error "Unexpected changeset status: $changeset_status"
                exit 1
                ;;
        esac
    done
    
    if [ $wait_attempts -ge $max_attempts ]; then
        log_error "Changeset creation timed out"
        exit 1
    fi
    
    # Execute changeset
    log_info "Executing changeset..."
    execute_command "aws cloudformation execute-change-set --stack-name $STACK_NAME --change-set-name $changeset_name --region $REGION" "Changeset execution"
    
    # Wait for completion with progress
    log_info "Waiting for stack deployment to complete..."
    local wait_start=$(date +%s)
    
    while true; do
        local stack_status=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo "NOT_FOUND")
        local wait_current=$(date +%s)
        local wait_duration=$((wait_current - wait_start))
        
        printf "\r${CYAN}⏳ Waiting for stack deployment... %ds (Status: %s)${NC}" $wait_duration "$stack_status"
        
        case $stack_status in
            "CREATE_COMPLETE"|"UPDATE_COMPLETE")
                echo ""
                log_success "Stack deployment completed successfully"
                break
                ;;
            "CREATE_FAILED"|"UPDATE_FAILED"|"ROLLBACK_COMPLETE"|"UPDATE_ROLLBACK_COMPLETE")
                echo ""
                log_error "Stack deployment failed with status: $stack_status"
                log_info "Checking stack events for error details..."
                aws cloudformation describe-stack-events --stack-name $STACK_NAME --region $REGION \
                    --query 'StackEvents[?ResourceStatus==`CREATE_FAILED` || ResourceStatus==`UPDATE_FAILED`].{Time:Timestamp,Resource:LogicalResourceId,Status:ResourceStatus,Reason:ResourceStatusReason}' \
                    --output table
                exit 1
                ;;
        esac
        
        sleep 10
    done
    
    local cf_end_time=$(date +%s)
    local cf_duration=$((cf_end_time - cf_start_time))
    log_success "Infrastructure deployment completed in ${cf_duration}s"
}
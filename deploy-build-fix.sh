build_frontend() {
    log_step "Building React Application"
    
    cd "$FRONTEND_DIR"
    local frontend_start_time=$(date +%s)
    
    # Check Node.js version
    local node_version=$(node --version | cut -d'v' -f2)
    log_debug "Node.js version: $node_version"
    
    # Install dependencies with error handling
    log_info "Installing npm dependencies..."
    
    # Try npm ci first, with fallback to fix if it fails
    if ! npm ci --silent; then
        log_warning "npm ci failed, attempting to fix npm issues..."
        cd "$SCRIPT_DIR"
        
        if ! fix_npm_issues; then
            log_error "Failed to fix npm issues. Please check your package.json and node version compatibility."
            exit 1
        fi
        
        cd "$FRONTEND_DIR"
        log_success "✅ npm install completed successfully - skipping npm ci retry"
    else
        log_success "NPM dependencies installation completed"
    fi
    
    # Create environment configuration
    create_environment_file
    
    # Build the application
    log_info "Building React application for production..."
    execute_command "npm run build" "React application build"
    
    # Verify build output
    if [ ! -d "build" ]; then
        log_error "Build directory not created"
        exit 1
    fi
    
    local build_size=$(du -sh build | cut -f1)
    log_success "React build completed (Size: $build_size)"
    
    cd "$SCRIPT_DIR"
    
    local frontend_end_time=$(date +%s)
    local frontend_duration=$((frontend_end_time - frontend_start_time))
    log_success "Frontend build completed in ${frontend_duration}s"
}
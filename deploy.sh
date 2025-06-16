build_frontend() {
    log_step "Building React Application"
    
    cd "$FRONTEND_DIR"
    local frontend_start_time=$(date +%s)
    
    # Check Node.js version
    local node_version=$(node --version | cut -d'v' -f2)
    log_debug "Node.js version: $node_version"
    
    # Install dependencies - use npm install directly (more reliable than npm ci)
    log_info "Installing npm dependencies..."
    execute_command "npm install --silent" "NPM dependencies installation"
    
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
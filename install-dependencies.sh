#!/bin/bash

# Navigate to frontend directory and install dependencies
cd frontend
npm install

# If you get any peer dependency warnings, you can run:
# npm install --legacy-peer-deps

echo "Dependencies installed successfully!"
echo "Now you can start the development server with: npm start"
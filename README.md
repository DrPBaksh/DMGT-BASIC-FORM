# DMGT Basic Form - Data & AI Readiness Assessment 2025

A professional, enterprise-grade assessment platform designed to evaluate organizational and individual readiness for data and AI initiatives. Built with modern React frontend and AWS serverless backend infrastructure.

## 🎯 Purpose

This application assesses how **data and AI ready** companies are in 2025, providing comprehensive insights into:
- Organizational data and AI maturity
- Individual employee readiness and skills
- Technology infrastructure and governance
- Training needs and opportunities
- Strategic planning and investment priorities

## 🏗️ Architecture

### Frontend
- **React 18** with modern hooks and functional components
- **Apple-inspired design** with professional white, blue, and grey theme
- **Responsive** and mobile-friendly interface
- **Progressive** form rendering with auto-save functionality
- **Real-time progress tracking** and validation

### Backend Infrastructure
- **AWS Lambda** for serverless form processing
- **Amazon S3** for data storage and static website hosting
- **API Gateway** for RESTful API endpoints
- **CloudFront** for global content delivery
- **CloudFormation** for infrastructure as code

### Data Storage
- **Configuration**: CSV files in S3 for flexible question management
- **Responses**: JSON files organized by company/employee hierarchy
- **Files**: Uploaded documents tagged by question and user

## 🚀 Quick Start

### Prerequisites
- AWS CLI configured with appropriate permissions
- Node.js 16+ installed
- Bash shell (Linux/macOS/WSL)

### Deployment

1. **Clone and Deploy**
   ```bash
   git clone https://github.com/DrPBaksh/DMGT-BASIC-FORM.git
   cd DMGT-BASIC-FORM
   chmod +x deploy.sh destroy.sh
   ./deploy.sh
   ```

2. **Access Your Application**
   - The deployment script will output your CloudFront URL
   - API endpoints are automatically configured
   - CSV configuration files are uploaded to S3

### Destruction
```bash
./destroy.sh
```
⚠️ This permanently deletes ALL resources and data.

## 📋 CSV Configuration Guide

### Question Structure

Both `CompanyQuestions.csv` and `EmployeeQuestions.csv` follow this schema:

| Column | Description | Example |
|--------|-------------|---------|
| `QuestionID` | Unique identifier | `COMP_001`, `EMP_001` |
| `Question` | The question text | `What is your company's primary industry?` |
| `QuestionType` | Input type (see below) | `single-choice` |
| `QuestionTypeDetails` | Type-specific configuration | `Option1\|Option2\|Option3` |
| `Required` | Whether answer is mandatory | `true` or `false` |
| `Section` | Grouping category | `Company Profile` |
| `AllowFileUpload` | Enable file attachment | `true` or `false` |
| `QuestionOrder` | Display sequence | `1`, `2`, `3` |

### Supported Question Types

#### 1. Text Input
```csv
QuestionType: text
QuestionTypeDetails: (empty)
```
Single-line text input for short responses.

#### 2. Textarea
```csv
QuestionType: textarea  
QuestionTypeDetails: (empty)
```
Multi-line text area for detailed responses.

#### 3. Number Input
```csv
QuestionType: number
QuestionTypeDetails: (empty)
```
Numeric input with validation.

#### 4. Date Input
```csv
QuestionType: date
QuestionTypeDetails: (empty)
```
Date picker interface.

#### 5. Email Input
```csv
QuestionType: email
QuestionTypeDetails: (empty)
```
Email input with validation.

#### 6. Phone Input
```csv
QuestionType: phone
QuestionTypeDetails: (empty)
```
Phone number input.

#### 7. Single Choice (Radio Buttons)
```csv
QuestionType: single-choice
QuestionTypeDetails: Technology|Healthcare|Finance|Manufacturing|Other
```
Select exactly one option from the list. Separate options with `|`.

#### 8. Multiple Choice (Checkboxes)
```csv
QuestionType: multiple-choice
QuestionTypeDetails: AI Tools|Data Analytics|Cloud Platforms|None
```
Select multiple options. Separate options with `|`.

#### 9. Slider
```csv
QuestionType: slider
QuestionTypeDetails: 0,100
```
Slider input where first number is minimum, second is maximum.

#### 10. Rating Scale
```csv
QuestionType: rating
QuestionTypeDetails: 1,5
```
Star rating system. First number is minimum, second is maximum.

#### 11. Yes/No Toggle
```csv
QuestionType: yes-no
QuestionTypeDetails: (empty)
```
Simple yes/no radio button selection.

### Example CSV Entries

```csv
QuestionID,Question,QuestionType,QuestionTypeDetails,Required,Section,AllowFileUpload,QuestionOrder
COMP_001,What is your company size?,single-choice,"1-50|51-200|201-1000|1000+",true,Profile,false,1
COMP_002,Describe your AI strategy,textarea,,false,Strategy,true,2
COMP_003,Rate your data maturity,rating,"1,5",true,Assessment,false,3
EMP_001,Years of experience?,slider,"0,30",true,Background,false,1
```

## 🎨 Design System

### Color Palette
- **Primary Blue**: #007AFF (Apple system blue)
- **Secondary Blue**: #5AC8FA (Light blue)
- **Background**: #F5F5F7 (Light grey)
- **Text**: #1D1D1F (Near black)
- **Borders**: #D2D2D7 (Medium grey)

### Typography
- **Font**: Inter (with Apple system font fallbacks)
- **Weights**: 300, 400, 500, 600, 700
- **Responsive scaling** for mobile devices

### Components
- **Cards**: Rounded corners, subtle shadows
- **Buttons**: Gradient hover effects, smooth transitions
- **Forms**: Clean inputs with focus states
- **Progress**: Animated bars with completion tracking

## 🔧 Data Flow

### Company Assessment Flow
1. **Company ID Entry**: User enters assigned company identifier
2. **Validation**: System checks if company assessment already completed
3. **Form Rendering**: Questions loaded from `CompanyQuestions.csv`
4. **Auto-save**: Each answer automatically saved to S3
5. **File Uploads**: Documents stored in `s3://bucket/companyId/uploaded_documents/`
6. **Completion**: Final JSON stored as `s3://bucket/companyId/company.json`

### Employee Assessment Flow
1. **Company ID Entry**: Same company ID as above
2. **Employee ID Generation**: Auto-incremented based on existing employees
3. **Status Display**: Shows "You are Employee #X for Company Y"
4. **Form Rendering**: Questions loaded from `EmployeeQuestions.csv`
5. **Auto-save**: Each answer automatically saved
6. **Completion**: Final JSON stored as `s3://bucket/companyId/employee_X.json`

### File Organization
```
S3 Bucket Structure:
├── CompanyQuestions.csv
├── EmployeeQuestions.csv
└── responses/
    └── {companyId}/
        ├── company.json
        ├── employee_0.json
        ├── employee_1.json
        └── uploaded_documents/
            ├── metadata.json
            └── {files}
```

## 🔒 Security Features

- **HTTPS**: All traffic encrypted via CloudFront
- **CORS**: Properly configured for cross-origin requests
- **Validation**: Input sanitization and type checking
- **File Upload**: Secure S3 upload with metadata tracking
- **Access Control**: IAM roles with least privilege principle

## 📊 Analytics & Reporting

### Response Format
```json
{
  "companyId": "ACME-2025",
  "formType": "company",
  "timestamp": "2025-06-12T08:00:00.000Z",
  "responses": {
    "COMP_001": "Technology",
    "COMP_002": "We are implementing AI across operations...",
    "COMP_003": "4"
  }
}
```

### File Metadata
```json
{
  "files": [
    {
      "questionId": "COMP_006",
      "employeeId": null,
      "filename": "strategy_document.pdf",
      "uploadTime": "2025-06-12T08:15:00.000Z",
      "size": 2048576
    }
  ]
}
```

## 🛠️ Customization

### Adding New Question Types
1. Update `FormRenderer.js` with new rendering logic
2. Add CSS styles in `App.css`
3. Update this documentation

### Modifying Questions
1. Edit CSV files in the `data/` directory
2. Upload to S3 using AWS CLI or console
3. Changes take effect immediately

### Styling Changes
1. Modify CSS variables in `App.css`
2. Rebuild and redeploy frontend
3. CloudFront cache will be invalidated

## 🔍 Troubleshooting

### Common Issues

**1. Lambda Function Timeout**
- Increase timeout in CloudFormation template
- Check CloudWatch logs for specific errors

**2. CORS Errors**
- Verify API Gateway CORS settings
- Check request headers in browser dev tools

**3. CSV Loading Failures**
- Validate CSV format and encoding
- Ensure files are uploaded to correct S3 bucket

**4. File Upload Issues**
- Check S3 bucket permissions
- Verify file size limits

### Monitoring
- **CloudWatch Logs**: Lambda function execution logs
- **API Gateway Metrics**: Request/response monitoring
- **S3 Access Logs**: File upload/download tracking
- **CloudFront Reports**: Global usage analytics

## 📚 API Reference

### Endpoints

**GET** `/config/{formType}`
- Retrieves question configuration
- Parameters: `formType` (company|employee)
- Returns: Array of question objects

**POST** `/responses`
- Saves form responses
- Body: `{ companyId, formType, responses }`
- Returns: Success confirmation

**GET** `/responses?companyId={id}`
- Checks completion status
- Parameters: `companyId`
- Returns: `{ companyCompleted, employeeCount }`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For technical support or questions:
- Create an issue on GitHub
- Check CloudWatch logs for error details
- Review this documentation for common solutions

---

**Built with ❤️ for data and AI readiness assessment**
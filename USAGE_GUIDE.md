# DMGT Basic Form - Quick Usage Guide

## 🚀 Getting Started

### 1. Deploy the Application
```bash
git clone https://github.com/DrPBaksh/DMGT-BASIC-FORM.git
cd DMGT-BASIC-FORM
chmod +x deploy.sh destroy.sh
./deploy.sh
```

### 2. Access Your Application
After deployment, you'll receive:
- **Website URL**: Your CloudFront distribution URL
- **API URL**: Your API Gateway endpoint

## 📝 Using the Assessment Form

### Company Assessment
1. **Enter Company ID**: Use the unique identifier provided to your client
2. **Complete Assessment**: Answer all required questions (marked with *)
3. **Upload Documents**: Attach supporting files where indicated
4. **Auto-Save**: Responses are automatically saved as you type
5. **One-Time Only**: Each company can only complete the assessment once

### Employee Assessment  
1. **Use Same Company ID**: Enter the identical company ID
2. **Employee Numbering**: System automatically assigns Employee #1, #2, etc.
3. **Individual Responses**: Each employee gets their own assessment
4. **Unlimited Employees**: No limit on number of employee assessments per company

## 🎯 Assessment Coverage

### Company Questions (40 Questions)
- **Company Profile**: Industry, size, revenue
- **Data Strategy**: Current approach and goals
- **AI Strategy**: Implementation and roadmap
- **Data Infrastructure**: Technology stack and architecture
- **Data Quality & Governance**: Processes and frameworks
- **AI Adoption**: Current technologies and projects
- **Investment & Partnerships**: Budget and vendor relationships
- **Skills & Training**: Workforce development
- **AI Ethics**: Principles and oversight
- **Future Plans**: Priorities and expectations

### Employee Questions (40 Questions)
- **Personal Profile**: Role, experience, education
- **Technology Comfort**: General tech proficiency
- **Data Usage**: Current data interaction
- **Data Tools & Skills**: Technical capabilities
- **AI Usage**: Current AI tool adoption
- **AI Comfort & Trust**: Attitudes toward AI
- **Training Needs**: Learning preferences and gaps
- **Future Readiness**: Career outlook and development
- **Organizational Support**: Company backing and communication

## 📊 Data Collection Features

### Question Types Available
- **Text/Textarea**: Open-ended responses
- **Single/Multiple Choice**: Predefined options
- **Sliders**: Numerical ranges (e.g., 0-100%)
- **Ratings**: Star-based scales (e.g., 1-5)
- **Yes/No**: Binary choices
- **Numbers/Dates**: Specific data entry

### File Upload Capabilities
- **Per Question**: Attach supporting documents to specific questions
- **Any File Type**: No restrictions on file formats
- **Automatic Organization**: Files tagged by company/employee/question
- **S3 Storage**: Secure cloud storage with metadata tracking

## 🔧 Managing Questions (CSV Configuration)

### Question Structure
Each question in the CSV has these properties:
- **QuestionID**: Unique identifier (e.g., COMP_001, EMP_001)
- **Question**: The actual question text
- **QuestionType**: Input method (text, single-choice, slider, etc.)
- **QuestionTypeDetails**: Configuration (options for choices, ranges for sliders)
- **Required**: true/false for mandatory questions
- **Section**: Grouping category for organization
- **AllowFileUpload**: true/false for document attachment
- **QuestionOrder**: Display sequence

### Editing Questions
1. **Modify CSV Files**: Edit `data/CompanyQuestions.csv` or `data/EmployeeQuestions.csv`
2. **Upload to S3**: Use AWS Console or CLI to update the config bucket
3. **Immediate Effect**: Changes are live immediately (no deployment needed)

### Adding New Questions
```csv
NEW_001,What is your new question?,single-choice,"Option1|Option2|Option3",true,New Section,false,41
```

## 📈 Response Data Structure

### Company Response Example
```json
{
  "companyId": "ACME-2025",
  "formType": "company", 
  "timestamp": "2025-06-12T08:00:00.000Z",
  "responses": {
    "COMP_001": "Technology",
    "COMP_002": "We are implementing AI...",
    "COMP_003": "4"
  }
}
```

### File Organization in S3
```
responses/
└── ACME-2025/
    ├── company.json           # Company assessment
    ├── employee_0.json        # First employee
    ├── employee_1.json        # Second employee
    └── uploaded_documents/    # All uploaded files
        ├── metadata.json      # File tracking
        ├── strategy_doc.pdf   # Uploaded documents
        └── process_flow.png
```

## 🛡️ Security & Privacy

### Data Protection
- **HTTPS**: All data encrypted in transit
- **S3 Encryption**: Data encrypted at rest
- **Access Control**: IAM-based permissions
- **No Personal Info**: Questions focus on professional/organizational data

### Company Data Isolation
- **Separate Folders**: Each company's data in isolated S3 prefix
- **Unique IDs**: Company IDs prevent cross-contamination
- **Audit Trail**: Timestamps and metadata for all responses

## 🔧 Troubleshooting

### Common Issues

**"Company questionnaire already completed"**
- Solution: Use a different Company ID or contact administrator

**Questions not loading**
- Check: CSV files are properly uploaded to S3 config bucket
- Verify: CSV format is correct (no extra commas, proper encoding)

**File upload failing**
- Check: Internet connection is stable
- Verify: File is not corrupted

**Progress not saving**
- Check: Internet connection
- Verify: Company ID is entered correctly

### Getting Help
1. **Check Browser Console**: Look for error messages
2. **Verify Company ID**: Ensure it's entered exactly as provided
3. **Try Different Browser**: Test in incognito/private mode
4. **Contact Support**: Provide Company ID and error details

## 📞 Support Information

### Technical Support
- **GitHub Issues**: Report bugs and feature requests
- **Documentation**: Comprehensive README.md available
- **AWS CloudWatch**: Monitor application logs and metrics

### Business Support
- **Assessment Questions**: Contact DMGT assessment team
- **Company IDs**: Obtain from your DMGT representative
- **Results Analysis**: Professional interpretation services available

---

**Ready to assess your data and AI readiness? Start with your Company ID!**
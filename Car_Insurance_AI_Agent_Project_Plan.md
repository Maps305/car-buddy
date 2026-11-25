# Car Insurance AI Agent

## Project Plan and Hackathon Implementation Guide

**Hackathon submission:** 
**Working concept:** An AI-powered car buddy for insurance claims,
vehicle advice and maintenance support\
**Customer channel:** WhatsApp\
**AI platform:** Caimex AI

------------------------------------------------------------------------

## 1. Project Overview

Car insurance claims are often slow and manual. Customers may need to
find the correct claim form, complete it, gather supporting documents,
submit it through an insurer's existing process and contact staff
repeatedly for updates. Insurers spend time collecting documents,
checking information and manually routing claims.

Car owners also lack a single place for insurance support, vehicle
advice and maintenance reminders.

This project proposes a WhatsApp-based AI agent that acts as a trusted
car buddy. It helps customers submit and track insurance claims, answers
basic vehicle questions, and provides proactive vehicle maintenance
support using vehicle and tracker information.

The system also includes a web-based claims operations portal for
insurance staff. Claim processors manage incoming claims and assign
assessors. Assessors review evidence and prepare reports. Authorised
staff make claim decisions and issue the relevant settlement outcome.

**Core principle:** AI assists with conversation, document understanding
and assessment preparation. The backend enforces workflow rules,
permissions and claim status. Human staff retain responsibility for
claim approval or rejection.

## 2. Problem Statement

Current motor insurance processes can involve:

-   Manual collection and verification of claim documents.
-   Customers filling in and submitting claim forms.
-   Customers contacting support to check claim progress.
-   Staff manually tracking and routing claims.
-   Delays caused by missing information and human error.
-   Fragmented access to policy, claim and vehicle information.
-   Separate sources for vehicle advice and maintenance information.

For example, an insurer may provide downloadable claim forms for
different claim types, requiring customers to select the correct form,
complete it and submit it through the existing process.

These manual steps increase processing effort and can reduce customer
confidence.

## 3. Proposed Solution

Build an AI-powered motor insurance assistant with three connected
capabilities.

### 3.1 Claims Assistant

The WhatsApp agent will:

-   Guide customers through the claim process.
-   Verify the customer, policy and insured vehicle through backend
    services.
-   Ask structured questions about the incident.
-   Collect required documents and damage photographs.
-   Extract information from submitted documents.
-   Check for missing information and inconsistencies.
-   Submit the claim to the insurer's claims workflow.
-   Provide a claim reference and status updates.
-   Send the customer the approved claim outcome and next steps.

### 3.2 Vehicle Intelligence Assistant

The agent will:

-   Answer basic car-related questions.
-   Explain maintenance and safety procedures.
-   Help interpret vehicle warning lights and dashboard indicators.
-   Read relevant information from vehicle photographs, such as a
    tyre-pressure placard.
-   Provide maintenance reminders based on the vehicle's service
    schedule and mileage.
-   Support repair-cost guidance where reliable information is
    available.
-   Use tracker data for mileage, driving behaviour and vehicle movement
    alerts when a tracker integration is available.

The agent must not claim that a photograph of a tyre reveals its actual
inflation pressure. Actual pressure requires a gauge or TPMS reading.
Vehicle-specific recommendations should be grounded in a manual, placard
or trusted source.

### 3.3 Claims Automation for Insurers

The staff portal will:

-   Receive submitted claims in a processor queue.
-   Show customer, policy, vehicle and document information.
-   Identify missing documents and potential inconsistencies.
-   Allow processors to assign claims to assessors.
-   Allow assessors to review evidence and submit assessment reports.
-   Allow authorised processors to approve, reject or request more
    information.
-   Generate repair authorisation letters or initiate the approved
    settlement process.
-   Maintain an audit trail of important actions and status changes.

## 4. User Roles

### Customer

-   Initiates and submits claims through WhatsApp.
-   Uploads claim documents and photographs.
-   Checks claim status.
-   Receives requests for additional information.
-   Receives claim outcomes and repair authorisation documents.
-   Asks vehicle questions and receives maintenance reminders.

### Claim Processor

-   Views and manages incoming claims.
-   Checks policy and document completeness.
-   Assigns claims to assessors.
-   Reviews assessment reports.
-   Makes or records authorised claim decisions.
-   Initiates repair authorisation or settlement workflow.

### Claim Assessor

-   Views claims assigned to them.
-   Reviews documents, photographs and repair estimates.
-   Records observed damage and assessment findings.
-   Produces a report and recommendation.
-   Returns the report to the processor.

### Administrator

-   Manages staff accounts and roles.
-   Configures claim types and document requirements.
-   Manages service schedules and system settings.
-   Reviews audit records and operational metrics.

## 5. End-to-End Claims Workflow

1.  Customer reports an accident through WhatsApp.
2.  Agent checks immediate safety and advises the customer to contact
    emergency services if needed.
3.  Backend verifies the customer, active policy and insured vehicle.
4.  Agent creates a draft claim and assigns a claim reference.
5.  Agent asks incident questions and collects required documents.
6.  WhatsApp media is downloaded promptly and saved to private storage.
7.  AI extracts relevant fields from documents and identifies missing or
    conflicting information.
8.  Customer confirms or corrects extracted information where
    appropriate.
9.  Customer submits the claim.
10. Claim appears in the processor queue.
11. Processor checks completeness and assigns an assessor.
12. Assessor reviews the evidence and AI-assisted summary.
13. Assessor submits a report and recommendation.
14. Processor reviews the report and makes an authorised decision.
15. If approved, the system generates a repair authorisation letter or
    initiates the approved settlement workflow.
16. Customer receives a status update and the relevant document or
    secure next-step link.
17. Claim is closed after the settlement or repair process is completed.

## 6. Claim Status Model

Recommended initial statuses:

-   `DRAFT` --- claim started but not submitted.
-   `SUBMITTED` --- customer submitted the claim.
-   `UNDER_REVIEW` --- processor is checking the claim.
-   `ASSESSOR_ASSIGNED` --- claim assigned to an assessor.
-   `ASSESSMENT_IN_PROGRESS` --- assessor is reviewing evidence.
-   `ASSESSMENT_COMPLETED` --- assessor submitted a report.
-   `AWAITING_DECISION` --- processor must review the report.
-   `ADDITIONAL_INFO_REQUIRED` --- further information is required.
-   `APPROVED` --- claim approved by authorised staff.
-   `REJECTED` --- claim declined by authorised staff.
-   `PAYMENT_PENDING` --- settlement or repair authorisation is being
    processed.
-   `CLOSED` --- claim completed.

Status changes must be validated by the backend and recorded in an audit
log. The AI must not directly write claim status or approve/reject a
claim.

## 7. Caimex AI Usage

Caimex AI is a core project requirement. The application should
demonstrate meaningful use of Caimex models or APIs in several areas.

### 7.1 Conversational Agent

The agent interprets customer messages, asks follow-up questions and
chooses from approved backend tools.

### 7.2 Document Extraction

Extract fields from claim documents, including where available:

-   Police report number.
-   Incident date and location.
-   Customer and other-party details.
-   Vehicle registration numbers.
-   Incident description.
-   Document type and completeness.

Each extracted field should include a confidence score or validation
status. Low-confidence fields and conflicts must be flagged for human
review.

### 7.3 Image Understanding

Analyse accident photographs to describe visible damage and identify
areas requiring inspection. The AI can help organise evidence, but its
visual observations are not a final repair quotation or claim decision.

### 7.4 Consistency Checks

Compare the customer's incident account with the police report, vehicle
details and damage photographs. Flag possible mismatches for the
assessor without treating them as proof of fraud or grounds for
rejection.

### 7.5 Assessment Summary

Generate a structured summary for the assessor containing:

-   Claim facts.
-   Documents received.
-   Missing information.
-   Visible damage observations.
-   Possible inconsistencies.
-   Suggested follow-up questions.
-   AI recommendation for the assessor's consideration.
-   Human-review requirement.

### 7.6 Car Knowledge Assistant

Use retrieval-augmented generation (RAG) with trusted vehicle manuals,
service schedules, tyre-pressure information and basic maintenance
documents. Answers should be grounded in retrieved material where
possible.

## 8. AI Agent Tools

The agent should call controlled backend functions rather than access
the database directly.

Suggested tools:

-   `get_customer_profile`
-   `get_active_policy`
-   `get_customer_vehicles`
-   `start_claim`
-   `attach_document`
-   `extract_fields`
-   `check_completeness`
-   `submit_claim`
-   `get_claim_status`
-   `request_missing_documents`
-   `get_vehicle_information`
-   `get_service_status`
-   `get_vehicle_telemetry`
-   `answer_car_question`
-   `create_maintenance_reminder`

Every tool must validate identity, permissions, input and current
workflow state.

## 9. Maintenance Reminders

Store each vehicle's:

-   Current odometer reading.
-   Last service mileage.
-   Service interval.
-   Next service mileage.
-   Maintenance history.
-   Tracker identifier, where applicable.

Calculate:

`next_service_km = last_service_km + service_interval_km`

`remaining_km = next_service_km - current_odometer_km`

Use configurable reminder thresholds, for example 1,000 km and 300 km
before service. These are demo thresholds and should be configurable,
not treated as universal manufacturer recommendations.

For the hackathon, use a tracker simulator or odometer slider if a real
tracker API is unavailable. Moving the mileage should trigger a visible
reminder and demonstrate the workflow.

## 10. WhatsApp Integration

Use WhatsApp Business Platform Cloud API or an approved sandbox.

### Message flow

1.  Customer sends a message or document.
2.  WhatsApp sends a webhook event to the backend.
3.  Backend identifies the customer and retrieves relevant context.
4.  Media is downloaded promptly and stored privately.
5.  Agent interprets the request and calls approved tools.
6.  Backend validates and executes the action.
7.  Agent responds through WhatsApp.

### Messaging requirements

-   The WhatsApp customer-service window is generally 24 hours after the
    customer's last message.
-   Proactive messages outside the window require approved message
    templates.
-   Prepare templates early for claim status, missing documents, claim
    outcomes and maintenance reminders.
-   If template approval is unavailable during the demo, use an active
    test conversation or clearly labelled simulated notification.

## 11. Security and Responsible Use

-   Verify customer identity before exposing policy or claim
    information.
-   Use private document storage and short-lived signed links.
-   Do not collect bank details in WhatsApp chat.
-   Use a secure, authenticated payout form for settlement details.
-   Restrict staff access by role and claim assignment.
-   Keep audit logs for claim actions and decisions.
-   Validate all AI outputs before using them in business workflows.
-   Preserve original documents and distinguish AI-generated summaries
    from human-reviewed reports.
-   Do not allow AI to approve or reject claims autonomously.
-   Prioritise safety and emergency guidance during accident
    conversations.
-   Use fictional or approved test data during the hackathon.

## 12. Suggested Architecture

``` text
WhatsApp Cloud API / Sandbox
          |
          v
Webhook + Media Handler
          |
          v
Conversation Router
          |
          +---- Caimex AI (text, vision, structured outputs)
          |
          v
Application Backend
  |-- Claim Workflow Engine
  |-- Customer / Policy / Vehicle Service
  |-- Document Processing
  |-- Assessment Service
  |-- Notification Service
  |-- Maintenance Scheduler
  |-- PDF / Secure Payout Link
          |
          +---- Database
          +---- Private Document Storage
          +---- Tracker Simulator / API
          |
          v
Claims Operations Portal
  |-- Processor Queue
  |-- Assessor Workspace
  |-- Decision and Settlement
```

## 13. Recommended Technology Stack

  Component          Suggested technology
  ------------------ ---------------------------------------------------
  Customer channel   WhatsApp Business Cloud API
  Backend            Node.js with NestJS or Express
  Frontend           Next.js and Tailwind CSS
  Database           PostgreSQL or MySQL
  ORM                Prisma
  AI                 Caimex AI API using a compatible SDK
  Document storage   Supabase Storage or S3-compatible private storage
  Authentication     Session/JWT with role-based access
  PDF generation     PDFKit or HTML-to-PDF
  Scheduled jobs     Cron or a queue worker

Choose the stack the team can deliver with fastest. Avoid adding
infrastructure that does not support the demo.

## 14. Core Data Model

Suggested entities:

-   `customers`
-   `users`
-   `roles`
-   `vehicles`
-   `policies`
-   `claims`
-   `claim_documents`
-   `claim_assignments`
-   `claim_assessments`
-   `claim_events`
-   `repair_authorisations`
-   `payments`
-   `tracker_readings`
-   `service_schedules`
-   `maintenance_records`
-   `maintenance_reminders`
-   `knowledge_documents`

Every claim should reference a customer, vehicle and policy. Status
changes and staff actions should be recorded in `claim_events`.

## 15. Hackathon MVP Scope

### Must have

-   WhatsApp claim initiation.
-   Customer and vehicle verification using seeded data.
-   Document and photo submission.
-   Caimex document extraction.
-   Missing-document detection.
-   Processor claims queue.
-   Processor assigns assessor.
-   Assessor workspace and report submission.
-   Human approval or rejection.
-   Repair authorisation PDF.
-   Claim status notification.
-   Basic vehicle service reminder using simulated mileage.

### Secondary features

-   Tyre-pressure placard photo reading.
-   Basic car Q&A grounded in a small knowledge base.
-   Simulated tracker alerts.
-   Repair-cost guidance with clear limitations.
-   Shona or Ndebele support, subject to model testing.

### Out of scope for the initial demo

-   Real insurance underwriting.
-   Real payment transfers.
-   Full production tracker integration if credentials are unavailable.
-   Autonomous claim approval or rejection.
-   Comprehensive automotive diagnostic capability.

## 16. Team Work Split

For a four-person team:

1.  **WhatsApp and customer experience:** webhook, message handling,
    media download and conversation flow.
2.  **AI and document intelligence:** Caimex integration, extraction,
    image analysis, structured summaries and prompts.
3.  **Claims portal:** processor queue, assessor workspace, assignment
    and decision UI.
4.  **Backend and integration:** claim state machine, database, PDFs,
    notifications, tracker simulator and end-to-end integration.

Assign one person to integration ownership and agree on API contracts
early.

## 17. Demo Script

Build and rehearse this exact journey:

1.  Customer reports an accident on WhatsApp.
2.  Agent checks safety and verifies the customer.
3.  Agent creates a claim and returns a reference.
4.  Customer uploads a police report and damage photographs.
5.  Caimex extracts document fields and flags missing information.
6.  Customer submits the completed claim.
7.  Processor sees the claim in the dashboard and assigns an assessor.
8.  Assessor reviews the AI summary, corrects it and submits a report.
9.  Processor approves the claim.
10. System generates a repair authorisation PDF.
11. Customer receives the approval and authorisation through WhatsApp.
12. Customer asks a tyre-pressure question and sends a photo of the
    vehicle placard.
13. Agent reads the relevant information and explains how to check
    pressure.
14. Team moves the simulated odometer and demonstrates a service
    reminder.

The demo should show actual backend state changes, not just a sequence
of mock screens.

## 18. Success Criteria

The MVP is successful if:

-   A customer can submit a claim through WhatsApp.
-   Uploaded documents are stored and linked to the correct claim.
-   Caimex extracts useful information from at least one claim document.
-   Missing information is detected and shown to the processor.
-   A processor can assign an assessor.
-   An assessor can submit a report.
-   An authorised processor can approve or reject the claim.
-   An approved claim produces a repair authorisation document.
-   The customer can retrieve claim status.
-   A simulated mileage update triggers a maintenance reminder.
-   The demo can be completed reliably from beginning to end.

## 19. Business Model and Distribution

The insurer offers access to the agent as part of the motor insurance
product. The insurer bills the service through the insurance premium and
distributes it to existing policyholders.

This avoids requiring customers to create a separate account or make a
separate payment for the assistant. The insurer's existing customer and
billing channels provide distribution.

## 20. Value Proposition

### For customers

-   Faster and simpler claim submission.
-   Better visibility into claim progress.
-   Fewer unnecessary calls and visits.
-   One assistant for insurance and vehicle support.
-   Proactive maintenance reminders.

### For insurers

-   Reduced manual document handling.
-   Faster claim triage and routing.
-   Better visibility into claims operations.
-   Reduced routine workload.
-   Improved customer communication and satisfaction.

## 21. Pitch

> Car insurance claims are slow and manual. Our AI agent speeds up
> claims for insurers and gives car owners one trusted assistant for
> every car and insurance need.

The product combines WhatsApp claims support, AI-powered document
processing, human-reviewed claims operations and proactive vehicle
intelligence in one connected experience.

------------------------------------------------------------------------

## Implementation Decisions to Confirm

-   Hackathon duration and judging criteria.
-   Exact Caimex AI API/model requirements.
-   Whether image-capable models are available.
-   WhatsApp Cloud API test access or sandbox availability.
-   Whether an insurer partner provides sample forms and claim
    requirements.
-   Whether a real tracker API is available.
-   Whether simulated mileage and notifications are acceptable for the
    demo.
-   Team members, responsibilities and agreed backend/frontend
    interfaces.

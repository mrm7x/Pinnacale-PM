import type { Task } from './types';

export const defaultTasks: Task[] = [
  {
    "id": "p1_stage_define",
    "projectId": "p1",
    "parentId": null,
    "name": "Define Stage",
    "description": "Project initiation, discovery, BPR, and solution design.",
    "durationDays": 0,
    "assignedConsultantId": null,
    "predecessorIds": [],
    "status": "in_progress"
  },
  {
    "id": "p1_stage_build",
    "projectId": "p1",
    "parentId": null,
    "name": "Build Stage",
    "description": "Configure company parameters, dimension rules, core financials, and master data loads.",
    "durationDays": 0,
    "assignedConsultantId": null,
    "predecessorIds": [
      "p1_stage_define"
    ],
    "status": "not_started"
  },
  {
    "id": "p1_stage_model",
    "projectId": "p1",
    "parentId": null,
    "name": "Model Stage",
    "description": "UAT testing, operational modeling, business training, and cutover preparation.",
    "durationDays": 0,
    "assignedConsultantId": null,
    "predecessorIds": [
      "p1_stage_build"
    ],
    "status": "not_started"
  },
  {
    "id": "p1_stage_deploy",
    "projectId": "p1",
    "parentId": null,
    "name": "Deploy Stage",
    "description": "Final Go-Live cutover balances loading, post support, and project closure.",
    "durationDays": 0,
    "assignedConsultantId": null,
    "predecessorIds": [
      "p1_stage_model"
    ],
    "status": "not_started"
  },
  {
    "id": "p1_t_define_1",
    "projectId": "p1",
    "parentId": "p1_stage_define",
    "name": "Kick-off meeting (PS, EM, CSM, AM & Client)",
    "description": "Responsibility: All\nNotes: Responsibilities Assigned, High-Level Project Timeline Agreed.",
    "durationDays": 0.5,
    "assignedConsultantId": "c1",
    "predecessorIds": [],
    "status": "completed"
  },
  {
    "id": "p1_t_define_2",
    "projectId": "p1",
    "parentId": "p1_stage_define",
    "name": "Publish Project plan & Training plan",
    "description": "Responsibility: Intacct PS\nNotes: Scheduled Dates Populated In Line With Agreed Project Timeline.",
    "durationDays": 2.0,
    "assignedConsultantId": "c1",
    "predecessorIds": [
      "p1_t_define_1"
    ],
    "status": "completed"
  },
  {
    "id": "p1_t_define_3",
    "projectId": "p1",
    "parentId": "p1_stage_define",
    "name": "Training complete",
    "description": "Responsibility: Client\nNotes: Mandatory Self-Paced Learning prior to Discovery sessions.",
    "durationDays": 2.0,
    "assignedConsultantId": null,
    "predecessorIds": [
      "p1_t_define_2"
    ],
    "status": "completed"
  },
  {
    "id": "p1_t_define_4",
    "projectId": "p1",
    "parentId": "p1_stage_define",
    "name": "Document existing business processes",
    "description": "Responsibility: Client",
    "durationDays": 1.5,
    "assignedConsultantId": null,
    "predecessorIds": [
      "p1_t_define_3"
    ],
    "status": "in_progress"
  },
  {
    "id": "p1_t_define_5",
    "projectId": "p1",
    "parentId": "p1_stage_define",
    "name": "Provide CoA & Reporting Structure",
    "description": "Responsibility: Client",
    "durationDays": 1.0,
    "assignedConsultantId": null,
    "predecessorIds": [
      "p1_t_define_4"
    ],
    "status": "in_progress"
  },
  {
    "id": "p1_t_define_6",
    "projectId": "p1",
    "parentId": "p1_stage_define",
    "name": "Business Process Review document - Initial Draft",
    "description": "Responsibility: Client\nNotes: Complete/Annotate As Appropriate.",
    "durationDays": 0.5,
    "assignedConsultantId": null,
    "predecessorIds": [
      "p1_t_define_5"
    ],
    "status": "in_progress"
  },
  {
    "id": "p1_t_define_7",
    "projectId": "p1",
    "parentId": "p1_stage_define",
    "name": "Discovery Meeting 1",
    "description": "Responsibility: Intacct PS, Client\nNotes: Business Overview, Current Solution Limitations, Business Improvements, Project Goals & Objectives, Project Plan Reviewed.",
    "durationDays": 0.5,
    "assignedConsultantId": "c1",
    "predecessorIds": [
      "p1_t_define_6"
    ],
    "status": "in_progress"
  },
  {
    "id": "p1_t_define_8",
    "projectId": "p1",
    "parentId": "p1_stage_define",
    "name": "Discovery Meeting 2",
    "description": "Responsibility: Intacct PS, Client\nNotes: BPR Review; Company & Security, General Ledger, AR, Order Entry.",
    "durationDays": 0.5,
    "assignedConsultantId": "c1",
    "predecessorIds": [
      "p1_t_define_7"
    ],
    "status": "in_progress"
  },
  {
    "id": "p1_t_define_9",
    "projectId": "p1",
    "parentId": "p1_stage_define",
    "name": "Discovery Meeting 3",
    "description": "Responsibility: Intacct PS, Client\nNotes: BPR Review; AP, Purchasing, Additional In-Scope Modules.",
    "durationDays": 0.5,
    "assignedConsultantId": "c1",
    "predecessorIds": [
      "p1_t_define_8"
    ],
    "status": "in_progress"
  },
  {
    "id": "p1_t_define_10",
    "projectId": "p1",
    "parentId": "p1_stage_define",
    "name": "Initial Import Template Review",
    "description": "Responsibility: Intacct PS, Client\nNotes: In-Scope Import Templates Provided, Format Explained, Examples Populated, UK VAT solution review.",
    "durationDays": 0.5,
    "assignedConsultantId": "c1",
    "predecessorIds": [
      "p1_t_define_9"
    ],
    "status": "in_progress"
  },
  {
    "id": "p1_t_define_11",
    "projectId": "p1",
    "parentId": "p1_stage_define",
    "name": "Populate static data (Import Templates)",
    "description": "Responsibility: Client",
    "durationDays": 1.5,
    "assignedConsultantId": null,
    "predecessorIds": [
      "p1_t_define_10"
    ],
    "status": "in_progress"
  },
  {
    "id": "p1_t_define_12",
    "projectId": "p1",
    "parentId": "p1_stage_define",
    "name": "Review static data (Import Templates)",
    "description": "Responsibility: Intacct PS",
    "durationDays": 0.5,
    "assignedConsultantId": "c1",
    "predecessorIds": [
      "p1_t_define_11"
    ],
    "status": "in_progress"
  },
  {
    "id": "p1_t_define_13",
    "projectId": "p1",
    "parentId": "p1_stage_define",
    "name": "Publish Solution Definition Document",
    "description": "Responsibility: Intacct PS\nNotes: Document Completed Bases On BPR & Discovery Meetings 1,2 & 3.",
    "durationDays": 1.5,
    "assignedConsultantId": "c1",
    "predecessorIds": [
      "p1_t_define_12"
    ],
    "status": "in_progress"
  },
  {
    "id": "p1_t_define_14",
    "projectId": "p1",
    "parentId": "p1_stage_define",
    "name": "Review Solution Definition Document",
    "description": "Responsibility: Client\nNotes: SDD Review; Document Format & Content Explained.",
    "durationDays": 0.5,
    "assignedConsultantId": null,
    "predecessorIds": [
      "p1_t_define_13"
    ],
    "status": "in_progress"
  },
  {
    "id": "p1_t_define_15",
    "projectId": "p1",
    "parentId": "p1_stage_define",
    "name": "Sign-off Solution Definition Document",
    "description": "Responsibility: Intacct PS, Client\nNotes: Phase Completion - Completed Via DocuSign.",
    "durationDays": 0.5,
    "assignedConsultantId": "c1",
    "predecessorIds": [
      "p1_t_define_14"
    ],
    "status": "in_progress"
  },
  {
    "id": "p1_t_define_16",
    "projectId": "p1",
    "parentId": "p1_stage_define",
    "name": "Confirm status update & report recurrance",
    "description": "Responsibility: Intacct PS, Client\nNotes: Initial Status Meeting Scheduled & Delivered, Recurrance Confirmed (Weekly, Bi-Weekly, Monthly).",
    "durationDays": 1.0,
    "assignedConsultantId": "c1",
    "predecessorIds": [
      "p1_t_define_15"
    ],
    "status": "in_progress"
  },
  {
    "id": "p1_t_build_1",
    "projectId": "p1",
    "parentId": "p1_stage_build",
    "name": "Populate historic TB movements (Import Templates)",
    "description": "Responsibility: Client\nNotes: UAT reporting dependency.",
    "durationDays": 1.5,
    "assignedConsultantId": null,
    "predecessorIds": [
      "p1_t_define_16"
    ],
    "status": "not_started"
  },
  {
    "id": "p1_t_build_2",
    "projectId": "p1",
    "parentId": "p1_stage_build",
    "name": "Review historic TB movements (Import Templates)",
    "description": "Responsibility: Intacct PS",
    "durationDays": 0.5,
    "assignedConsultantId": "c1",
    "predecessorIds": [
      "p1_t_build_1"
    ],
    "status": "not_started"
  },
  {
    "id": "p1_t_build_3",
    "projectId": "p1",
    "parentId": "p1_stage_build",
    "name": "Create user roles and permissions",
    "description": "Responsibility: Client\nNotes: Question over live or UAT instance?",
    "durationDays": 1.0,
    "assignedConsultantId": null,
    "predecessorIds": [
      "p1_t_build_2"
    ],
    "status": "not_started"
  },
  {
    "id": "p1_t_build_4",
    "projectId": "p1",
    "parentId": "p1_stage_build",
    "name": "Provide test scripts",
    "description": "Responsibility: Intacct PS",
    "durationDays": 1.0,
    "assignedConsultantId": "c1",
    "predecessorIds": [
      "p1_t_build_3"
    ],
    "status": "not_started"
  },
  {
    "id": "p1_t_build_5",
    "projectId": "p1",
    "parentId": "p1_stage_build",
    "name": "Update UAT Scripts to include business specific user cases",
    "description": "Responsibility: Intacct PS, Client",
    "durationDays": 2.0,
    "assignedConsultantId": "c1",
    "predecessorIds": [
      "p1_t_build_4"
    ],
    "status": "not_started"
  },
  {
    "id": "p1_t_build_6",
    "projectId": "p1",
    "parentId": "p1_stage_build",
    "name": "Configure Company & Security",
    "description": "Responsibility: Intacct PS\nDependency: Static data",
    "durationDays": 1.5,
    "assignedConsultantId": "c2",
    "predecessorIds": [
      "p1_t_build_5",
      "p1_t_define_12"
    ],
    "status": "not_started"
  },
  {
    "id": "p1_t_build_7",
    "projectId": "p1",
    "parentId": "p1_stage_build",
    "name": "Configure Core Financials",
    "description": "Responsibility: Intacct PS\nDependency: Static data",
    "durationDays": 1.5,
    "assignedConsultantId": "c2",
    "predecessorIds": [
      "p1_t_build_6",
      "p1_t_define_12"
    ],
    "status": "not_started"
  },
  {
    "id": "p1_t_build_8",
    "projectId": "p1",
    "parentId": "p1_stage_build",
    "name": "Data Load - Entities, Dimensions, COA",
    "description": "Responsibility: Intacct PS\nDependency: Static data",
    "durationDays": 1.5,
    "assignedConsultantId": "c2",
    "predecessorIds": [
      "p1_t_build_7",
      "p1_t_define_12"
    ],
    "status": "not_started"
  },
  {
    "id": "p1_t_build_9",
    "projectId": "p1",
    "parentId": "p1_stage_build",
    "name": "Data Load - Customer, Suppliers, Items",
    "description": "Responsibility: Intacct PS\nDependency: Static data",
    "durationDays": 1.5,
    "assignedConsultantId": "c2",
    "predecessorIds": [
      "p1_t_build_8",
      "p1_t_define_12"
    ],
    "status": "not_started"
  },
  {
    "id": "p1_t_build_10",
    "projectId": "p1",
    "parentId": "p1_stage_build",
    "name": "Configure INSERT MODULE",
    "description": "Responsibility: Intacct PS",
    "durationDays": 1.5,
    "assignedConsultantId": "c2",
    "predecessorIds": [
      "p1_t_build_9"
    ],
    "status": "not_started"
  },
  {
    "id": "p1_t_build_11",
    "projectId": "p1",
    "parentId": "p1_stage_build",
    "name": "Data Loading - INSERT TEMPLATES",
    "description": "Responsibility: Intacct PS\nNotes: Additional items?",
    "durationDays": 1.5,
    "assignedConsultantId": "c2",
    "predecessorIds": [
      "p1_t_build_10"
    ],
    "status": "not_started"
  },
  {
    "id": "p1_t_build_12",
    "projectId": "p1",
    "parentId": "p1_stage_build",
    "name": "Provide sample Invoice template",
    "description": "Responsibility: Client",
    "durationDays": 1.0,
    "assignedConsultantId": null,
    "predecessorIds": [
      "p1_t_build_11"
    ],
    "status": "not_started"
  },
  {
    "id": "p1_t_build_13",
    "projectId": "p1",
    "parentId": "p1_stage_build",
    "name": "Configure Invoice template",
    "description": "Responsibility: Intacct PS",
    "durationDays": 1.5,
    "assignedConsultantId": "c2",
    "predecessorIds": [
      "p1_t_build_12"
    ],
    "status": "not_started"
  },
  {
    "id": "p1_t_build_14",
    "projectId": "p1",
    "parentId": "p1_stage_build",
    "name": "QA of build",
    "description": "Responsibility: Intacct PS\nNotes: Internal Only, Key Implementation Spot Checks (SDD Referenced).",
    "durationDays": 1.0,
    "assignedConsultantId": "c2",
    "predecessorIds": [
      "p1_t_build_13"
    ],
    "status": "not_started"
  },
  {
    "id": "p1_t_build_15",
    "projectId": "p1",
    "parentId": "p1_stage_build",
    "name": "Provision of Implementation Instance",
    "description": "Responsibility: Intacct PS",
    "durationDays": 1.0,
    "assignedConsultantId": "c1",
    "predecessorIds": [
      "p1_t_build_14"
    ],
    "status": "not_started"
  },
  {
    "id": "p1_t_model_1",
    "projectId": "p1",
    "parentId": "p1_stage_model",
    "name": "UAT Kick-Off Meeting",
    "description": "Responsibility: Intacct PS, Client\nNotes: Finalise UAT Plan, Issue Log Explained.",
    "durationDays": 0.5,
    "assignedConsultantId": "c1",
    "predecessorIds": [
      "p1_t_build_15"
    ],
    "status": "not_started"
  },
  {
    "id": "p1_t_model_2",
    "projectId": "p1",
    "parentId": "p1_stage_model",
    "name": "Confirm UAT status update recurrance",
    "description": "Responsibility: Intacct PS, Client\nNotes: UAT Status Updates Scheduled, Recurrance Confirmed (Daily, Weekly).",
    "durationDays": 2.0,
    "assignedConsultantId": "c1",
    "predecessorIds": [
      "p1_t_model_1"
    ],
    "status": "not_started"
  },
  {
    "id": "p1_t_model_3",
    "projectId": "p1",
    "parentId": "p1_stage_model",
    "name": "Additional training completed",
    "description": "Responsibility: Client\nNotes: MANDATORY: Completion Is Required For UAT to commence, Attendance Monitored.",
    "durationDays": 2.0,
    "assignedConsultantId": null,
    "predecessorIds": [
      "p1_t_model_2"
    ],
    "status": "not_started"
  },
  {
    "id": "p1_t_model_4",
    "projectId": "p1",
    "parentId": "p1_stage_model",
    "name": "Complete UAT",
    "description": "Responsibility: Client\nDependency: Training",
    "durationDays": 2.0,
    "assignedConsultantId": null,
    "predecessorIds": [
      "p1_t_model_3"
    ],
    "status": "not_started"
  },
  {
    "id": "p1_t_model_5",
    "projectId": "p1",
    "parentId": "p1_stage_model",
    "name": "Business Specific Training",
    "description": "Responsibility: Intacct PS, Client\nNotes: Up To Ten (10) Hours.",
    "durationDays": 2.0,
    "assignedConsultantId": "c1",
    "predecessorIds": [
      "p1_t_model_4"
    ],
    "status": "not_started"
  },
  {
    "id": "p1_t_model_6",
    "projectId": "p1",
    "parentId": "p1_stage_model",
    "name": "Business Specific Reporting Training",
    "description": "Responsibility: Intacct PS, Client\nNotes: Up To Ten (10) Hours.",
    "durationDays": 2.0,
    "assignedConsultantId": "c1",
    "predecessorIds": [
      "p1_t_model_5"
    ],
    "status": "not_started"
  },
  {
    "id": "p1_t_model_7",
    "projectId": "p1",
    "parentId": "p1_stage_model",
    "name": "Issue Log Review",
    "description": "Responsibility: Intacct PS, Client",
    "durationDays": 0.5,
    "assignedConsultantId": "c1",
    "predecessorIds": [
      "p1_t_model_6"
    ],
    "status": "not_started"
  },
  {
    "id": "p1_t_model_8",
    "projectId": "p1",
    "parentId": "p1_stage_model",
    "name": "Production Environment Review",
    "description": "Responsibility: Intacct PS, Client\nNotes: Final Review.",
    "durationDays": 0.5,
    "assignedConsultantId": "c1",
    "predecessorIds": [
      "p1_t_model_7"
    ],
    "status": "not_started"
  },
  {
    "id": "p1_t_model_9",
    "projectId": "p1",
    "parentId": "p1_stage_model",
    "name": "Populate cut-over data (Import Templates)",
    "description": "Responsibility: Client",
    "durationDays": 1.5,
    "assignedConsultantId": null,
    "predecessorIds": [
      "p1_t_model_8"
    ],
    "status": "not_started"
  },
  {
    "id": "p1_t_model_10",
    "projectId": "p1",
    "parentId": "p1_stage_model",
    "name": "Review cut-over data (Import Templates)",
    "description": "Responsibility: Intacct PS",
    "durationDays": 0.5,
    "assignedConsultantId": "c1",
    "predecessorIds": [
      "p1_t_model_9"
    ],
    "status": "not_started"
  },
  {
    "id": "p1_t_model_11",
    "projectId": "p1",
    "parentId": "p1_stage_model",
    "name": "Review cutover tasks",
    "description": "Notes: See Deploy - Opening Balance Templates.",
    "durationDays": 0.5,
    "assignedConsultantId": null,
    "predecessorIds": [
      "p1_t_model_10"
    ],
    "status": "not_started"
  },
  {
    "id": "p1_t_model_12",
    "projectId": "p1",
    "parentId": "p1_stage_model",
    "name": "Go-Live/Deploy Acceptance Sign-Off",
    "description": "Responsibility: Intacct PS, Client\nNotes: Sign-Off Via DocuSign, Above Tasks Require Completion Prior To Deploy.",
    "durationDays": 0.5,
    "assignedConsultantId": "c1",
    "predecessorIds": [
      "p1_t_model_11"
    ],
    "status": "not_started"
  },
  {
    "id": "p1_t_model_13",
    "projectId": "p1",
    "parentId": "p1_stage_model",
    "name": "Implementation & Production Companies Finalised",
    "description": "Responsibility: Intacct PS\nNotes: Companies, environments, instances - which reference should we use?",
    "durationDays": 1.0,
    "assignedConsultantId": "c1",
    "predecessorIds": [
      "p1_t_model_12"
    ],
    "status": "not_started"
  },
  {
    "id": "p1_t_deploy_1",
    "projectId": "p1",
    "parentId": "p1_stage_deploy",
    "name": "Additional End User Training Complete (PS Demonstrations)",
    "description": "Responsibility: Intacct PS, Client",
    "durationDays": 2.0,
    "assignedConsultantId": "c1",
    "predecessorIds": [
      "p1_t_model_13"
    ],
    "status": "not_started"
  },
  {
    "id": "p1_t_deploy_2",
    "projectId": "p1",
    "parentId": "p1_stage_deploy",
    "name": "Populate final opening balance import templates",
    "description": "Responsibility: Client",
    "durationDays": 1.5,
    "assignedConsultantId": null,
    "predecessorIds": [
      "p1_t_deploy_1"
    ],
    "status": "not_started"
  },
  {
    "id": "p1_t_deploy_3",
    "projectId": "p1",
    "parentId": "p1_stage_deploy",
    "name": "Review opening balance import template",
    "description": "Responsibility: Intacct PS, Client",
    "durationDays": 0.5,
    "assignedConsultantId": "c1",
    "predecessorIds": [
      "p1_t_deploy_2"
    ],
    "status": "not_started"
  },
  {
    "id": "p1_t_deploy_4",
    "projectId": "p1",
    "parentId": "p1_stage_deploy",
    "name": "Post Go-Live (Month End) Support Delivered",
    "description": "Responsibility: Intacct PS\nNotes: Additional Training, As-Requested Assistance.",
    "durationDays": 1.0,
    "assignedConsultantId": "c1",
    "predecessorIds": [
      "p1_t_deploy_3"
    ],
    "status": "not_started"
  },
  {
    "id": "p1_t_deploy_5",
    "projectId": "p1",
    "parentId": "p1_stage_deploy",
    "name": "Project Closure Meeting Held",
    "description": "Responsibility: Intacct PS, Client",
    "durationDays": 0.5,
    "assignedConsultantId": "c1",
    "predecessorIds": [
      "p1_t_deploy_4"
    ],
    "status": "not_started"
  },
  {
    "id": "p1_t_deploy_6",
    "projectId": "p1",
    "parentId": "p1_stage_deploy",
    "name": "Welcome To Customer Support Meeting Held",
    "description": "Responsibility: Intacct PS, Client",
    "durationDays": 0.5,
    "assignedConsultantId": "c1",
    "predecessorIds": [
      "p1_t_deploy_5"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_stage_define",
    "projectId": "tmpl_sage_intacct",
    "parentId": null,
    "name": "Define Stage",
    "description": "Project initiation, discovery, BPR, and solution design.",
    "durationDays": 0,
    "assignedConsultantId": null,
    "predecessorIds": [],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_stage_build",
    "projectId": "tmpl_sage_intacct",
    "parentId": null,
    "name": "Build Stage",
    "description": "Configure company parameters, dimension rules, core financials, and master data loads.",
    "durationDays": 0,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_stage_define"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_stage_model",
    "projectId": "tmpl_sage_intacct",
    "parentId": null,
    "name": "Model Stage",
    "description": "UAT testing, operational modeling, business training, and cutover preparation.",
    "durationDays": 0,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_stage_build"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_stage_deploy",
    "projectId": "tmpl_sage_intacct",
    "parentId": null,
    "name": "Deploy Stage",
    "description": "Final Go-Live cutover balances loading, post support, and project closure.",
    "durationDays": 0,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_stage_model"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_define_1",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_define",
    "name": "Kick-off meeting (PS, EM, CSM, AM & Client)",
    "description": "Responsibility: All\nNotes: Responsibilities Assigned, High-Level Project Timeline Agreed.",
    "durationDays": 0.5,
    "assignedConsultantId": null,
    "predecessorIds": [],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_define_2",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_define",
    "name": "Publish Project plan & Training plan",
    "description": "Responsibility: Intacct PS\nNotes: Scheduled Dates Populated In Line With Agreed Project Timeline.",
    "durationDays": 2.0,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_define_1"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_define_3",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_define",
    "name": "Training complete",
    "description": "Responsibility: Client\nNotes: Mandatory Self-Paced Learning prior to Discovery sessions.",
    "durationDays": 2.0,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_define_2"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_define_4",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_define",
    "name": "Document existing business processes",
    "description": "Responsibility: Client",
    "durationDays": 1.5,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_define_3"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_define_5",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_define",
    "name": "Provide CoA & Reporting Structure",
    "description": "Responsibility: Client",
    "durationDays": 1.0,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_define_4"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_define_6",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_define",
    "name": "Business Process Review document - Initial Draft",
    "description": "Responsibility: Client\nNotes: Complete/Annotate As Appropriate.",
    "durationDays": 0.5,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_define_5"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_define_7",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_define",
    "name": "Discovery Meeting 1",
    "description": "Responsibility: Intacct PS, Client\nNotes: Business Overview, Current Solution Limitations, Business Improvements, Project Goals & Objectives, Project Plan Reviewed.",
    "durationDays": 0.5,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_define_6"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_define_8",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_define",
    "name": "Discovery Meeting 2",
    "description": "Responsibility: Intacct PS, Client\nNotes: BPR Review; Company & Security, General Ledger, AR, Order Entry.",
    "durationDays": 0.5,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_define_7"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_define_9",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_define",
    "name": "Discovery Meeting 3",
    "description": "Responsibility: Intacct PS, Client\nNotes: BPR Review; AP, Purchasing, Additional In-Scope Modules.",
    "durationDays": 0.5,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_define_8"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_define_10",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_define",
    "name": "Initial Import Template Review",
    "description": "Responsibility: Intacct PS, Client\nNotes: In-Scope Import Templates Provided, Format Explained, Examples Populated, UK VAT solution review.",
    "durationDays": 0.5,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_define_9"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_define_11",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_define",
    "name": "Populate static data (Import Templates)",
    "description": "Responsibility: Client",
    "durationDays": 1.5,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_define_10"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_define_12",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_define",
    "name": "Review static data (Import Templates)",
    "description": "Responsibility: Intacct PS",
    "durationDays": 0.5,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_define_11"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_define_13",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_define",
    "name": "Publish Solution Definition Document",
    "description": "Responsibility: Intacct PS\nNotes: Document Completed Bases On BPR & Discovery Meetings 1,2 & 3.",
    "durationDays": 1.5,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_define_12"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_define_14",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_define",
    "name": "Review Solution Definition Document",
    "description": "Responsibility: Client\nNotes: SDD Review; Document Format & Content Explained.",
    "durationDays": 0.5,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_define_13"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_define_15",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_define",
    "name": "Sign-off Solution Definition Document",
    "description": "Responsibility: Intacct PS, Client\nNotes: Phase Completion - Completed Via DocuSign.",
    "durationDays": 0.5,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_define_14"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_define_16",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_define",
    "name": "Confirm status update & report recurrance",
    "description": "Responsibility: Intacct PS, Client\nNotes: Initial Status Meeting Scheduled & Delivered, Recurrance Confirmed (Weekly, Bi-Weekly, Monthly).",
    "durationDays": 1.0,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_define_15"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_build_1",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_build",
    "name": "Populate historic TB movements (Import Templates)",
    "description": "Responsibility: Client\nNotes: UAT reporting dependency.",
    "durationDays": 1.5,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_define_16"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_build_2",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_build",
    "name": "Review historic TB movements (Import Templates)",
    "description": "Responsibility: Intacct PS",
    "durationDays": 0.5,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_build_1"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_build_3",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_build",
    "name": "Create user roles and permissions",
    "description": "Responsibility: Client\nNotes: Question over live or UAT instance?",
    "durationDays": 1.0,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_build_2"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_build_4",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_build",
    "name": "Provide test scripts",
    "description": "Responsibility: Intacct PS",
    "durationDays": 1.0,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_build_3"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_build_5",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_build",
    "name": "Update UAT Scripts to include business specific user cases",
    "description": "Responsibility: Intacct PS, Client",
    "durationDays": 2.0,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_build_4"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_build_6",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_build",
    "name": "Configure Company & Security",
    "description": "Responsibility: Intacct PS\nDependency: Static data",
    "durationDays": 1.5,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_build_5",
      "tmpl_sage_intacct_t_define_12"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_build_7",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_build",
    "name": "Configure Core Financials",
    "description": "Responsibility: Intacct PS\nDependency: Static data",
    "durationDays": 1.5,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_build_6",
      "tmpl_sage_intacct_t_define_12"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_build_8",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_build",
    "name": "Data Load - Entities, Dimensions, COA",
    "description": "Responsibility: Intacct PS\nDependency: Static data",
    "durationDays": 1.5,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_build_7",
      "tmpl_sage_intacct_t_define_12"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_build_9",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_build",
    "name": "Data Load - Customer, Suppliers, Items",
    "description": "Responsibility: Intacct PS\nDependency: Static data",
    "durationDays": 1.5,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_build_8",
      "tmpl_sage_intacct_t_define_12"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_build_10",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_build",
    "name": "Configure INSERT MODULE",
    "description": "Responsibility: Intacct PS",
    "durationDays": 1.5,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_build_9"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_build_11",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_build",
    "name": "Data Loading - INSERT TEMPLATES",
    "description": "Responsibility: Intacct PS\nNotes: Additional items?",
    "durationDays": 1.5,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_build_10"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_build_12",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_build",
    "name": "Provide sample Invoice template",
    "description": "Responsibility: Client",
    "durationDays": 1.0,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_build_11"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_build_13",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_build",
    "name": "Configure Invoice template",
    "description": "Responsibility: Intacct PS",
    "durationDays": 1.5,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_build_12"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_build_14",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_build",
    "name": "QA of build",
    "description": "Responsibility: Intacct PS\nNotes: Internal Only, Key Implementation Spot Checks (SDD Referenced).",
    "durationDays": 1.0,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_build_13"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_build_15",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_build",
    "name": "Provision of Implementation Instance",
    "description": "Responsibility: Intacct PS",
    "durationDays": 1.0,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_build_14"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_model_1",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_model",
    "name": "UAT Kick-Off Meeting",
    "description": "Responsibility: Intacct PS, Client\nNotes: Finalise UAT Plan, Issue Log Explained.",
    "durationDays": 0.5,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_build_15"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_model_2",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_model",
    "name": "Confirm UAT status update recurrance",
    "description": "Responsibility: Intacct PS, Client\nNotes: UAT Status Updates Scheduled, Recurrance Confirmed (Daily, Weekly).",
    "durationDays": 2.0,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_model_1"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_model_3",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_model",
    "name": "Additional training completed",
    "description": "Responsibility: Client\nNotes: MANDATORY: Completion Is Required For UAT to commence, Attendance Monitored.",
    "durationDays": 2.0,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_model_2"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_model_4",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_model",
    "name": "Complete UAT",
    "description": "Responsibility: Client\nDependency: Training",
    "durationDays": 2.0,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_model_3"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_model_5",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_model",
    "name": "Business Specific Training",
    "description": "Responsibility: Intacct PS, Client\nNotes: Up To Ten (10) Hours.",
    "durationDays": 2.0,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_model_4"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_model_6",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_model",
    "name": "Business Specific Reporting Training",
    "description": "Responsibility: Intacct PS, Client\nNotes: Up To Ten (10) Hours.",
    "durationDays": 2.0,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_model_5"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_model_7",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_model",
    "name": "Issue Log Review",
    "description": "Responsibility: Intacct PS, Client",
    "durationDays": 0.5,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_model_6"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_model_8",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_model",
    "name": "Production Environment Review",
    "description": "Responsibility: Intacct PS, Client\nNotes: Final Review.",
    "durationDays": 0.5,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_model_7"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_model_9",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_model",
    "name": "Populate cut-over data (Import Templates)",
    "description": "Responsibility: Client",
    "durationDays": 1.5,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_model_8"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_model_10",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_model",
    "name": "Review cut-over data (Import Templates)",
    "description": "Responsibility: Intacct PS",
    "durationDays": 0.5,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_model_9"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_model_11",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_model",
    "name": "Review cutover tasks",
    "description": "Notes: See Deploy - Opening Balance Templates.",
    "durationDays": 0.5,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_model_10"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_model_12",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_model",
    "name": "Go-Live/Deploy Acceptance Sign-Off",
    "description": "Responsibility: Intacct PS, Client\nNotes: Sign-Off Via DocuSign, Above Tasks Require Completion Prior To Deploy.",
    "durationDays": 0.5,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_model_11"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_model_13",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_model",
    "name": "Implementation & Production Companies Finalised",
    "description": "Responsibility: Intacct PS\nNotes: Companies, environments, instances - which reference should we use?",
    "durationDays": 1.0,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_model_12"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_deploy_1",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_deploy",
    "name": "Additional End User Training Complete (PS Demonstrations)",
    "description": "Responsibility: Intacct PS, Client",
    "durationDays": 2.0,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_model_13"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_deploy_2",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_deploy",
    "name": "Populate final opening balance import templates",
    "description": "Responsibility: Client",
    "durationDays": 1.5,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_deploy_1"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_deploy_3",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_deploy",
    "name": "Review opening balance import template",
    "description": "Responsibility: Intacct PS, Client",
    "durationDays": 0.5,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_deploy_2"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_deploy_4",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_deploy",
    "name": "Post Go-Live (Month End) Support Delivered",
    "description": "Responsibility: Intacct PS\nNotes: Additional Training, As-Requested Assistance.",
    "durationDays": 1.0,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_deploy_3"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_deploy_5",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_deploy",
    "name": "Project Closure Meeting Held",
    "description": "Responsibility: Intacct PS, Client",
    "durationDays": 0.5,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_deploy_4"
    ],
    "status": "not_started"
  },
  {
    "id": "tmpl_sage_intacct_t_deploy_6",
    "projectId": "tmpl_sage_intacct",
    "parentId": "tmpl_sage_intacct_stage_deploy",
    "name": "Welcome To Customer Support Meeting Held",
    "description": "Responsibility: Intacct PS, Client",
    "durationDays": 0.5,
    "assignedConsultantId": null,
    "predecessorIds": [
      "tmpl_sage_intacct_t_deploy_5"
    ],
    "status": "not_started"
  }
];

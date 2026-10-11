export const STATUSES = ["面试", "Offer", "HR", "笔试", "已投递", "待确认", "结束"] as const;
export type ApplicationStatus = (typeof STATUSES)[number];

export type Application = {
  id: string;
  company: string;
  role: string;
  status: ApplicationStatus;
  applied_at: string;
  next_action: string;
  next_action_date: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type CompanySite = {
  company: string;
  url: string;
  label: string;
  source: string;
};

export type Todo = {
  id: string;
  title: string;
  due_date: string;
  done: boolean;
  interview_id: string;
  document_id?: string;
};

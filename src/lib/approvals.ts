import type { ApprovalRule, ApproverDecision, CampaignType } from "./types";

export const DEFAULT_APPROVAL_THRESHOLD = 10000;

export const DEFAULT_APPROVAL_RULES: ApprovalRule[] = [
  {
    id: "budget",
    when: "budget_over",
    budgetUsd: DEFAULT_APPROVAL_THRESHOLD,
    approverRole: "Head of Marketing",
  },
  {
    id: "event",
    when: "type_is",
    type: "event",
    approverRole: "Events director",
  },
  {
    id: "fallback",
    when: "fallback",
    approverRole: null,
  },
];

export function resolveApprover(
  rules: ApprovalRule[],
  campaign: { type: CampaignType; budgetUsd: number },
): ApproverDecision {
  for (const rule of rules) {
    if (rule.when === "budget_over") {
      const threshold = rule.budgetUsd ?? DEFAULT_APPROVAL_THRESHOLD;
      if (campaign.budgetUsd > threshold) {
        return {
          needed: Boolean(rule.approverRole),
          approverRole: rule.approverRole,
          ruleId: rule.id,
        };
      }
    }
    if (rule.when === "type_is" && rule.type && campaign.type === rule.type) {
      return {
        needed: Boolean(rule.approverRole),
        approverRole: rule.approverRole,
        ruleId: rule.id,
      };
    }
    if (rule.when === "always") {
      return {
        needed: Boolean(rule.approverRole),
        approverRole: rule.approverRole,
        ruleId: rule.id,
      };
    }
    if (rule.when === "fallback") {
      return {
        needed: Boolean(rule.approverRole),
        approverRole: rule.approverRole,
        ruleId: rule.id,
      };
    }
  }
  return { needed: false, approverRole: null, ruleId: null };
}

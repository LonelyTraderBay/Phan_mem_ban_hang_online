/** BE-AI-006 — Tool registry, policy gateway, R0–R5 enforcement. */

export type ToolRiskClass = "R0" | "R1" | "R2" | "R3" | "R4" | "R5";

export interface ToolDefinition {
  readonly name: string;
  readonly version: string;
  readonly riskClass: ToolRiskClass;
  readonly description: string;
  readonly requiredPermission?: string;
}

export type ToolPolicyDecision = "allow" | "deny" | "require_approval";

export interface ToolPolicyResult {
  readonly decision: ToolPolicyDecision;
  readonly reason: string;
  readonly tool: ToolDefinition;
}

export const TOOL_REGISTRY: readonly ToolDefinition[] = [
  { name: "catalog.search", version: "1", riskClass: "R0", description: "Search catalog" },
  { name: "knowledge.search", version: "1", riskClass: "R0", description: "Search published knowledge" },
  {
    name: "inventory.get_available",
    version: "1",
    riskClass: "R1",
    description: "Read inventory availability",
    requiredPermission: "inventory.read"
  },
  {
    name: "customer.get_summary",
    version: "1",
    riskClass: "R1",
    description: "Read customer summary",
    requiredPermission: "customer.read"
  },
  {
    name: "order.get",
    version: "1",
    riskClass: "R1",
    description: "Read order",
    requiredPermission: "order.read"
  },
  {
    name: "order.create_draft",
    version: "1",
    riskClass: "R2",
    description: "Create draft order",
    requiredPermission: "order.write"
  },
  {
    name: "inventory.create_reservation",
    version: "1",
    riskClass: "R2",
    description: "Create inventory reservation",
    requiredPermission: "inventory.reserve"
  },
  {
    name: "conversation.queue_reply",
    version: "1",
    riskClass: "R3",
    description: "Queue outbound reply",
    requiredPermission: "conversation.reply"
  },
  {
    name: "order.confirm",
    version: "1",
    riskClass: "R4",
    description: "Confirm order",
    requiredPermission: "order.confirm"
  },
  {
    name: "payment.refund",
    version: "1",
    riskClass: "R4",
    description: "Refund payment",
    requiredPermission: "payment.refund"
  }
];

const PROHIBITED_TOOLS = new Set(["db.execute", "http.arbitrary", "secret.read"]);

export function getToolDefinition(name: string): ToolDefinition | null {
  if (PROHIBITED_TOOLS.has(name)) return null;
  return TOOL_REGISTRY.find((t) => t.name === name) ?? null;
}

export function evaluateToolPolicy(options: {
  readonly toolName: string;
  readonly actorPermissions: readonly string[];
  readonly aiMode: "copilot" | "semi_auto" | "autopilot";
  readonly hasApproval?: boolean;
}): ToolPolicyResult {
  const tool = getToolDefinition(options.toolName);
  if (!tool) {
    return {
      decision: "deny",
      reason: "Tool not registered or prohibited (R5).",
      tool: {
        name: options.toolName,
        version: "0",
        riskClass: "R5",
        description: "prohibited"
      }
    };
  }

  if (tool.riskClass === "R5") {
    return { decision: "deny", reason: "R5 prohibited tool.", tool };
  }

  if (tool.requiredPermission && !options.actorPermissions.includes(tool.requiredPermission)) {
    return { decision: "deny", reason: "Missing tool permission.", tool };
  }

  if (tool.riskClass === "R4") {
    return {
      decision: options.hasApproval ? "allow" : "require_approval",
      reason: "R4 requires human approval.",
      tool
    };
  }

  if (tool.riskClass === "R3" && options.aiMode === "copilot" && !options.hasApproval) {
    return { decision: "require_approval", reason: "R3 requires approval in copilot mode.", tool };
  }

  if (tool.riskClass === "R2" && options.aiMode === "autopilot") {
    return { decision: "require_approval", reason: "R2 mutation gated in autopilot.", tool };
  }

  return { decision: "allow", reason: "Policy allow.", tool };
}

export async function invokeToolStub(
  toolName: string,
  _input: Record<string, unknown>
): Promise<{ readonly ok: true; readonly output: Record<string, unknown> }> {
  return { ok: true, output: { tool: toolName, stub: true } };
}

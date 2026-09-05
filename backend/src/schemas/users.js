const { z } = require("zod");
const { requiredString, requiredEmail } = require("./common");

const USER_STATUSES = ["AWAITING_EMAIL_VERIFICATION", "ACTIVE", "INACTIVE", "SUSPENDED"];

const createRoleSchema = z.object({
  role_name: requiredString("role_name"),
  description: z.string().optional(),
  permission_ids: z.array(z.string()).optional(),
});

// make_agent implies agent_code is required — expressed once here and reused
// by both create and update, rather than re-checked in each route.
const requiresAgentCodeWhenMakingAgent = (data) => !data.make_agent || Boolean(data.agent_code);
const agentCodeRefinement = {
  message: "agent_code is required to register this user as an agent",
  path: ["agent_code"],
};

const createUserSchema = z
  .object({
    email: requiredEmail(),
    first_name: requiredString("first_name"),
    last_name: requiredString("last_name"),
    role_id: requiredString("role_id"),
    permission_ids: z.array(z.string()).optional(),
    make_agent: z.boolean().optional(),
    agent_code: z.string().optional(),
  })
  .refine(requiresAgentCodeWhenMakingAgent, agentCodeRefinement);

// A PATCH only ever touches whichever fields are present — each one is
// optional here, and the route independently checks the caller has
// permission for whichever field group they're actually changing.
const updateUserSchema = z
  .object({
    full_name: z.string().min(1).optional(),
    email: z.string().email("email must be a valid email address").optional(),
    status: z.enum(USER_STATUSES).optional(),
    role_id: z.string().min(1).optional(),
    permission_ids: z.array(z.string()).optional(),
    reset_password: z.boolean().optional(),
    make_agent: z.boolean().optional(),
    agent_code: z.string().optional(),
  })
  .refine(requiresAgentCodeWhenMakingAgent, agentCodeRefinement);

const updateRolePermissionsSchema = z.object({
  permission_ids: z.array(z.string()),
});

module.exports = { createRoleSchema, createUserSchema, updateUserSchema, updateRolePermissionsSchema };

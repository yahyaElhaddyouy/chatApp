const sdk = require("node-appwrite");

const DATABASE_ID = "697baca3000c020a5b31";
const CONVERSATIONS_COL = "conversations";
const MEMBERSHIPS_COL = "memberships";

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

function parseBody(context) {
  if (context.req.body) return context.req.body;
  if (context.req.bodyRaw) {
    try {
      return JSON.parse(context.req.bodyRaw);
    } catch {
      return {};
    }
  }
  return {};
}

function genIntId() {
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}

module.exports = async (context) => {
  try {
    // Retrieve the request body
    const body = await getBodyJson(context.req);  // This will fetch the request body
    context.log("Received request body:", body);  // Log the body for debugging

    const { action, otherEmail, userId } = body;

    // Ensure action is present
    if (!action) {
      context.log("Missing action in request body.");  // Log if action is missing
      return json(context, 400, { ok: false, error: "MISSING_ACTION" });
    }

    // Log the action for debugging purposes
    context.log("Action received:", action);

    // Proceed with action processing
    if (action === "createDm") {
      const nowIso = new Date().toISOString();

      // Ensure userId and otherEmail are provided
      if (!otherEmail || !userId) {
        return json(context, 400, { ok: false, error: "MISSING_FIELDS" });
      }

      // Find the user by email (using Appwrite's Users API)
      const users = new sdk.Users(client);
      const userList = await users.list([sdk.Query.equal("email", otherEmail), sdk.Query.limit(1)]);

      if (!userList.users || userList.users.length === 0) {
        return json(context, 404, { ok: false, error: "USER_NOT_FOUND" });
      }

      const otherUser = userList.users[0];

      // Prevent creating a DM with yourself
      if (userId === otherUser.$id) {
        return json(context, 400, { ok: false, error: "CANNOT_DM_SELF" });
      }

      // Create the conversation
      const conversation = await db.createDocument(DATABASE_ID, CONVERSATIONS_COL, sdk.ID.unique(), {
        type: "dm",
        createdBy: userId,
        createdAt: nowIso,
        lastMessageText: "",
        lastMessageAt: null,
        lastMessageSenderId: null,
      }, perms);

      // Create membership documents for both users
      await createMembership(userId, conversation.$id, nowIso);
      await createMembership(otherUser.$id, conversation.$id, nowIso);

      return json(context, 200, { ok: true, conversation, reused: false });
    }

    return json(context, 404, { ok: false, error: "UNKNOWN_ACTION", action });

  } catch (e) {
    context.error("Error processing the request:", e);
    return json(context, 500, { ok: false, error: e.message });
  }
};


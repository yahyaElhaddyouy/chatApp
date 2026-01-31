const sdk = require("node-appwrite");

const DATABASE_ID = "697baca3000c020a5b31";  // Your Database ID
const CONVERSATIONS_COL = "conversations";    // Conversations collection
const MEMBERSHIPS_COL = "memberships";        // Memberships collection
const MESSAGES_COL = "messages";              // Messages collection

// Helper to return JSON response
function json(res, status, body) {
  if (res) {
    return res.json(body, status);  // Ensure res is defined
  }
  return { error: "Response object not found." };  // Return error if res is undefined
}

// Helper to handle request body JSON parsing
async function getBodyJson(req) {
  if (req.bodyJson && typeof req.bodyJson === "object") return req.bodyJson;

  const raw = req.body;
  if (!raw) return {};
  if (typeof raw === "object") return raw;

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// Function to generate a unique membershipId (Integer)
function genIntId() {
  const ts = Date.now(); // 13-digit timestamp
  const rnd = Math.floor(Math.random() * 1000); // Random 3 digits
  return ts * 1000 + rnd; // Unique integer
}

// Function to check if a user is a member of a conversation
async function assertMember(db, userId, conversationId) {
  const list = await db.listDocuments(DATABASE_ID, MEMBERSHIPS_COL, [
    sdk.Query.equal("conversationId", conversationId),
    sdk.Query.equal("userId", userId),
    sdk.Query.limit(1),
  ]);

  if (!list.documents || list.documents.length === 0) {
    const err = new Error("NOT_A_MEMBER");
    err.code = 403;
    throw err;
  }

  return list.documents[0];
}

// Main function to handle actions
module.exports = async (context) => {
  try {
    const { req, res, log, error, client, db } = context;

    // Retrieve the request body
    const body = await getBodyJson(req);  // This will fetch the request body
    console.log("Received request body:", body);  // Log the body for debugging

    const { action, otherEmail, userId } = body;

    // Ensure action is present
    if (!action) {
      console.log("Missing action in request body.");  // Log if action is missing
      return json(res, 400, { ok: false, error: "MISSING_ACTION" });
    }

    // Log the action for debugging purposes
    console.log("Action received:", action);

    // Proceed with action processing
    if (action === "createDm") {
      const nowIso = new Date().toISOString();

      // Ensure userId and otherEmail are provided
      if (!otherEmail || !userId) {
        return json(res, 400, { ok: false, error: "MISSING_FIELDS" });
      }

      // Find the user by email (using Appwrite's Users API)
      const users = new sdk.Users(client);
      const userList = await users.list([sdk.Query.equal("email", otherEmail), sdk.Query.limit(1)]);

      if (!userList.users || userList.users.length === 0) {
        return json(res, 404, { ok: false, error: "USER_NOT_FOUND" });
      }

      const otherUser = userList.users[0];

      // Prevent creating a DM with yourself
      if (userId === otherUser.$id) {
        return json(res, 400, { ok: false, error: "CANNOT_DM_SELF" });
      }

      // Define conversation permissions
      const perms = [
        `read("user:${userId}")`,
        `read("user:${otherUser.$id}")`,
        `update("user:${userId}")`,
        `update("user:${otherUser.$id}")`,
        `delete("user:${userId}")`,
        `delete("user:${otherUser.$id}")`,
      ];

      // Create the conversation
      const conversation = await db.createDocument(DATABASE_ID, CONVERSATIONS_COL, sdk.ID.unique(), {
        type: "dm",
        createdBy: userId,
        createdAt: nowIso,
        lastMessageText: "",
        lastMessageAt: null,
        lastMessageSenderId: null,
      }, perms);

      // Create membership for the first user
      const teamIdInt = 1; // Integer required
      const roleValue = "member";
      const statusValue = "active";

      await db.createDocument(DATABASE_ID, MEMBERSHIPS_COL, sdk.ID.unique(), {
        membershipId: genIntId(),
        teamId: teamIdInt,
        role: roleValue,
        membershipStatus: statusValue,
        joinedAt: nowIso,
        conversationId: conversation.$id,
        userId: userId,
        pinned: false,
        archived: false,
      }, perms);

      // Create membership for the second user
      await db.createDocument(DATABASE_ID, MEMBERSHIPS_COL, sdk.ID.unique(), {
        membershipId: genIntId(),
        teamId: teamIdInt,
        role: roleValue,
        membershipStatus: statusValue,
        joinedAt: nowIso,
        conversationId: conversation.$id,
        userId: otherUser.$id,
        pinned: false,
        archived: false,
      }, perms);

      console.log("Conversation data:", conversation);
      if (!conversation) {
        return json(res, 404, { ok: false, error: "Conversation not found" });
      }

      return json(res, 200, { ok: true, conversation, reused: false });
    }

    return json(res, 404, { ok: false, error: "UNKNOWN_ACTION", action });

  } catch (e) {
    console.error("Error processing the request:", e);  // Log error for debugging
    return json(res, 500, { ok: false, error: e.message });
  }
};

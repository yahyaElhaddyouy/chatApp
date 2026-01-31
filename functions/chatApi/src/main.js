const sdk = require("node-appwrite");

const DATABASE_ID = "697baca3000c020a5b31";  // Your Database ID
const CONVERSATIONS_COL = "conversations";    // Conversations collection
const MEMBERSHIPS_COL = "memberships";        // Memberships collection
const MESSAGES_COL = "messages";              // Messages collection

// Helper to return JSON response
function json(res, status, body) {
  if (res) {
    return res.json(body, status);  // Ensure res is defined and passed properly
  }
  console.error("Response object not defined");  // Log the error if 'res' is undefined
  return { error: "Response object not found." };  // Return error if res is undefined
}

// Helper to handle request body JSON parsing
async function getBodyJson(req) {
  if (req.bodyJson && typeof req.bodyJson === "object") return req.bodyJson;

  const raw = req.body;
  if (!raw) return {};
  if (typeof raw === "object") return raw;

  try {
    return JSON.parse(raw); // Parse string to JSON
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

// Function to create a new Direct Message (DM) conversation
module.exports = async function (req, res) {
  try {
    const client = new sdk.Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)  // Endpoint for Appwrite Function
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)    // Project ID
      .setKey(process.env.APPWRITE_API_KEY);                    // API Key for Appwrite

    const db = new sdk.Databases(client);
    const users = new sdk.Users(client);

    // Ensure the body is correctly parsed
    const body = await getBodyJson(req);
    console.log("Received request body:", body);  // Log the request body using console.log

    const action = body.action;
    const userId = body.userId; // Expecting this from the frontend

    if (!action) return json(res, 400, { ok: false, code: "MISSING_ACTION" });

    // Handle Create DM action
    if (action === "createDm") {
      const otherEmail = body.otherEmail;
      if (!otherEmail) return json(res, 400, { ok: false, code: "MISSING_OTHER_EMAIL" });

      // Find the other user by email
      const userList = await users.list([sdk.Query.equal("email", otherEmail), sdk.Query.limit(1)]);
      if (!userList.users || userList.users.length === 0) {
        return json(res, 404, { ok: false, code: "USER_NOT_FOUND" });
      }

      const otherUser = userList.users[0];

      // Prevent sending a DM to yourself
      if (userId === otherUser.$id) {
        return json(res, 400, { ok: false, code: "CANNOT_DM_SELF" });
      }

      const nowIso = new Date().toISOString();

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
        title: "",
        photoUrl: "",
        createdBy: userId,
        createdAt: nowIso,
        lastMessageText: "",
        lastMessageAt: null,
        lastMessageSenderId: null,
      }, perms);

      if (!conversation) {
        return json(res, 404, { ok: false, error: "Conversation not found" });
      }

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

      return json(res, 200, { ok: true, conversation, reused: false });
    }

    // Return 404 if the action is not recognized
    return json(res, 404, { ok: false, code: "UNKNOWN_ACTION", action });
  } catch (e) {
    console.error("Error in function:", e);
    return res.json({ ok: false, error: e.message }, 500);
  }
};

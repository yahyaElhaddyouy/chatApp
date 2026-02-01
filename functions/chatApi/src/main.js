const sdk = require("node-appwrite");

const DATABASE_ID = "697baca3000c020a5b31";  // Your Database ID
const CONVERSATIONS_COL = "conversations";    // Conversations collection
const MEMBERSHIPS_COL = "memberships";        // Memberships collection
const USERS_COL = "users";                    // Users collection

// Initialize the client for Users API and Database
const client = new sdk.Client();
client.setEndpoint('https://nyc.cloud.appwrite.io/v1');
    client.setProject('697b95cd000a52d5cf5b');
    client.setKey(process.env.APPWRITE_API_KEY);

const db = new sdk.Databases(client);
const users = new sdk.Users(client);

// Helper to return JSON response
function json(status, body) {
  return {
    statusCode: status,
    body: JSON.stringify(body)
  };
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

// Main function to handle actions
module.exports = async (context) => {
  try {
    const { req, res, log, error } = context;

    // Retrieve the request body
    const body = await getBodyJson(req);
    log("Received request body:", body);

    const { action, otherEmail, userId } = body;

    // Ensure action is present
    if (!action) {
      log("Missing action in request body.");
      return json(400, { ok: false, error: "MISSING_ACTION" });
    }

    log("Action received:", action);

    // Get the current user ID from headers
    const currentUserId = req.headers['x-appwrite-user-id'];
    if (!currentUserId) {
      return json(401, { ok: false, error: "UNAUTHORIZED" });
    }

    // Process the action based on the type
    if (action === "createDm") {
      return await createDm(context, otherEmail, userId, currentUserId);
    }

    if (action === "listConversations") {
      return await listConversations(context, currentUserId);
    }

    return json(404, { ok: false, error: "UNKNOWN_ACTION", action });

  } catch (e) {
    console.error("Error processing the request:", e); // Log error for debugging
    return json(500, { ok: false, error: e.message });
  }
};

// Function to create a new DM
async function createDm(context, otherEmail, userId, currentUserId) {
  try {
    const nowIso = new Date().toISOString();

    // Ensure userId and otherEmail are provided
    if (!otherEmail || !userId) {
      return json(400, { ok: false, error: "MISSING_FIELDS" });
    }

    // Find the user by email (using Appwrite's Users API)
    const userList = await users.list([sdk.Query.equal("email", otherEmail), sdk.Query.limit(1)]);

    if (!userList.users || userList.users.length === 0) {
      return json(404, { ok: false, error: "USER_NOT_FOUND" });
    }

    const otherUser = userList.users[0];

    // Prevent creating a DM with yourself
    if (userId === otherUser.$id) {
      return json(400, { ok: false, error: "CANNOT_DM_SELF" });
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

    return json(200, { ok: true, conversation, reused: false });
  } catch (e) {
    console.error("Error creating DM:", e);
    return json(500, { ok: false, error: e.message });
  }
}

// Function to list conversations for a specific user
async function listConversations(context, userId) {
  try {
    // Query memberships for the current user
    const membershipsList = await db.listDocuments(DATABASE_ID, MEMBERSHIPS_COL, [
      sdk.Query.equal("userId", userId),
    ]);

    if (!membershipsList.documents || membershipsList.documents.length === 0) {
      return json(200, { ok: true, conversations: [] });
    }

    const conversations = [];

    for (const membership of membershipsList.documents) {
      const conversationId = membership.conversationId;

      // Fetch conversation details
      const conversation = await db.getDocument(DATABASE_ID, CONVERSATIONS_COL, conversationId);

      // Find the other user in the membership
      const otherUserId = membership.userId === userId ? membership.otherUserId : membership.userId;
      const otherUser = await users.get(otherUserId);

      // Construct the conversation response
      conversations.push({
        $id: conversation.$id,
        title: otherUser.name || otherUser.email,  // Add the other user's name as the title
        lastMessageText: conversation.lastMessageText || 'No messages',
        lastMessageAt: conversation.lastMessageAt || null,
      });
    }

    return json(200, { ok: true, conversations });
  } catch (e) {
    console.error("Error listing conversations:", e);
    return json(500, { ok: false, error: e.message });
  }
}

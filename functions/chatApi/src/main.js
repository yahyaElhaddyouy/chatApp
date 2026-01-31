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
    const body = parseBody(context);
    context.log("REQUEST BODY:", body);

    const { action, otherEmail, userId } = body;

    if (!action) {
      return json(400, { ok: false, error: "MISSING_ACTION" });
    }

    const client = new sdk.Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
      .setKey(process.env.APPWRITE_API_KEY);

    const db = new sdk.Databases(client);
    const users = new sdk.Users(client);

    // ================= CREATE DM =================
    if (action === "createDm") {
      if (!userId || !otherEmail) {
        return json(400, { ok: false, error: "MISSING_FIELDS" });
      }

      const userList = await users.list([
        sdk.Query.equal("email", otherEmail),
        sdk.Query.limit(1),
      ]);

      if (!userList.users.length) {
        return json(404, { ok: false, error: "USER_NOT_FOUND" });
      }

      const otherUser = userList.users[0];

      if (otherUser.$id === userId) {
        return json(400, { ok: false, error: "CANNOT_DM_SELF" });
      }

      const now = new Date().toISOString();

      const permissions = [
        `read("user:${userId}")`,
        `read("user:${otherUser.$id}")`,
        `update("user:${userId}")`,
        `update("user:${otherUser.$id}")`,
      ];

      const conversation = await db.createDocument(
        DATABASE_ID,
        CONVERSATIONS_COL,
        sdk.ID.unique(),
        {
          type: "dm",
          createdBy: userId,
          createdAt: now,
          lastMessageText: "",
        },
        permissions
      );

      await db.createDocument(
        DATABASE_ID,
        MEMBERSHIPS_COL,
        sdk.ID.unique(),
        {
          membershipId: genIntId(),
          teamId: 1,
          role: "member",
          membershipStatus: "active",
          joinedAt: now,
          conversationId: conversation.$id,
          userId,
        },
        permissions
      );

      await db.createDocument(
        DATABASE_ID,
        MEMBERSHIPS_COL,
        sdk.ID.unique(),
        {
          membershipId: genIntId(),
          teamId: 1,
          role: "member",
          membershipStatus: "active",
          joinedAt: now,
          conversationId: conversation.$id,
          userId: otherUser.$id,
        },
        permissions
      );

      return json(200, { ok: true, conversation });
    }

    return json(404, { ok: false, error: "UNKNOWN_ACTION" });

  } catch (err) {
    context.error(err);
    return json(500, { ok: false, error: err.message });
  }
};

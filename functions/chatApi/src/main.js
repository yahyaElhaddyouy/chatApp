const sdk = require("node-appwrite");

function asString(v) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function json(res, status, body) {
  return res.json(body, status);
}

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

/**
 * membershipId must be integer (required in your schema).
 * We generate a likely-unique integer using timestamp + random.
 * Must fit in JS safe integer and Appwrite integer range.
 */
function genIntId() {
  // 13-digit timestamp + 3-digit random => up to 16 digits, still within 9.22e18
  const ts = Date.now(); // ~13 digits
  const rnd = Math.floor(Math.random() * 1000); // 0..999
  return ts * 1000 + rnd; // integer
}

async function assertMember(db, databaseId, membershipsCol, conversationId, userId) {
  const list = await db.listDocuments(databaseId, membershipsCol, [
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

module.exports = async ({ req, res, log, error }) => {
  try {
    const client = new sdk.Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
      .setKey(process.env.APPWRITE_API_KEY);

    const db = new sdk.Databases(client);
    const users = new sdk.Users(client);

    const body = await getBodyJson(req);

    const action = asString(body.action).trim();
    const databaseId = asString(body.databaseId).trim();
    const conversationsCol = asString(body.conversationsCollectionId).trim();
    const membershipsCol = asString(body.membershipsCollectionId).trim();
    const messagesCol = asString(body.messagesCollectionId).trim();

    if (!action) return json(res, 400, { ok: false, code: "MISSING_ACTION" });
    if (!databaseId || !conversationsCol || !membershipsCol || !messagesCol) {
      return json(res, 400, { ok: false, code: "MISSING_COLLECTION_IDS" });
    }

    // Appwrite header set when using createExecution while logged-in
    const authUserId = asString(
      req.headers?.["x-appwrite-user-id"] || req.headers?.["X-Appwrite-User-Id"]
    ).trim();

    if (!authUserId) return json(res, 401, { ok: false, code: "NO_AUTH_USER" });

    // ========= ACTION: createDm =========
    if (action === "createDm") {
      const otherEmail = asString(body.otherEmail).trim().toLowerCase();
      if (!otherEmail) return json(res, 400, { ok: false, code: "MISSING_OTHER_EMAIL" });

      // Find other user by email
      const userList = await users.list([
        sdk.Query.equal("email", otherEmail),
        sdk.Query.limit(1),
      ]);

      if (!userList.users || userList.users.length === 0) {
        return json(res, 404, { ok: false, code: "USER_NOT_FOUND" });
      }

      const otherUser = userList.users[0];
      if (authUserId === otherUser.$id) {
        return json(res, 400, { ok: false, code: "CANNOT_DM_SELF" });
      }

      const nowIso = new Date().toISOString();

      // Conversation permissions
      const perms = [
        `read("user:${authUserId}")`,
        `read("user:${otherUser.$id}")`,
        `update("user:${authUserId}")`,
        `update("user:${otherUser.$id}")`,
        `delete("user:${authUserId}")`,
        `delete("user:${otherUser.$id}")`,
      ];

      // Create conversation (your schema shows teamId is string and nullable, so keep null)
      const conversation = await db.createDocument(
        databaseId,
        conversationsCol,
        sdk.ID.unique(),
        {
          type: "dm",
          title: "",
          photoUrl: "",
          teamId: null,
          createdBy: authUserId,
          createdAt: nowIso,
          lastMessageText: "",
          lastMessageAt: null,
          lastMessageSenderId: null,
        },
        perms
      );

      // Create memberships — MUST satisfy required fields in your memberships schema
      const teamIdInt = 1; // integer, min 1
      const roleValue = "member";
      const statusValue = "active";

      // membership for me
      await db.createDocument(
        databaseId,
        membershipsCol,
        sdk.ID.unique(),
        {
          membershipId: genIntId(),          // ✅ integer required
          teamId: teamIdInt,                // ✅ integer required
          role: roleValue,                  // ✅ enum required
          membershipStatus: statusValue,    // ✅ enum required
          joinedAt: nowIso,                 // ✅ datetime required
          lastReadAt: nowIso,               // optional but useful
          conversationId: conversation.$id,  // string
          userId: authUserId,               // ✅ string required
          pinned: false,
          archived: false,
        },
        perms
      );

      // membership for other user
      await db.createDocument(
        databaseId,
        membershipsCol,
        sdk.ID.unique(),
        {
          membershipId: genIntId(),          // ✅ integer required
          teamId: teamIdInt,                // ✅ integer required
          role: roleValue,                  // ✅ enum required
          membershipStatus: statusValue,    // ✅ enum required
          joinedAt: nowIso,                 // ✅ datetime required
          lastReadAt: null,
          conversationId: conversation.$id,
          userId: otherUser.$id,
          pinned: false,
          archived: false,
        },
        perms
      );

      return json(res, 200, { ok: true, conversation, reused: false });
    }

    // ========= ACTION: sendMessage =========
    if (action === "sendMessage") {
      const conversationId = asString(body.conversationId).trim();
      const text = asString(body.text).trim();

      if (!conversationId || !text) return json(res, 400, { ok: false, code: "MISSING_FIELDS" });
      if (text.length > 2000) return json(res, 400, { ok: false, code: "TEXT_TOO_LONG" });

      // Must be member
      await assertMember(db, databaseId, membershipsCol, conversationId, authUserId);

      // Get conversation (to reuse permissions)
      const convo = await db.getDocument(databaseId, conversationsCol, conversationId);

      const nowIso = new Date().toISOString();

      // IMPORTANT: your messages schema currently requires integers for messageId, conversationId, senderId.
      // If you did NOT change schema yet, this will fail.
      // Best: change messages.conversationId and messages.senderId to string, and remove messageId required.
      const message = await db.createDocument(
        databaseId,
        messagesCol,
        sdk.ID.unique(),
        {
          // If your schema still requires messageId integer:
          messageId: genIntId(),
          // If your schema still requires conversationId integer, you MUST change it to string.
          // Here we assume you will change it to string:
          conversationId: conversationId,
          // Same for senderId: should be string in schema
          senderId: authUserId,
          text,
          createdAt: nowIso,
        },
        convo.$permissions
      );

      // Update conversation
      await db.updateDocument(databaseId, conversationsCol, conversationId, {
        lastMessageText: text,
        lastMessageAt: nowIso,
        lastMessageSenderId: authUserId,
      });

      // Update member lastReadAt
      const member = await assertMember(db, databaseId, membershipsCol, conversationId, authUserId);
      await db.updateDocument(databaseId, membershipsCol, member.$id, {
        lastReadAt: nowIso,
        lastModifiedAt: nowIso,
      });

      return json(res, 200, { ok: true, message });
    }

    // ========= ACTION: markRead =========
    if (action === "markRead") {
      const conversationId = asString(body.conversationId).trim();
      if (!conversationId) return json(res, 400, { ok: false, code: "MISSING_CONVERSATION_ID" });

      const nowIso = new Date().toISOString();

      const member = await assertMember(db, databaseId, membershipsCol, conversationId, authUserId);

      await db.updateDocument(databaseId, membershipsCol, member.$id, {
        lastReadAt: nowIso,
        lastModifiedAt: nowIso,
      });

      return json(res, 200, { ok: true });
    }

    return json(res, 404, { ok: false, code: "UNKNOWN_ACTION", action });
  } catch (e) {
    error(String(e));
    const status = e && typeof e === "object" && e.code ? e.code : 500;
    return json(res, status, { ok: false, error: String(e) });
  }
};

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

async function findMembership(db, databaseId, membershipsCol, conversationId, userId) {
  const list = await db.listDocuments(databaseId, membershipsCol, [
    sdk.Query.equal("conversationId", conversationId),
    sdk.Query.equal("userId", userId),
    sdk.Query.limit(1),
  ]);
  return list.documents?.[0] || null;
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

    // Provided by Appwrite when calling createExecution while logged-in
    const authUserId = asString(
      req.headers?.["x-appwrite-user-id"] || req.headers?.["X-Appwrite-User-Id"]
    ).trim();

    if (!authUserId) return json(res, 401, { ok: false, code: "NO_AUTH_USER" });

    // =========================
    // createDm
    // =========================
    if (action === "createDm") {
      const otherEmail = asString(body.otherEmail).trim().toLowerCase();
      if (!otherEmail) return json(res, 400, { ok: false, code: "MISSING_OTHER_EMAIL" });

      const userList = await users.list([sdk.Query.equal("email", otherEmail), sdk.Query.limit(1)]);
      if (!userList.users || userList.users.length === 0) {
        return json(res, 404, { ok: false, code: "USER_NOT_FOUND" });
      }

      const otherUser = userList.users[0];
      if (authUserId === otherUser.$id) {
        return json(res, 400, { ok: false, code: "CANNOT_DM_SELF" });
      }

      const nowIso = new Date().toISOString();

      const perms = [
        `read("user:${authUserId}")`,
        `read("user:${otherUser.$id}")`,
        `update("user:${authUserId}")`,
        `update("user:${otherUser.$id}")`,
        `delete("user:${authUserId}")`,
        `delete("user:${otherUser.$id}")`,
      ];

      const conversation = await db.createDocument(
        databaseId,
        conversationsCol,
        sdk.ID.unique(),
        {
          type: "dm",
          title: "",
          photoUrl: "",
          teamId: null, // keep if your schema allows null
          createdBy: authUserId,
          createdAt: nowIso,
          lastMessageText: "",
          lastMessageAt: null,
          lastMessageSenderId: null,
        },
        perms
      );

      // memberships (keep them minimal — after you removed hard required fields / set defaults)
      await db.createDocument(
        databaseId,
        membershipsCol,
        sdk.ID.unique(),
        {
          conversationId: conversation.$id,
          userId: authUserId,
          joinedAt: nowIso,
          lastReadAt: nowIso,
          // role, membershipStatus, teamId, membershipId should have defaults or be optional
        },
        perms
      );

      await db.createDocument(
        databaseId,
        membershipsCol,
        sdk.ID.unique(),
        {
          conversationId: conversation.$id,
          userId: otherUser.$id,
          joinedAt: nowIso,
          lastReadAt: null,
        },
        perms
      );

      return json(res, 200, { ok: true, conversation, reused: false });
    }

    // =========================
    // sendMessage
    // =========================
    if (action === "sendMessage") {
      const conversationId = asString(body.conversationId).trim();
      const text = asString(body.text).trim();
      if (!conversationId || !text) return json(res, 400, { ok: false, code: "MISSING_FIELDS" });
      if (text.length > 2000) return json(res, 400, { ok: false, code: "TEXT_TOO_LONG" });

      const member = await findMembership(db, databaseId, membershipsCol, conversationId, authUserId);
      if (!member) return json(res, 403, { ok: false, code: "NOT_A_MEMBER" });

      const convo = await db.getDocument(databaseId, conversationsCol, conversationId);
      const nowIso = new Date().toISOString();

      const message = await db.createDocument(
        databaseId,
        messagesCol,
        sdk.ID.unique(),
        {
          conversationId,        // ✅ string
          senderId: authUserId,  // ✅ string
          text,
          createdAt: nowIso,     // datetime in schema
        },
        convo.$permissions
      );

      await db.updateDocument(databaseId, conversationsCol, conversationId, {
        lastMessageText: text,
        lastMessageAt: nowIso,
        lastMessageSenderId: authUserId,
      });

      return json(res, 200, { ok: true, message });
    }

    // =========================
    // markRead
    // =========================
    if (action === "markRead") {
      const conversationId = asString(body.conversationId).trim();
      if (!conversationId) return json(res, 400, { ok: false, code: "MISSING_CONVERSATION_ID" });

      const member = await findMembership(db, databaseId, membershipsCol, conversationId, authUserId);
      if (!member) return json(res, 403, { ok: false, code: "NOT_A_MEMBER" });

      const nowIso = new Date().toISOString();
      await db.updateDocument(databaseId, membershipsCol, member.$id, {
        lastReadAt: nowIso,
        lastModifiedAt: nowIso,
      });

      return json(res, 200, { ok: true });
    }

    return json(res, 404, { ok: false, code: "UNKNOWN_ACTION", action });
  } catch (e) {
    const msg = String(e);
    return json(res, 500, { ok: false, error: msg });
  }
};

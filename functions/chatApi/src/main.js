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

async function assertMember(db, databaseId, membershipsCol, conversationId, userId) {
  const list = await db.listDocuments(
    databaseId,
    membershipsCol,
    [
      sdk.Query.equal("conversationId", conversationId),
      sdk.Query.equal("userId", userId),
      sdk.Query.limit(1),
    ]
  );

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

    // Appwrite met souvent l'user id courant dans ce header lors d'un createExecution (SDK)
    const authUserId = asString(
      req.headers?.["x-appwrite-user-id"] || req.headers?.["X-Appwrite-User-Id"]
    ).trim();

    // =========================
    // ACTION: createDm
    // =========================
    if (action === "createDm") {
      if (!authUserId) return json(res, 401, { ok: false, code: "NO_AUTH_USER" });

      const otherEmail = asString(body.otherEmail).trim().toLowerCase();
      if (!otherEmail) return json(res, 400, { ok: false, code: "MISSING_OTHER_EMAIL" });

      // 1) trouver l'autre user par email
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

      // Permissions conversation (DM entre 2 users)
      const convoPerms = [
        `read("user:${authUserId}")`,
        `read("user:${otherUser.$id}")`,
        `update("user:${authUserId}")`,
        `update("user:${otherUser.$id}")`,
        `delete("user:${authUserId}")`,
        `delete("user:${otherUser.$id}")`,
      ];

      // 2) créer la conversation
      const conversation = await db.createDocument(
        databaseId,
        conversationsCol,
        sdk.ID.unique(),
        {
          type: "dm",
          title: "",
          photoUrl: "",
          createdBy: authUserId,
          createdAt: nowIso,
          lastMessageText: "",
          lastMessageAt: null,
          lastMessageSenderId: null,
        },
        convoPerms
      );

      // 3) créer memberships (avec membershipId REQUIRED)
      const memberPerms = convoPerms;

      await db.createDocument(
        databaseId,
        membershipsCol,
        sdk.ID.unique(),
        {
          membershipId: sdk.ID.unique(), // ✅ REQUIRED by your schema
          conversationId: conversation.$id,
          userId: authUserId,
          role: "member",
          joinedAt: nowIso,
          lastReadAt: nowIso,
        },
        memberPerms
      );

      await db.createDocument(
        databaseId,
        membershipsCol,
        sdk.ID.unique(),
        {
          membershipId: sdk.ID.unique(), // ✅ REQUIRED by your schema
          conversationId: conversation.$id,
          userId: otherUser.$id,
          role: "member",
          joinedAt: nowIso,
          lastReadAt: null,
        },
        memberPerms
      );

      return json(res, 200, { ok: true, conversation, reused: false });
    }

    // =========================
    // ACTION: sendMessage
    // =========================
    if (action === "sendMessage") {
      if (!authUserId) return json(res, 401, { ok: false, code: "NO_AUTH_USER" });

      const conversationId = asString(body.conversationId).trim();
      const text = asString(body.text).trim();

      if (!conversationId || !text) return json(res, 400, { ok: false, code: "MISSING_FIELDS" });
      if (text.length > 2000) return json(res, 400, { ok: false, code: "TEXT_TOO_LONG" });

      // Vérifier membership
      await assertMember(db, databaseId, membershipsCol, conversationId, authUserId);

      // Récupérer conversation (permissions)
      const convo = await db.getDocument(databaseId, conversationsCol, conversationId);

      const nowIso = new Date().toISOString();

      // Créer message
      const message = await db.createDocument(
        databaseId,
        messagesCol,
        sdk.ID.unique(),
        {
          conversationId,
          senderId: authUserId,
          text,
          createdAt: nowIso,
        },
        convo.$permissions
      );

      // Update conversation last message
      await db.updateDocument(databaseId, conversationsCol, conversationId, {
        lastMessageText: text,
        lastMessageAt: nowIso,
        lastMessageSenderId: authUserId,
      });

      // Update membership lastReadAt (sender) si existe
      const m = await db.listDocuments(
        databaseId,
        membershipsCol,
        [
          sdk.Query.equal("conversationId", conversationId),
          sdk.Query.equal("userId", authUserId),
          sdk.Query.limit(1),
        ]
      );

      if (m.documents && m.documents.length > 0) {
        await db.updateDocument(databaseId, membershipsCol, m.documents[0].$id, {
          lastReadAt: nowIso,
        });
      }

      return json(res, 200, { ok: true, message });
    }

    // =========================
    // ACTION: markRead
    // =========================
    if (action === "markRead") {
      if (!authUserId) return json(res, 401, { ok: false, code: "NO_AUTH_USER" });

      const conversationId = asString(body.conversationId).trim();
      if (!conversationId) return json(res, 400, { ok: false, code: "MISSING_CONVERSATION_ID" });

      const nowIso = new Date().toISOString();

      const list = await db.listDocuments(
        databaseId,
        membershipsCol,
        [
          sdk.Query.equal("conversationId", conversationId),
          sdk.Query.equal("userId", authUserId),
          sdk.Query.limit(1),
        ]
      );

      if (!list.documents || list.documents.length === 0) {
        return json(res, 403, { ok: false, code: "NOT_A_MEMBER" });
      }

      await db.updateDocument(databaseId, membershipsCol, list.documents[0].$id, {
        lastReadAt: nowIso,
      });

      return json(res, 200, { ok: true });
    }

    // Unknown action
    return json(res, 404, { ok: false, code: "UNKNOWN_ACTION", action });
  } catch (e) {
    error(String(e));
    const status = e && typeof e === "object" && e.code ? e.code : 500;
    return json(res, status, { ok: false, error: String(e) });
  }
};

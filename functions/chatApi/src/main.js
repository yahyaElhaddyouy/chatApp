const sdk = require("node-appwrite");

/* ================== CONFIG ================== */
const DATABASE_ID = "697baca3000c020a5b31";
const CONVERSATIONS_COL = "conversations";
const MEMBERSHIPS_COL = "memberships";
const MESSAGES_COL = "messages";

/* ================== HELPERS ================== */
function json(status, body) {
  return { statusCode: status, body: JSON.stringify(body) };
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

function genIntId() {
  // 13-digit timestamp + 3-digit random => fits your integer ranges
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}

function nowIso() {
  return new Date().toISOString();
}

/**
 * Build permissions for a conversation based on memberships:
 * read/update for every member (safe default).
 */
async function buildPermsForConversation(db, conversationId) {
  const ms = await db.listDocuments(DATABASE_ID, MEMBERSHIPS_COL, [
    sdk.Query.equal("conversationId", conversationId),
    sdk.Query.limit(100),
  ]);

  const userIds = (ms.documents || []).map((d) => d.userId).filter(Boolean);

  const perms = [];
  for (const uid of userIds) {
    perms.push(`read("user:${uid}")`);
    perms.push(`update("user:${uid}")`);
  }
  // Remove duplicates
  return Array.from(new Set(perms));
}

/** Ensure user is member of conversation */
async function assertMember(db, userId, conversationId) {
  const ms = await db.listDocuments(DATABASE_ID, MEMBERSHIPS_COL, [
    sdk.Query.equal("conversationId", conversationId),
    sdk.Query.equal("userId", userId),
    sdk.Query.limit(1),
  ]);
  if (!ms.documents || ms.documents.length === 0) {
    const err = new Error("NOT_A_MEMBER");
    err.code = 403;
    throw err;
  }
  return ms.documents[0];
}

/** Chunk array into batches */
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function findExistingDm(db, currentUserId, otherUserId) {
  // memberships du current user
  const myMs = await db.listDocuments(DATABASE_ID, MEMBERSHIPS_COL, [
    sdk.Query.equal("userId", currentUserId),
    sdk.Query.limit(100),
  ]);

  const memberships = myMs.documents || [];
  for (const m of memberships) {
    if (!m.conversationId) continue;

    // conversation peut être supprimée → try/catch
    let convo;
    try {
      convo = await db.getDocument(DATABASE_ID, CONVERSATIONS_COL, m.conversationId);
    } catch {
      continue;
    }

    if (convo.type !== "dm") continue;

    // vérifier que otherUser est membre de CE convo
    const otherMs = await db.listDocuments(DATABASE_ID, MEMBERSHIPS_COL, [
      sdk.Query.equal("conversationId", convo.$id),
      sdk.Query.equal("userId", otherUserId),
      sdk.Query.limit(1),
    ]);

    if ((otherMs.documents || []).length > 0) {
      return convo.$id; // DM existe déjà
    }
  }

  return null; // pas trouvé
}

/* ================== MAIN ================== */
module.exports = async (context) => {
  const { req, log } = context;

  try {
    const body = await getBodyJson(req);
    log("Received request body:", body);

    const action = body.action;
    if (!action) return json(400, { ok: false, error: "MISSING_ACTION" });

    // Use header user id when possible. If not present, fallback to body.userId (for your current Flutter calls).
    const headerUserId = req.headers["x-appwrite-user-id"];
    const currentUserId = headerUserId || body.userId;

    if (!currentUserId) {
      return json(401, { ok: false, error: "UNAUTHORIZED_NO_USER" });
    }

    // Server SDK client
    const client = new sdk.Client()
      .setEndpoint(process.env.APPWRITE_ENDPOINT)
      .setProject(process.env.APPWRITE_PROJECT_ID)
      .setKey(process.env.APPWRITE_API_KEY);

    const db = new sdk.Databases(client);
    const usersApi = new sdk.Users(client);

    /* ================== ACTION: createDm ================== */
    if (action === "createDm") {
      const otherEmail = body.otherEmail;
      if (!otherEmail) return json(400, { ok: false, error: "MISSING_OTHER_EMAIL" });

      // Find other user by email (Appwrite Auth Users)
      const found = await usersApi.list([
        sdk.Query.equal("email", otherEmail),
        sdk.Query.limit(1),
      ]);

      if (!found.users || found.users.length === 0) {
        return json(404, { ok: false, error: "USER_NOT_FOUND" });
      }

      const otherUser = found.users[0];
      if (otherUser.$id === currentUserId) {
        return json(400, { ok: false, error: "CANNOT_DM_SELF" });
      }

      // ✅ anti-duplication : chercher DM existant
      const existingId = await findExistingDm(db, currentUserId, otherUser.$id);
      if (existingId) {
        return json(200, { ok: true, conversationId: existingId, reused: true });
      }

      // Check if a DM already exists between the two users
      const existingMemberships = await db.listDocuments(DATABASE_ID, MEMBERSHIPS_COL, [
        sdk.Query.equal("userId", currentUserId),
      ]);

      for (const membership of existingMemberships.documents || []) {
        try {
          const conversation = await db.getDocument(DATABASE_ID, CONVERSATIONS_COL, membership.conversationId);
          if (conversation.type === "dm") {
            // Check if the other user is also in this conversation
            const otherMemberships = await db.listDocuments(DATABASE_ID, MEMBERSHIPS_COL, [
              sdk.Query.equal("conversationId", membership.conversationId),
              sdk.Query.equal("userId", otherUser.$id),
            ]);
            if (otherMemberships.documents && otherMemberships.documents.length > 0) {
              // DM already exists, return it
              return json(200, { ok: true, conversationId: membership.conversationId, reused: true });
            }
          }
        } catch (e) {
          // Conversation might have been deleted, skip it
          continue;
        }
      }

      const now = nowIso();
      const teamId = 1; // your schema: required, min 1
      const role = "member"; // must match your enum values
      const membershipStatus = "active"; // must match your enum values

      // Permissions for both
      const perms = [
        `read("user:${currentUserId}")`,
        `read("user:${otherUser.$id}")`,
        `update("user:${currentUserId}")`,
        `update("user:${otherUser.$id}")`,
      ];

      // Create conversation (your schema fields are strings)
      const convo = await db.createDocument(
        DATABASE_ID,
        CONVERSATIONS_COL,
        sdk.ID.unique(),
        {
          type: "dm",
          title: null,
          photoUrl: null,
          teamId: null,
          createdBy: currentUserId,
          createdAt: now,
          lastMessageText: "",
          lastMessageAt: null,
          lastMessageSenderId: null,
        },
        perms
      );

      // Create memberships (ALL required fields based on your screenshot)
      await db.createDocument(
        DATABASE_ID,
        MEMBERSHIPS_COL,
        sdk.ID.unique(),
        {
          membershipId: genIntId(),
          teamId,
          role,
          membershipStatus,
          joinedAt: now, // datetime
          conversationId: convo.$id,
          userId: currentUserId,
          pinned: false,
          archived: false,
        },
        perms
      );

      await db.createDocument(
        DATABASE_ID,
        MEMBERSHIPS_COL,
        sdk.ID.unique(),
        {
          membershipId: genIntId(),
          teamId,
          role,
          membershipStatus,
          joinedAt: now,
          conversationId: convo.$id,
          userId: otherUser.$id,
          pinned: false,
          archived: false,
        },
        perms
      );

      return json(200, { ok: true, conversationId: convo.$id });
    }

    /* ================== ACTION: listConversations ================== */
    if (action === "listConversations") {
      // 1) get memberships for current user
      const ms = await db.listDocuments(DATABASE_ID, MEMBERSHIPS_COL, [
        sdk.Query.equal("userId", currentUserId),
        sdk.Query.limit(100),
      ]);

      const memberships = ms.documents || [];
      if (memberships.length === 0) {
        return json(200, { ok: true, conversations: [] });
      }

      const conversationIds = memberships.map((m) => m.conversationId).filter(Boolean);

      // 2) fetch conversations in batches (Query.equal("$id", [...]))
      const convDocs = [];
      for (const batch of chunk(conversationIds, 100)) {
        const convRes = await db.listDocuments(DATABASE_ID, CONVERSATIONS_COL, [
          sdk.Query.equal("$id", batch),
          sdk.Query.limit(100),
        ]);
        convDocs.push(...(convRes.documents || []));
      }

      // 3) build response with "other user" name/email as title
      const out = [];

      for (const convo of convDocs) {
        // find other member
        const otherMs = await db.listDocuments(DATABASE_ID, MEMBERSHIPS_COL, [
          sdk.Query.equal("conversationId", convo.$id),
          sdk.Query.notEqual("userId", currentUserId),
          sdk.Query.limit(1),
        ]);

        const otherMembership = (otherMs.documents || [])[0];
        let title = "DM";
        let otherUserId = null;

        if (otherMembership?.userId) {
          otherUserId = otherMembership.userId;
          try {
            const otherUser = await usersApi.get(otherUserId);
            title = otherUser.name || otherUser.email || "DM";
          } catch {
            title = "DM";
          }
        }

        out.push({
          $id: convo.$id,
          type: convo.type,
          title,
          otherUserId,
          lastMessageText: convo.lastMessageText || "No messages",
          lastMessageAt: convo.lastMessageAt,
          lastMessageSenderId: convo.lastMessageSenderId,
        });
      }

      // Optional: sort by lastMessageAt / createdAt descending
      out.sort((a, b) => {
        const ta = a.lastMessageAt || "";
        const tb = b.lastMessageAt || "";
        return tb.localeCompare(ta);
      });

      return json(200, { ok: true, conversations: out });
    }

    /* ================== ACTION: sendMessage ================== */
    if (action === "sendMessage") {
      const conversationId = body.conversationId;
      const text = body.text;

      if (!conversationId || typeof conversationId !== "string") {
        return json(400, { ok: false, error: "MISSING_CONVERSATION_ID" });
      }
      if (!text || typeof text !== "string" || text.trim().length === 0) {
        return json(400, { ok: false, error: "MISSING_TEXT" });
      }

      // Ensure sender is member
      await assertMember(db, currentUserId, conversationId);

      const now = nowIso();

      // Build perms from memberships of conversation
      const perms = await buildPermsForConversation(db, conversationId);

      // Create message (match your schema required fields)
      const msg = await db.createDocument(
        DATABASE_ID,
        MESSAGES_COL,
        sdk.ID.unique(),
        {
          messageId: genIntId(),
          text: text,
          createdAt: now,     // required datetime
          updatedAt: now,     // required datetime
          conversationId: conversationId,
          senderId: currentUserId,
          // optional fields in your schema:
          readBy: null,
          type: "text",
          status: "sent",
          //deliveredAt: null,
          readAt: null,
        },
        perms
      );

      // Update conversation last message fields
      await db.updateDocument(
        DATABASE_ID,
        CONVERSATIONS_COL,
        conversationId,
        {
          lastMessageText: text,
          lastMessageAt: now,
          lastMessageSenderId: currentUserId,
        },
        perms
      );

      return json(200, { ok: true, message: msg });
    }
    /* ================== ACTION: listMessages ================== */
    if (action === "listMessages") {
      const { conversationId, limit = 50, offset = 0 } = body;

      if (!conversationId) {
        return json(400, { ok: false, error: "conversationId is required" });
      }

      // 1) Vérifier que l'utilisateur est membre de la conversation
      const membershipCheck = await db.listDocuments(
        DATABASE_ID,
        MEMBERSHIPS_COL,
        [
          sdk.Query.equal("conversationId", conversationId),
          sdk.Query.equal("userId", currentUserId),
          sdk.Query.limit(1),
        ]
      );

      if ((membershipCheck.documents || []).length === 0) {
        return json(403, { ok: false, error: "Not a member of this conversation" });
      }

      // 2) Récupérer les messages
      const res = await db.listDocuments(
        DATABASE_ID,
        MESSAGES_COL,
        [
          sdk.Query.equal("conversationId", conversationId),
          sdk.Query.orderDesc("$createdAt"),
          sdk.Query.limit(Math.min(limit, 100)),
          sdk.Query.offset(offset),
        ]
      );

      // 3) Mapper les messages (strictement selon ton schéma)
      const messages = (res.documents || []).map((m) => ({
        $id: m.$id,
        messageId: m.messageId,
        text: m.text,
        conversationId: m.conversationId,
        senderId: m.senderId,
        type: m.type,
        status: m.status,
        readBy: m.readBy,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
        readAt: m.readAt,
      }));

      return json(200, {
        ok: true,
        messages,
        total: res.total,
        limit,
        offset,
      });
    }

    /* ================== ACTION: mark Read ================== */
    if (action === "markRead") {
      const { conversationId } = body;
      if (!conversationId) return json(400, { ok: false, error: "MISSING_CONVERSATION_ID" });

      // membership du user dans cette conversation
      const ms = await db.listDocuments(DATABASE_ID, MEMBERSHIPS_COL, [
        sdk.Query.equal("conversationId", conversationId),
        sdk.Query.equal("userId", currentUserId),
        sdk.Query.limit(1),
      ]);

      const membership = (ms.documents || [])[0];
      if (!membership) return json(403, { ok: false, error: "NOT_A_MEMBER" });

      const nowIso = new Date().toISOString();

      const updated = await db.updateDocument(
        DATABASE_ID,
        MEMBERSHIPS_COL,
        membership.$id,
        { lastReadAt: nowIso }
      );

      return json(200, { ok: true, lastReadAt: updated.lastReadAt });
    }


    return json(404, { ok: false, error: "UNKNOWN_ACTION", action });

  } catch (e) {
    console.error(e);
    return json(e.code || 500, { ok: false, error: e.message });
  }
};
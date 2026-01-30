const {
  Client,
  Account,
  Databases,
  Users,
  ID,
  Permission,
  Role,
  Query,
} = require("node-appwrite");

function json(res, body, status = 200) {
  return res.json(body, status);
}

const nowIso = () => new Date().toISOString();

const reqStr = (v, name) => {
  const s = (v ?? "").toString().trim();
  if (!s) throw new Error(`${name} required`);
  return s;
};

async function userIdByEmail(users, email) {
  const r = await users.list([Query.equal("email", email)]);
  return r.users && r.users[0] ? r.users[0].$id : null;
}

module.exports = async ({ req, res, log, error }) => {
  try {
    const endpoint = process.env.APPWRITE_ENDPOINT;
    const projectId = process.env.APPWRITE_PROJECT_ID;
    const apiKey = process.env.APPWRITE_API_KEY;

    if (!endpoint || !projectId || !apiKey) {
      return json(res, { ok: false, error: "Missing env vars" }, 500);
    }

    // Appwrite user JWT header (Appwrite passes it when user executes the function)
    const userJwt = req.headers["x-appwrite-user-jwt"] || "";
    if (!userJwt) return json(res, { ok: false, error: "Not authenticated" }, 401);

    const body = req.body ? JSON.parse(req.body) : {};
    const action = (body.action || "").trim();

    const databaseId = reqStr(body.databaseId, "databaseId");
    const conversationsId = reqStr(body.conversationsCollectionId, "conversationsCollectionId");
    const membershipsId = reqStr(body.membershipsCollectionId, "membershipsCollectionId");
    const messagesId = reqStr(body.messagesCollectionId, "messagesCollectionId");

    // user client to identify caller
    const userClient = new Client().setEndpoint(endpoint).setProject(projectId).setJWT(userJwt);
    const me = await new Account(userClient).get();
    const myUserId = me.$id;

    // admin client to write docs
    const adminClient = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
    const db = new Databases(adminClient);
    const users = new Users(adminClient);

    // helper: check membership
    const isMember = async (conversationId, userId) => {
      const r = await db.listDocuments(databaseId, membershipsId, [
        Query.equal("conversationId", conversationId),
        Query.equal("userId", userId),
        Query.limit(1),
      ]);
      return (r.documents || []).length > 0;
    };

    const membersOfConversation = async (conversationId) => {
      const r = await db.listDocuments(databaseId, membershipsId, [
        Query.equal("conversationId", conversationId),
        Query.limit(200),
      ]);
      return (r.documents || []).map((d) => d.userId);
    };

    const convReadPerms = (userIds) => userIds.map((uid) => Permission.read(Role.user(uid)));
    const msgReadPerms = (userIds) => userIds.map((uid) => Permission.read(Role.user(uid)));

    // ---------- createGroup ----------
    if (action === "createGroup") {
      const title = reqStr(body.title, "title");
      const memberEmails = Array.isArray(body.memberEmails) ? body.memberEmails : [];

      const memberIds = new Set([myUserId]);
      for (const email of memberEmails) {
        const e = (email || "").toString().trim();
        if (!e) continue;
        const uid = await userIdByEmail(users, e);
        if (uid) memberIds.add(uid);
      }

      const ids = Array.from(memberIds);
      const createdAt = nowIso();

      const conv = await db.createDocument(
        databaseId,
        conversationsId,
        ID.unique(),
        {
          type: "group",
          title,
          photoUrl: "",
          createdBy: myUserId,
          createdAt,
          lastMessageText: "",
          lastMessageAt: "",
          lastMessageSenderId: "",
        },
        [
          ...convReadPerms(ids),
          Permission.update(Role.user(myUserId)),
          Permission.delete(Role.user(myUserId)),
        ]
      );

      for (const uid of ids) {
        await db.createDocument(
          databaseId,
          membershipsId,
          ID.unique(),
          {
            conversationId: conv.$id,
            userId: String(uid),
            role: uid === myUserId ? "admin" : "member",
            joinedAt: createdAt,
            lastReadAt: "",
            archived: false,
            pinned: false,
            mute: false,
          },
          [Permission.read(Role.user(uid)), Permission.update(Role.user(uid))]
        );
      }

      return json(res, { ok: true, conversation: conv });
    }

    // ---------- createDm ----------
    if (action === "createDm") {
      const otherEmail = reqStr(body.otherEmail, "otherEmail");
      const otherUserId = await userIdByEmail(users, otherEmail);
      if (!otherUserId) return json(res, { ok: false, error: "User not found" }, 404);
      if (otherUserId === myUserId) return json(res, { ok: false, error: "Cannot DM yourself" }, 400);

      // simple reuse if exists
      const myM = await db.listDocuments(databaseId, membershipsId, [
        Query.equal("userId", String(myUserId)),
        Query.limit(200),
      ]);
      const myConvIds = new Set((myM.documents || []).map((d) => d.conversationId));

      const otherM = await db.listDocuments(databaseId, membershipsId, [
        Query.equal("userId", otherUserId),
        Query.limit(200),
      ]);
      const shared = (otherM.documents || []).find((d) => myConvIds.has(d.conversationId));

      if (shared) {
        const existing = await db.getDocument(databaseId, conversationsId, shared.conversationId);
        if (existing.type === "dm") return json(res, { ok: true, conversation: existing, reused: true });
      }

      const createdAt = nowIso();
      const ids = [myUserId, otherUserId];

      const conv = await db.createDocument(
        databaseId,
        conversationsId,
        ID.unique(),
        {
          type: "dm",
          title: "",
          photoUrl: "",
          createdBy: myUserId,
          createdAt,
          lastMessageText: "",
          lastMessageAt: "",
          lastMessageSenderId: "",
        },
        [
          ...convReadPerms(ids),
          Permission.update(Role.user(myUserId)),
          Permission.delete(Role.user(myUserId)),
        ]
      );

      for (const uid of ids) {
        await db.createDocument(
          databaseId,
          membershipsId,
          ID.unique(),
          {
            conversationId: conv.$id,
            userId: uid,
            role: "member",
            joinedAt: createdAt,
            lastReadAt: "",
            archived: false,
            pinned: false,
            mute: false,
          },
          [Permission.read(Role.user(uid)), Permission.update(Role.user(uid))]
        );
      }

      return json(res, { ok: true, conversation: conv, reused: false });
    }

    // ---------- sendMessage ----------
    if (action === "sendMessage") {
      const conversationId = reqStr(body.conversationId, "conversationId");
      const text = reqStr(body.text, "text");

      if (!(await isMember(conversationId, myUserId))) {
        return json(res, { ok: false, error: "Not a member" }, 403);
      }

      const memberIds = await membersOfConversation(conversationId);
      const createdAt = nowIso();

      const msg = await db.createDocument(
        databaseId,
        messagesId,
        ID.unique(),
        {
          conversationId,
          senderId: myUserId,
          type: "text",
          text,
          createdAt,
          status: "sent",
          deliveredAt: "",
          readAt: "",
        },
        [...msgReadPerms(memberIds), Permission.delete(Role.user(myUserId))]
      );

      await db.updateDocument(databaseId, conversationsId, conversationId, {
        lastMessageText: text,
        lastMessageAt: createdAt,
        lastMessageSenderId: myUserId,
      });

      return json(res, { ok: true, message: msg });
    }

    // ---------- markRead ----------
    if (action === "markRead") {
      const conversationId = reqStr(body.conversationId, "conversationId");

      const r = await db.listDocuments(databaseId, membershipsId, [
        Query.equal("conversationId", conversationId),
        Query.equal("userId", String(myUserId)),
        Query.limit(1),
      ]);

      if (!r.documents || r.documents.length === 0) {
        return json(res, { ok: false, error: "Membership not found" }, 404);
      }

      const doc = r.documents[0];
      const updated = await db.updateDocument(databaseId, membershipsId, doc.$id, { lastReadAt: nowIso() });
      return json(res, { ok: true, membership: updated });
    }

    return json(res, { ok: false, error: "Unknown action" }, 400);
  } catch (e) {
    if (error) error(e);
    return json(res, { ok: false, error: String(e && e.message ? e.message : e) }, 500);
  }
};

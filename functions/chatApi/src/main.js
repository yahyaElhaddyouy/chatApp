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

/**
 * ====== EDIT THESE IF YOUR ENUM VALUES DIFFER ======
 */
const ROLE_ADMIN = "admin";
const ROLE_MEMBER = "member";
const STATUS_ACTIVE = "active";

/**
 * Simple JSON responder
 */
function json(res, body, status = 200) {
  return res.json(body, status);
}

const nowIso = () => new Date().toISOString();

/**
 * Required string helper
 */
const reqStr = (v, name) => {
  const s = (v ?? "").toString().trim();
  if (!s) throw new Error(`${name} required`);
  return s;
};

<<<<<<< HEAD
let membershipSeq = 0;
const nextMembershipId = () => {
  membershipSeq = (membershipSeq + 1) % 1000;
  return Date.now() * 1000 + membershipSeq; // int unique
};


=======
/**
 * Generate unique integer membershipId (because your schema requires integer)
 */
let membershipSeq = 0;
const nextMembershipId = () => {
  membershipSeq = (membershipSeq + 1) % 1000;
  return Date.now() * 1000 + membershipSeq; // integer unique
};

/**
 * Find Auth userId by email using Users API
 */
>>>>>>> bf2fe1b (Fix memberships required fields)
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

    // Provided when a logged-in user executes the function
    const userJwt = req.headers["x-appwrite-user-jwt"] || "";
    if (!userJwt) {
      return json(res, { ok: false, error: "Not authenticated" }, 401);
    }

    // Parse JSON body (Flutter sends String body)
    let body = {};
    if (req.body) {
      body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    }

    const action = (body.action || "").toString().trim();

    const databaseId = reqStr(body.databaseId, "databaseId");
    const conversationsId = reqStr(
      body.conversationsCollectionId,
      "conversationsCollectionId"
    );
    const membershipsId = reqStr(
      body.membershipsCollectionId,
      "membershipsCollectionId"
    );
    const messagesId = reqStr(body.messagesCollectionId, "messagesCollectionId");

    // User client (identify caller)
    const userClient = new Client()
      .setEndpoint(endpoint)
      .setProject(projectId)
      .setJWT(userJwt);

    const me = await new Account(userClient).get();
    const myUserId = String(me.$id);

    // Admin client (write to DB)
    const adminClient = new Client()
      .setEndpoint(endpoint)
      .setProject(projectId)
      .setKey(apiKey);

    const db = new Databases(adminClient);
    const users = new Users(adminClient);

    // Helper: check membership
    const isMember = async (conversationId, userId) => {
      const r = await db.listDocuments(databaseId, membershipsId, [
        Query.equal("conversationId", String(conversationId)),
        Query.equal("userId", String(userId)),
        Query.limit(1),
      ]);
      return (r.documents || []).length > 0;
    };

    const membersOfConversation = async (conversationId) => {
      const r = await db.listDocuments(databaseId, membershipsId, [
        Query.equal("conversationId", String(conversationId)),
        Query.limit(200),
      ]);
      return (r.documents || []).map((d) => String(d.userId));
    };

    const convReadPerms = (userIds) =>
      userIds.map((uid) => Permission.read(Role.user(String(uid))));

    const msgReadPerms = (userIds) =>
      userIds.map((uid) => Permission.read(Role.user(String(uid))));

    /**
     * ====== ACTION: createGroup ======
     * payload:
     * { title, memberEmails: [] }
     */
    if (action === "createGroup") {
      const title = reqStr(body.title, "title");
      const memberEmails = Array.isArray(body.memberEmails)
        ? body.memberEmails
        : [];

      const memberIdsSet = new Set([myUserId]);

      for (const email of memberEmails) {
        const e = (email || "").toString().trim();
        if (!e) continue;
        const uid = await userIdByEmail(users, e);
        if (uid) memberIdsSet.add(String(uid));
      }

      const ids = Array.from(memberIdsSet);
      const createdAt = nowIso();

      // Create conversation
      const conv = await db.createDocument(
        databaseId,
        conversationsId,
        ID.unique(),
        {
<<<<<<< HEAD
            membershipId: nextMembershipId(),
            conversationId: conv.$id,
            userId: String(uid),
            teamId: 1,
            role: uid === myUserId ? "admin" : "member",
            membershipStatus: "active",
          joinedAt: createdAt,
          lastModifiedAt: createdAt,
          lastReadAt: null,
          mute: null,
          pinned: false,
          archived: false
=======
          type: "group",
          title: title,
          photoUrl: "",
          createdBy: myUserId,
          createdAt: createdAt,
          lastMessageText: "",
          lastMessageAt: null,
          lastMessageSenderId: null,
>>>>>>> bf2fe1b (Fix memberships required fields)
        },
        [
          ...convReadPerms(ids),
          Permission.update(Role.user(myUserId)),
          Permission.delete(Role.user(myUserId)),
        ]
      );

<<<<<<< HEAD
     for (const uid of ids) {
      await db.createDocument(
        databaseId,
        membershipsId,
        ID.unique(),
        {
          membershipId: nextMembershipId(),
          conversationId: conv.$id,
          userId: String(uid),
          teamId: 1,
          role: uid === myUserId ? "admin" : "member",
          membershipStatus: "active",
          joinedAt: createdAt,
          lastModifiedAt: createdAt,
          lastReadAt: null,
          mute: null,
          pinned: false,
          archived: false
        },
        [Permission.read(Role.user(uid)), Permission.update(Role.user(uid))]
      );
    }
=======
      // Create memberships (must satisfy your required schema)
      for (const uid of ids) {
        const uidStr = String(uid);
        await db.createDocument(
          databaseId,
          membershipsId,
          ID.unique(),
          {
            membershipId: nextMembershipId(), // required integer
            userId: uidStr, // required string (now fixed)
            teamId: 1, // required integer in your schema (set a default)
            role: uidStr === myUserId ? ROLE_ADMIN : ROLE_MEMBER, // required enum
            membershipStatus: STATUS_ACTIVE, // required enum
            joinedAt: createdAt, // required datetime
            lastModifiedAt: createdAt,
            lastReadAt: null,
            conversationId: conv.$id, // string
            mute: null, // your schema shows mute is string
            pinned: false,
            archived: false,
          },
          [
            Permission.read(Role.user(uidStr)),
            Permission.update(Role.user(uidStr)),
          ]
        );
      }
>>>>>>> bf2fe1b (Fix memberships required fields)

      return json(res, { ok: true, conversation: conv });
    }

    /**
     * ====== ACTION: createDm ======
     * payload:
     * { otherEmail }
     */
    if (action === "createDm") {
      const otherEmail = reqStr(body.otherEmail, "otherEmail");
      const otherUserId = await userIdByEmail(users, otherEmail);

      if (!otherUserId) {
        return json(res, { ok: false, error: "User not found" }, 404);
      }

      const otherId = String(otherUserId);

      if (otherId === myUserId) {
        return json(res, { ok: false, error: "Cannot DM yourself" }, 400);
      }

      // Try reuse existing DM
      const myM = await db.listDocuments(databaseId, membershipsId, [
        Query.equal("userId", myUserId),
        Query.limit(200),
      ]);

      const myConvIds = new Set((myM.documents || []).map((d) => d.conversationId));

      const otherM = await db.listDocuments(databaseId, membershipsId, [
        Query.equal("userId", otherId),
        Query.limit(200),
      ]);

      const shared = (otherM.documents || []).find((d) =>
        myConvIds.has(d.conversationId)
      );

      if (shared) {
        const existing = await db.getDocument(
          databaseId,
          conversationsId,
          shared.conversationId
        );
        if (existing.type === "dm") {
          return json(res, { ok: true, conversation: existing, reused: true });
        }
      }

      const createdAt = nowIso();
      const ids = [myUserId, otherId];

      // Create conversation
      const conv = await db.createDocument(
        databaseId,
        conversationsId,
        ID.unique(),
        {
          type: "dm",
          title: "",
          photoUrl: "",
          createdBy: myUserId,
          createdAt: createdAt,
          lastMessageText: "",
          lastMessageAt: null,
          lastMessageSenderId: null,
        },
        [
          ...convReadPerms(ids),
          Permission.update(Role.user(myUserId)),
          Permission.delete(Role.user(myUserId)),
        ]
      );

      // Create memberships (must satisfy your required schema)
      for (const uid of ids) {
        const uidStr = String(uid);
        await db.createDocument(
          databaseId,
          membershipsId,
          ID.unique(),
          {
            membershipId: nextMembershipId(),
            userId: uidStr,
            teamId: 1,
            role: uidStr === myUserId ? ROLE_ADMIN : ROLE_MEMBER,
            membershipStatus: STATUS_ACTIVE,
            joinedAt: createdAt,
            lastModifiedAt: createdAt,
            lastReadAt: null,
            conversationId: conv.$id,
            mute: null,
            pinned: false,
            archived: false,
          },
          [
            Permission.read(Role.user(uidStr)),
            Permission.update(Role.user(uidStr)),
          ]
        );
      }

      return json(res, { ok: true, conversation: conv, reused: false });
    }

    /**
     * ====== ACTION: sendMessage ======
     * payload:
     * { conversationId, text }
     */
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
          conversationId: String(conversationId),
          senderId: myUserId,
          type: "text",
          text: text,
          createdAt: createdAt,
          status: "sent",
          deliveredAt: null,
          readAt: null,
        },
        [...msgReadPerms(memberIds), Permission.delete(Role.user(myUserId))]
      );

      await db.updateDocument(databaseId, conversationsId, String(conversationId), {
        lastMessageText: text,
        lastMessageAt: createdAt,
        lastMessageSenderId: myUserId,
      });

      return json(res, { ok: true, message: msg });
    }

    /**
     * ====== ACTION: markRead ======
     * payload:
     * { conversationId }
     */
    if (action === "markRead") {
      const conversationId = reqStr(body.conversationId, "conversationId");

      const r = await db.listDocuments(databaseId, membershipsId, [
        Query.equal("conversationId", String(conversationId)),
        Query.equal("userId", myUserId),
        Query.limit(1),
      ]);

      if (!r.documents || r.documents.length === 0) {
        return json(res, { ok: false, error: "Membership not found" }, 404);
      }

      const doc = r.documents[0];
      const updated = await db.updateDocument(databaseId, membershipsId, doc.$id, {
        lastReadAt: nowIso(),
        lastModifiedAt: nowIso(),
      });

      return json(res, { ok: true, membership: updated });
    }

    return json(res, { ok: false, error: "Unknown action" }, 400);
  } catch (e) {
    if (error) error(e);
    return json(
      res,
      { ok: false, error: String(e && e.message ? e.message : e) },
      500
    );
  }
};

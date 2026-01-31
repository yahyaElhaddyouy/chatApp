// const {
//   Client,
//   Account,
//   Databases,
//   Users,
//   ID,
//   Permission,
//   Role,
//   Query,
// } = require("node-appwrite");

// /**
//  * ====== EDIT THESE IF YOUR ENUM VALUES DIFFER ======
//  */
// const ROLE_ADMIN = "admin";
// const ROLE_MEMBER = "member";
// const STATUS_ACTIVE = "active";

// /**
//  * Simple JSON responder
//  */
// function json(res, body, status = 200) {
//   return res.json(body, status);
// }

// const nowIso = () => new Date().toISOString();

// /**
//  * Required string helper
//  */
// const reqStr = (v, name) => {
//   const s = (v ?? "").toString().trim();
//   if (!s) throw new Error(`${name} required`);
//   return s;
// };

// /**
//  * Generate unique integer membershipId (because your schema requires integer)
//  */
// let membershipSeq = 0;
// const nextMembershipId = () => {
//   membershipSeq = (membershipSeq + 1) % 1000;
//   return Date.now() * 1000 + membershipSeq; // integer unique
// };

// /**
//  * Find Auth userId by email using Users API
//  */
// async function userIdByEmail(users, email) {
//   const r = await users.list([Query.equal("email", email)]);
//   return r.users && r.users[0] ? r.users[0].$id : null;
// }

// module.exports = async ({ req, res, log, error }) => {
//   try {
//     const endpoint = process.env.APPWRITE_ENDPOINT;
//     const projectId = process.env.APPWRITE_PROJECT_ID;
//     const apiKey = process.env.APPWRITE_API_KEY;

//     if (!endpoint || !projectId || !apiKey) {
//       return json(res, { ok: false, error: "Missing env vars" }, 500);
//     }

//     // Provided when a logged-in user executes the function
//     const userJwt = req.headers["x-appwrite-user-jwt"] || "";
//     if (!userJwt) {
//       return json(res, { ok: false, error: "Not authenticated" }, 401);
//     }

//     // Parse JSON body (Flutter sends String body)
//     let body = {};
//     if (req.body) {
//       body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
//     }

//     const action = (body.action || "").toString().trim();

//     const databaseId = reqStr(body.databaseId, "databaseId");
//     const conversationsId = reqStr(
//       body.conversationsCollectionId,
//       "conversationsCollectionId"
//     );
//     const membershipsId = reqStr(
//       body.membershipsCollectionId,
//       "membershipsCollectionId"
//     );
//     const messagesId = reqStr(body.messagesCollectionId, "messagesCollectionId");

//     // User client (identify caller)
//     const userClient = new Client()
//       .setEndpoint(endpoint)
//       .setProject(projectId)
//       .setJWT(userJwt);

//     const me = await new Account(userClient).get();
//     const myUserId = String(me.$id);

//     // Admin client (write to DB)
//     const adminClient = new Client()
//       .setEndpoint(endpoint)
//       .setProject(projectId)
//       .setKey(apiKey);

//     const db = new Databases(adminClient);
//     const users = new Users(adminClient);

//     // Helper: check membership
//     const isMember = async (conversationId, userId) => {
//       const r = await db.listDocuments(databaseId, membershipsId, [
//         Query.equal("conversationId", String(conversationId)),
//         Query.equal("userId", String(userId)),
//         Query.limit(1),
//       ]);
//       return (r.documents || []).length > 0;
//     };

//     const membersOfConversation = async (conversationId) => {
//       const r = await db.listDocuments(databaseId, membershipsId, [
//         Query.equal("conversationId", String(conversationId)),
//         Query.limit(200),
//       ]);
//       return (r.documents || []).map((d) => String(d.userId));
//     };

//     const convReadPerms = (userIds) =>
//       userIds.map((uid) => Permission.read(Role.user(String(uid))));

//     const msgReadPerms = (userIds) =>
//       userIds.map((uid) => Permission.read(Role.user(String(uid))));

//     /**
//      * ====== ACTION: createGroup ======
//      * payload:
//      * { title, memberEmails: [] }
//      */
//     if (action === "createGroup") {
//       const title = reqStr(body.title, "title");
//       const memberEmails = Array.isArray(body.memberEmails)
//         ? body.memberEmails
//         : [];

//       const memberIdsSet = new Set([myUserId]);

//       for (const email of memberEmails) {
//         const e = (email || "").toString().trim();
//         if (!e) continue;
//         const uid = await userIdByEmail(users, e);
//         if (uid) memberIdsSet.add(String(uid));
//       }

//       const ids = Array.from(memberIdsSet);
//       const createdAt = nowIso();

//       // Create conversation
//       const conv = await db.createDocument(
//         databaseId,
//         conversationsId,
//         ID.unique(),
//         {
//           type: "group",
//           title: title,
//           photoUrl: "",
//           createdBy: myUserId,
//           createdAt: createdAt,
//           lastMessageText: "",
//           lastMessageAt: null,
//           lastMessageSenderId: null,
//         },
//         [
//           ...convReadPerms(ids),
//           Permission.update(Role.user(myUserId)),
//           Permission.delete(Role.user(myUserId)),
//         ]
//       );

//       // Create memberships (must satisfy your required schema)
//       for (const uid of ids) {
//         const uidStr = String(uid);
//         await db.createDocument(
//           databaseId,
//           membershipsId,
//           ID.unique(),
//           {
//             membershipId: nextMembershipId(), // required integer
//             userId: uidStr, // required string (now fixed)
//             teamId: 1, // required integer in your schema (set a default)
//             role: uidStr === myUserId ? ROLE_ADMIN : ROLE_MEMBER, // required enum
//             membershipStatus: STATUS_ACTIVE, // required enum
//             joinedAt: createdAt, // required datetime
//             lastModifiedAt: createdAt,
//             lastReadAt: null,
//             conversationId: conv.$id, // string
//             mute: null, // your schema shows mute is string
//             pinned: false,
//             archived: false,
//           },
//           [
//             Permission.read(Role.user(uidStr)),
//             Permission.update(Role.user(uidStr)),
//           ]
//         );
//       }

//       return json(res, { ok: true, conversation: conv });
//     }

//     /**
//      * ====== ACTION: createDm ======
//      * payload:
//      * { otherEmail }
//      */
//     if (action === "createDm") {
//       const otherEmail = reqStr(body.otherEmail, "otherEmail");
//       const otherUserId = await userIdByEmail(users, otherEmail);

//       if (!otherUserId) {
//         return json(res, { ok: false, error: "User not found" }, 404);
//       }

//       const otherId = String(otherUserId);

//       if (otherId === myUserId) {
//         return json(res, { ok: false, error: "Cannot DM yourself" }, 400);
//       }

//       // Try reuse existing DM
//       const myM = await db.listDocuments(databaseId, membershipsId, [
//         Query.equal("userId", myUserId),
//         Query.limit(200),
//       ]);

//       const myConvIds = new Set((myM.documents || []).map((d) => d.conversationId));

//       const otherM = await db.listDocuments(databaseId, membershipsId, [
//         Query.equal("userId", otherId),
//         Query.limit(200),
//       ]);

//       const shared = (otherM.documents || []).find((d) =>
//         myConvIds.has(d.conversationId)
//       );

//       if (shared) {
//         const existing = await db.getDocument(
//           databaseId,
//           conversationsId,
//           shared.conversationId
//         );
//         if (existing.type === "dm") {
//           return json(res, { ok: true, conversation: existing, reused: true });
//         }
//       }

//       const createdAt = nowIso();
//       const ids = [myUserId, otherId];

//       // Create conversation
//       const conv = await db.createDocument(
//         databaseId,
//         conversationsId,
//         ID.unique(),
//         {
//           type: "dm",
//           title: "",
//           photoUrl: "",
//           createdBy: myUserId,
//           createdAt: createdAt,
//           lastMessageText: "",
//           lastMessageAt: null,
//           lastMessageSenderId: null,
//         },
//         [
//           ...convReadPerms(ids),
//           Permission.update(Role.user(myUserId)),
//           Permission.delete(Role.user(myUserId)),
//         ]
//       );

//       // Create memberships (must satisfy your required schema)
//       for (const uid of ids) {
//         const uidStr = String(uid);
//         await db.createDocument(
//           databaseId,
//           membershipsId,
//           ID.unique(),
//           {
//             membershipId: nextMembershipId(),
//             userId: uidStr,
//             teamId: 1,
//             role: uidStr === myUserId ? ROLE_ADMIN : ROLE_MEMBER,
//             membershipStatus: STATUS_ACTIVE,
//             joinedAt: createdAt,
//             lastModifiedAt: createdAt,
//             lastReadAt: null,
//             conversationId: conv.$id,
//             mute: null,
//             pinned: false,
//             archived: false,
//           },
//           [
//             Permission.read(Role.user(uidStr)),
//             Permission.update(Role.user(uidStr)),
//           ]
//         );
//       }

//       return json(res, { ok: true, conversation: conv, reused: false });
//     }

//     /**
//      * ====== ACTION: sendMessage ======
//      * payload:
//      * { conversationId, text }
//      */
//     if (action === "sendMessage") {
//       const conversationId = reqStr(body.conversationId, "conversationId");
//       const text = reqStr(body.text, "text");

//       if (!(await isMember(conversationId, myUserId))) {
//         return json(res, { ok: false, error: "Not a member" }, 403);
//       }

//       const memberIds = await membersOfConversation(conversationId);
//       const createdAt = nowIso();

//       const msg = await db.createDocument(
//         databaseId,
//         messagesId,
//         ID.unique(),
//         {
//           conversationId: String(conversationId),
//           senderId: myUserId,
//           type: "text",
//           text: text,
//           createdAt: createdAt,
//           status: "sent",
//           deliveredAt: null,
//           readAt: null,
//         },
//         [...msgReadPerms(memberIds), Permission.delete(Role.user(myUserId))]
//       );

//       await db.updateDocument(databaseId, conversationsId, String(conversationId), {
//         lastMessageText: text,
//         lastMessageAt: createdAt,
//         lastMessageSenderId: myUserId,
//       });

//       return json(res, { ok: true, message: msg });
//     }

//     /**
//      * ====== ACTION: markRead ======
//      * payload:
//      * { conversationId }
//      */
//     if (action === "markRead") {
//       const conversationId = reqStr(body.conversationId, "conversationId");

//       const r = await db.listDocuments(databaseId, membershipsId, [
//         Query.equal("conversationId", String(conversationId)),
//         Query.equal("userId", myUserId),
//         Query.limit(1),
//       ]);

//       if (!r.documents || r.documents.length === 0) {
//         return json(res, { ok: false, error: "Membership not found" }, 404);
//       }

//       const doc = r.documents[0];
//       const updated = await db.updateDocument(databaseId, membershipsId, doc.$id, {
//         lastReadAt: nowIso(),
//         lastModifiedAt: nowIso(),
//       });

//       return json(res, { ok: true, membership: updated });
//     }

//     return json(res, { ok: false, error: "Unknown action" }, 400);
//   } catch (e) {
//     if (error) error(e);
//     return json(
//       res,
//       { ok: false, error: String(e && e.message ? e.message : e) },
//       500
//     );
//   }
// };


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
  // Cherche membership: conversationId + userId
  const list = await db.listDocuments(
    databaseId,
    membershipsCol,
    [
      sdk.Query.equal("conversationId", conversationId),
      sdk.Query.equal("userId", userId),
      sdk.Query.limit(1)
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

    // =========================
    // ACTION: createDm
    // =========================
    if (action === "createDm") {
      const otherEmail = asString(body.otherEmail).trim().toLowerCase();
      if (!otherEmail) return json(res, 400, { ok: false, code: "MISSING_OTHER_EMAIL" });

      // 1) trouver l'autre user par email
      const userList = await users.list([sdk.Query.equal("email", otherEmail), sdk.Query.limit(1)]);
      if (!userList.users || userList.users.length === 0) {
        return json(res, 404, { ok: false, code: "USER_NOT_FOUND" });
      }
      const otherUser = userList.users[0];

      // 2) prendre l'utilisateur appelant via header x-appwrite-user-id
      // Appwrite Functions ajoute souvent cet header en exécution via SDK
      const meId = asString(req.headers?.["x-appwrite-user-id"] || req.headers?.["X-Appwrite-User-Id"]).trim();
      if (!meId) return json(res, 401, { ok: false, code: "NO_AUTH_USER" });

      if (meId === otherUser.$id) {
        return json(res, 400, { ok: false, code: "CANNOT_DM_SELF" });
      }

      // 3) (simple) créer une conversation DM à chaque fois
      // (tu peux optimiser plus tard en “reuse” si existe déjà)
      const convoPerms = [
        `read("user:${meId}")`,
        `read("user:${otherUser.$id}")`,
        `update("user:${meId}")`,
        `update("user:${otherUser.$id}")`,
        `delete("user:${meId}")`,
        `delete("user:${otherUser.$id}")`,
      ];

      const nowIso = new Date().toISOString();

      const conversation = await db.createDocument(
        databaseId,
        conversationsCol,
        sdk.ID.unique(),
        {
          type: "dm",
          title: "",
          photoUrl: "",
          createdBy: meId,
          createdAt: nowIso,
          lastMessageText: "",
          lastMessageAt: null,
          lastMessageSenderId: null,
        },
        convoPerms
      );

      // 4) memberships (2 docs)
      const memberPerms = convoPerms;

      await db.createDocument(
        databaseId,
        membershipsCol,
        sdk.ID.unique(),
        {
          conversationId: conversation.$id,
          userId: meId,
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
          conversationId: conversation.$id,
          userId: otherUser.$id,
          role: "member",
          joinedAt: nowIso,
          lastReadAt: null,
        },
        memberPerms
      );

      return json(res, 200, {
        ok: true,
        conversation,
        reused: false,
      });
    }

    // =========================
    // ACTION: sendMessage
    // =========================
    if (action === "sendMessage") {
      const conversationId = asString(body.conversationId).trim();
      const text = asString(body.text).trim();

      const senderId = asString(req.headers?.["x-appwrite-user-id"] || req.headers?.["X-Appwrite-User-Id"]).trim();

      if (!senderId) return json(res, 401, { ok: false, code: "NO_AUTH_USER" });
      if (!conversationId || !text) return json(res, 400, { ok: false, code: "MISSING_FIELDS" });
      if (text.length > 2000) return json(res, 400, { ok: false, code: "TEXT_TOO_LONG" });

      // Vérifier membership
      await assertMember(db, databaseId, membershipsCol, conversationId, senderId);

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
          senderId,
          text,
          createdAt: nowIso,
        },
        convo.$permissions
      );

      // Update conversation last message
      await db.updateDocument(databaseId, conversationsCol, conversationId, {
        lastMessageText: text,
        lastMessageAt: nowIso,
        lastMessageSenderId: senderId,
      });

      // Update membership lastReadAt (sender)
      // (facultatif mais utile)
      const m = await db.listDocuments(
        databaseId,
        membershipsCol,
        [
          sdk.Query.equal("conversationId", conversationId),
          sdk.Query.equal("userId", senderId),
          sdk.Query.limit(1)
        ]
      );
      if (m.documents && m.documents.length > 0) {
        await db.updateDocument(databaseId, membershipsCol, m.documents[0].$id, {
          lastReadAt: nowIso
        });
      }

      return json(res, 200, { ok: true, message });
    }

    // =========================
    // ACTION: markRead
    // =========================
    if (action === "markRead") {
      const conversationId = asString(body.conversationId).trim();
      const userId = asString(req.headers?.["x-appwrite-user-id"] || req.headers?.["X-Appwrite-User-Id"]).trim();

      if (!userId) return json(res, 401, { ok: false, code: "NO_AUTH_USER" });
      if (!conversationId) return json(res, 400, { ok: false, code: "MISSING_CONVERSATION_ID" });

      const nowIso = new Date().toISOString();

      const list = await db.listDocuments(
        databaseId,
        membershipsCol,
        [
          sdk.Query.equal("conversationId", conversationId),
          sdk.Query.equal("userId", userId),
          sdk.Query.limit(1)
        ]
      );

      if (!list.documents || list.documents.length === 0) {
        return json(res, 403, { ok: false, code: "NOT_A_MEMBER" });
      }

      await db.updateDocument(databaseId, membershipsCol, list.documents[0].$id, {
        lastReadAt: nowIso
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
